/* ===========================================================================
 * check_text.js —— 静态文本/公式抄写一致性自检
 *
 * 为什么需要它：
 *   页面末尾的「公式自检」只验**数值关系**（r₁ = R₂/(1+Q²) 等），
 *   但**公式块里印出来的符号**（R₂X₂² 还是 R₂²X₂）是静态 HTML，
 *   抄错时数值自检照样全绿。本脚本直接从**构建后的页面**里抓公式块文本，
 *   与「必须出现 / 不得出现」的片段比对，把符号抄错当场抓出来。
 *
 * 为什么读「构建后页面」而不是 parts 源文件：
 *   源文件里分式是 \frac{分子}{分母} 宏；构建后是 <span class="frac"> 堆叠结构。
 *   直接查构建产物 = 直接查用户看到的那个东西，宏渲染有 bug 也能被本脚本抓到。
 *
 * 分式感知提取（关键）：
 *   堆叠分式的分母若含顶层 +/−，线性化时必须补括号，否则
 *   “R₂²+X₂²” 会被读成 “R₂² + X₂²” 而误判抄写错误。
 *   故 linearFrac() 会在必要时给分子/分母加括号，得到的线性串
 *   正是教材排版里手写的样子：R₂·jX₂/(R₂+jX₂)。
 *
 * 用法：node check_text.js
 * 退出码：0 = 全部通过
 * =========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');

const VIZ = path.join(__dirname, '..', 'viz');

/* 规则：在某个**构建后页面**里定位 id，检查其内部文本必须/不得包含某些片段。
 *   page   —— viz 下的页面文件名（关键字匹配，唯一命中即可）
 *   id     —— 公式块的 id
 *   pageText —— true 时改为检查**整页文本**（先去掉 <script> 段再剥标签）
 *   need   —— 必须出现的片段（去掉空白后比对）
 *   forbid —— 不得出现的片段（去掉空白后比对）
 */
const RULES = [
  /* 通信原理：逐章回填「必须出现/不得出现」抄写规则（照通信电路的写法，
     page 用 原理讲解_N.M_ 前缀定位构建页，id 用公式块 id，need/forbid 去空白比对）。
     全站禁项扫描（文件下方）与 RULES 无关，始终生效。 */
];

/* ---------------------------------------------------------------------------
 * 极简 HTML 解析（只关心 span/div 等容器与文本）
 * ------------------------------------------------------------------------- */
const VOID = new Set(['br', 'img', 'hr', 'input', 'meta', 'link']);

function parseAttrs(s) {
  const attrs = {};
  const re = /([:\w-]+)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    const key = m[1].toLowerCase();
    const val = m[2] !== undefined ? m[2] : (m[3] !== undefined ? m[3] : (m[4] !== undefined ? m[4] : ''));
    attrs[key] = val;
  }
  return attrs;
}

/* 返回 {nodes, end}；nodes 为 [{tag, attrs, children} | {text}] */
function parseNodes(html, start, stopTag) {
  const nodes = [];
  let i = start || 0;
  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt < 0) { if (i < html.length) nodes.push({ text: html.slice(i) }); break; }
    if (lt > i) nodes.push({ text: html.slice(i, lt) });

    /* 注释 / CDATA */
    if (html.startsWith('<!--', lt)) {
      const e = html.indexOf('-->', lt);
      i = e < 0 ? html.length : e + 3;
      continue;
    }
    const gt = html.indexOf('>', lt);
    if (gt < 0) { nodes.push({ text: html.slice(lt) }); break; }
    const raw = html.slice(lt + 1, gt);
    i = gt + 1;

    if (raw.startsWith('/')) {
      const ct = raw.slice(1).trim().toLowerCase();
      /* own=true  : 闭合的就是本层元素自身 → 调用者可以继续往下解析
       * own=false : 闭合的是祖先标签 → 把控制权交回祖先 */
      if (stopTag && ct === stopTag) return { nodes: nodes, end: i, closed: ct, own: true };
      return { nodes: nodes, end: lt, closed: ct, own: false };
    }
    const m = /^([a-zA-Z][\w:-]*)/.exec(raw);
    if (!m) continue;                       /* 裸 '<'，当文本 */
    const tag = m[1].toLowerCase();
    const attrs = parseAttrs(raw.slice(m[1].length));
    if (VOID.has(tag) || raw.endsWith('/')) {
      nodes.push({ tag: tag, attrs: attrs, children: [] });
      continue;
    }
    const sub = parseNodes(html, i, tag);
    nodes.push({ tag: tag, attrs: attrs, children: sub.nodes });
    i = sub.end;
    if (sub.closed && !sub.own) {
      /* 子层遇到的是祖先的闭合标签 → 本层也要停在这里 */
      return { nodes: nodes, end: sub.end, closed: sub.closed, own: false };
    }
  }
  return { nodes: nodes, end: i };
}

function hasClass(node, cls) {
  const c = node.attrs && node.attrs.class;
  if (!c) return false;
  return c.split(/\s+/).indexOf(cls) >= 0;
}

function childByClass(node, cls) {
  for (const c of (node.children || [])) {
    if (c.tag && hasClass(c, cls)) return c;
  }
  return null;
}

/* ---------------------------------------------------------------------------
 * 分式感知文本提取
 * ------------------------------------------------------------------------- */
const OPS = '\u002B\u2212\u00B1';   /* + − ± */

/* 顶层是否有加减运算符（括号内不算） */
function hasTopLevelAdd(s) {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') depth--;
    else if (depth === 0 && OPS.indexOf(ch) >= 0) return true;
  }
  return false;
}

/* 线性化一个分式：分母/分子含顶层加减时补括号 */
function linearFrac(num, den) {
  const n = hasTopLevelAdd(num) ? '(' + num + ')' : num;
  const d = hasTopLevelAdd(den) ? '(' + den + ')' : den;
  return n + '/' + d;
}

/* 「真下标」改造后，下划线以 <span style="font-size:0">_</span> 留在 DOM 里
 * （零宽保留 → textContent 逐字不变，页末自检的 txtguard 不用改）。
 * 但下划线**不是可见文字** —— 抄写比对要的是教材的线性写法（如 R′L、不是 R′_L），
 * 所以提取文本时必须跳过零宽元素。 */
function isZeroWidth(node) {
  if (!node || node.tag !== 'span') return false;
  const st = node.attrs && node.attrs.style;
  if (!st) return false;
  return /font-size\s*:\s*0(\.0+)?(px|em|%)?\s*(;|$)/i.test(st);
}

function textOf(node) {
  if (isZeroWidth(node)) return '';            /* 零宽下划线：不参与抄写比对 */
  if (node.text !== undefined) return node.text;
  if (node.tag === 'span' && hasClass(node, 'frac')) {
    const fn = childByClass(node, 'fn');
    const fd = childByClass(node, 'fd');
    if (!fn || !fd) return (node.children || []).map(textOf).join('');
    return linearFrac(textOf(fn), textOf(fd));
  }
  if (node.tag === 'span' && hasClass(node, 'sqrt')) {
    const rad = childByClass(node, 'rad');
    if (!rad) return (node.children || []).map(textOf).join('');
    return '\u221A(' + textOf(rad) + ')';
  }
  return (node.children || []).map(textOf).join('');
}

/* 找到带指定 id 的元素，返回它的子节点数组 */
function findById(nodes, id) {
  for (const n of nodes) {
    if (!n.tag) continue;
    if (n.attrs && n.attrs.id === id) return n.children || [];
    const hit = findById(n.children || [], id);
    if (hit) return hit;
  }
  return null;
}

/* 从整页 HTML 里切出 id 对应元素的**内部 HTML**。
 * 不对整页做 DOM 树解析：页面里的大段 <script> 含 '<' 字符，会把朴素解析器带偏。
 * 定位到 id 后只解析该元素的内部片段（.formula 块内没有 script）。 */
function extractInner(html, id) {
  let at = html.indexOf('id="' + id + '"');
  if (at < 0) at = html.indexOf("id='" + id + "'");
  if (at < 0) return null;
  const lt = html.lastIndexOf('<', at);
  if (lt < 0) return null;
  const tm = /^<([a-zA-Z][\w:-]*)/.exec(html.slice(lt, lt + 40));
  if (!tm) return null;
  const tag = tm[1].toLowerCase();
  const gt = html.indexOf('>', at);
  if (gt < 0) return null;
  const start = gt + 1;

  /* 配平同名的开/闭标签，取真正的闭合位置 */
  const openRe = new RegExp('<' + tag + '\\b', 'ig');
  const closeRe = new RegExp('</' + tag + '\\s*>', 'ig');
  let depth = 1, pos = start, closeStart = -1;
  while (depth > 0) {
    closeRe.lastIndex = pos;
    const c = closeRe.exec(html);
    if (!c) return null;                      /* 没闭合：当作截断 */
    openRe.lastIndex = pos;
    let o, opens = 0;
    while ((o = openRe.exec(html)) !== null) {
      if (o.index >= c.index) break;
      opens++;
    }
    depth += opens - 1;
    pos = c.index + c[0].length;
    closeStart = c.index;
  }
  if (closeStart < 0) return null;
  return html.slice(start, closeStart);
}

/* 抽取元素文本：去实体、去所有空白 */
function extractText(nodes) {
  let t = textOf({ tag: 'x', attrs: {}, children: nodes });
  t = t
    .replace(/&nbsp;/gi, ' ')
    .replace(/&middot;/gi, '\u00B7')
    .replace(/&times;/gi, '\u00D7')
    .replace(/&minus;/gi, '\u2212')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/&#(\d+);/g, function (m, d) { return String.fromCharCode(+d); })
    .replace(/&#x([0-9a-f]+);/gi, function (m, hx) { return String.fromCharCode(parseInt(hx, 16)); })
    .replace(/\s+/g, '');
  return t;
}

/* ---------------------------------------------------------------------------
 * 执行规则
 * ------------------------------------------------------------------------- */
function findPage(key) {
  const files = fs.readdirSync(VIZ).filter(function (f) {
    return f.endsWith('.html') && f.indexOf(key) >= 0;
  });
  if (files.length === 0) return null;
  if (files.length > 1) {
    console.log('  [WARN] 页面关键字「' + key + '」命中 ' + files.length + ' 个文件，取第一个：' + files[0]);
  }
  return path.join(VIZ, files[0]);
}

let fail = 0, pass = 0;
const usedPages = {};

for (const rule of RULES) {
  console.log('\n=== ' + rule.page + '  #' + (rule.pageText ? '整页' : rule.id) + ' ===');
  const file = findPage(rule.page);
  if (!file) {
    console.log('  [FAIL] 找不到页面文件: viz/*' + rule.page + '*.html');
    fail++; continue;
  }
  usedPages[file] = true;
  const html = fs.readFileSync(file, 'utf8');

  let txt;
  if (rule.pageText) {
    /* 整页文本：先去掉 <script> 段（JS 里的字符串会污染比对）、
       再去掉「真下标」的零宽下划线 span（不是可见文字），最后剥标签 */
    txt = html
      .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
      .replace(/<span\b[^>]*style\s*=\s*"[^"]*font-size\s*:\s*0(?:\.0+)?(?:px|em|%)?[^"]*"[^>]*>[\s\S]*?<\/span>/gi, ' ')
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&middot;/gi, '\u00B7')
      .replace(/&times;/gi, '\u00D7')
      .replace(/&minus;/gi, '\u2212')
      .replace(/&amp;/gi, '&')
      .replace(/&#(\d+);/g, function (m, d) { return String.fromCharCode(+d); })
      .replace(/\s+/g, '');
  } else {
    const inner = extractInner(html, rule.id);
    if (inner === null) {
      console.log('  [FAIL] 找不到 id="' + rule.id + '" 的元素');
      fail++; continue;
    }
    txt = extractText(parseNodes(inner, 0).nodes);
  }
  console.log(txt.length <= 400 ? '  文本: ' + txt : '  文本长度: ' + txt.length + '（整页，略）');
  (rule.need || []).forEach(function (frag) {
    const ok = txt.indexOf(frag) >= 0;
    console.log((ok ? '  [PASS] ' : '  [FAIL] ') + '必须包含「' + frag + '」');
    ok ? pass++ : fail++;
  });
  (rule.forbid || []).forEach(function (frag) {
    const bad = txt.indexOf(frag) >= 0;
    console.log((bad ? '  [FAIL] ' : '  [PASS] ') + '不得包含「' + frag + '」');
    bad ? fail++ : pass++;
  });
}

console.log('\n--------------------------------------------');
console.log('检查页面数：' + Object.keys(usedPages).length);

/* ---------------------------------------------------------------------------
 * 全站禁项扫描（对 viz/ 下每一个页面都扫，不依赖 RULES）
 *
 * 交付标准第 6 条：页面必须自包含 —— 不引外部图片/字体/CSS/JS/CDN，
 * 不用 MathJax/KaTeX，禁 Math.random()（本机 Node 里它返回常量）。
 * 这些禁项用「有就一定错」的方式判定，比逐节抄写规则更稳，
 * 而且新章节的页面一落盘就自动纳入检查。
 * ------------------------------------------------------------------------- */
const FORBID_ALL = [
  'MathJax', 'KaTeX', 'mathjax', 'katex',
  'cdn.jsdelivr.net', 'unpkg.com', 'cdnjs.cloudflare.com', 'fonts.googleapis.com',
  'Math.random(',
  '<script src=', '<link rel="stylesheet"', '@import'
];

/* 工程计数法取单位的错误写法：{…}[String(e)] || ('10^'+e)。
 * e = 0 时单位是空串 ''（有效值），|| 会把它当缺省 → 页面上出现
 * 「400.000 10^0」「20.00 e0Hz」这类明显不对的单位串。
 * 这条按「源码里有就一定错」判定 —— 该串是运行时才生成的，
 * 静态正文扫不到，只能从源码写法上拦住。 */
const FORBID_RE_SRC = [
  { name: '工程计数法取单位写法', re: /\[\s*String\(\s*e\w*\s*\)\s*\]\s*\|\|\s*\(/g }
];

/* 排版残留（正则型）：这两类是「有就一定错」——
 *   ① 未渲染的反斜杠命令：math.js 已覆盖希腊字母/大算符/运算符，
 *      产物里若还出现 \omega \theta \int \left，说明宏没被渲染，
 *      页面上会 literally 显示 "\omega" 这种乱字符。
 *   ② 多余右花括号：紧跟在 </span> / </sup> / </sub> 之后的孤立 '}'，
 *      一定是源文件多写的笔误（{…} 分组括号、{·} 省略记号都不紧跟闭合标签）。
 *   ③ 工程计数法单位回退：lib.js 的 eng() 用 {…}[String(e)] || ('10^'+e) 取单位，
 *      而 e = 0 时单位是空串 ''（有效值），|| 会把它当缺省 → 页面上出现
 *      「400.000 10^0」「20.00 e0Hz」这类明显不对的单位串。
 * 判定前先剥掉 <script>/<style>：JS 里的正则与转义不算排版残留。 */
const FORBID_RE = [
  { name: '未渲染的反斜杠命令', re: /\\[a-zA-Z]{2,}/g },
  { name: '多余右花括号', re: /<\/(?:span|sup|sub|b|i)>\}/g },
  { name: '工程计数法单位回退', re: /(?:\d|\.)\s*(?:10\^0|e0)(?![a-z0-9])/g }
];

console.log('\n=== 全站禁项扫描 ===');
const vizFiles = fs.readdirSync(VIZ).filter(function (f) { return f.endsWith('.html'); }).sort();
let fFail = 0, fPass = 0;
for (const f of vizFiles) {
  const src = fs.readFileSync(path.join(VIZ, f), 'utf8');
  const bad = FORBID_ALL.filter(function (frag) { return src.indexOf(frag) >= 0; });
  /* 排版残留只看可见文本（去掉 script/style） */
  const visible = src.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
  FORBID_RE.forEach(function (rule) {
    rule.re.lastIndex = 0;
    const hit = rule.re.exec(visible);
    if (hit) {
      const line = visible.slice(0, hit.index).split('\n').length;
      bad.push(rule.name + '（第' + line + '行：' + visible.slice(Math.max(0, hit.index - 30), hit.index + 24).replace(/\s+/g, ' ') + '）');
      rule.re.lastIndex = 0;
    }
  });
  /* 源码级写法禁项：扫整份源码（含 <script>） */
  FORBID_RE_SRC.forEach(function (rule) {
    rule.re.lastIndex = 0;
    const hit = rule.re.exec(src);
    if (hit) {
      const line = src.slice(0, hit.index).split('\n').length;
      bad.push(rule.name + '（第' + line + '行：' + src.slice(Math.max(0, hit.index - 30), hit.index + 24).replace(/\s+/g, ' ') + '）');
      rule.re.lastIndex = 0;
    }
  });
  if (bad.length) {
    console.log('  [FAIL] ' + f + '  命中禁项：' + bad.join('、'));
    fFail++;
  } else {
    console.log('  [PASS] ' + f + '  无外部资源 / 无 MathJax·KaTeX / 无 Math.random / 无排版残留');
    fPass++;
  }
}
console.log('  —— 扫描 ' + vizFiles.length + ' 个页面，PASS ' + fPass + '，FAIL ' + fFail);
fail += fFail;
pass += fPass;

/* ---------------------------------------------------------------------------
 * setText() 混入 HTML 标签的源码级守卫
 *
 * setText() 走的是 textContent —— 往参数里塞 <b>/<span> 之类的标签，
 * 页面上会把标签当**纯文本**原样打印出来（「工作频率<b>全都锁定…</b>」）。
 * 这类残留只在 <script> 段里，剥掉 script 后就看不见了。
 *
 * 为什么不能用一条正则扫全源码：
 *   合法的写法是  el.innerHTML = '<b>' + fx(x) + '</b>';   （要的就是标签）
 *   错误的写法是  setText('id', '<b>全都锁定在 ' + fx(x));  （标签会原样显示）
 * 两者在源码里长得几乎一样，**只有区分开 setText 与 innerHTML 才能判**。
 * 所以这里做括号配平，把每个 setText(...) 的完整实参取出来单独判。
 * ------------------------------------------------------------------------- */
function findCalls(src, name) {
  const out = [];
  let i = 0;
  while (true) {
    const at = src.indexOf(name + '(', i);
    if (at < 0) break;
    const prev = src.charAt(at - 1);
    if (/[A-Za-z0-9_$]/.test(prev)) { i = at + name.length + 1; continue; }  /* 不是函数调用 */
    let j = at + name.length + 1, depth = 1, q = null;
    while (j < src.length && depth > 0) {
      const c = src.charAt(j);
      if (q) {
        if (c === '\\') { j += 2; continue; }
        if (c === q) q = null;
      } else if (c === '"' || c === "'" || c === '`') q = c;
      else if (c === '(') depth++;
      else if (c === ')') depth--;
      j++;
    }
    out.push({ text: src.slice(at, j), index: at });
    i = j;
  }
  return out;
}

/* 字符串字面量以无属性标签开头、且标签后面还有内容 → 会被当纯文本打印 */
const TAG_IN_TEXT = /['"]<(?:b|i|span|sub|sup|em|strong|u|a)>[^'"]/;

console.log('\n=== setText 混入 HTML 标签扫描（源码级） ===');
let tFail = 0, tPass = 0;
for (const f of vizFiles) {
  const src = fs.readFileSync(path.join(VIZ, f), 'utf8');
  const hits = findCalls(src, 'setText').filter(function (c) { return TAG_IN_TEXT.test(c.text); });
  if (hits.length) {
    tFail++;
    const line = src.slice(0, hits[0].index).split('\n').length;
    console.log('  [FAIL] ' + f + '  setText 调用里有 HTML 标签（第' + line + ' 行）');
    console.log('         ' + hits[0].text.replace(/\s+/g, ' ').slice(0, 150));
  } else {
    tPass++;
  }
}
console.log('  —— 扫描 ' + vizFiles.length + ' 个页面，PASS ' + tPass + '，FAIL ' + tFail);
fail += tFail;
pass += tPass;

console.log('\n--------------------------------------------');
console.log('汇总：PASS ' + pass + ' 条，FAIL ' + fail + ' 条');
process.exit(fail ? 1 : 0);
