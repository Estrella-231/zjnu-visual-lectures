/* ===========================================================================
 * fracify.js —— 把片段里的「斜杠线性分式」改写成宏语法（构建期一次性迁移）
 *
 *   斜杠写法（页面旧样式）        →   宏写法（渲染成堆叠分式）
 *   1/(2π√(LC))                   →   \frac{1}{2π\sqrt{LC}}
 *   (1/r)√(L/C)                   →   (\frac{1}{r})\sqrt{\frac{L}{C}}
 *   R₂/(R₂²+X₂²)                  →   \frac{R₂}{R₂²+X₂²}
 *   X₂/(1 + X₂²/R₂²)              →   \frac{X₂}{(1 + \frac{X₂²}{R₂²})}
 *
 * 括号规则（照教材式 (2-6)(2-12) 的排版）：
 *   分式的分子/分母若原本带外层括号，则在**不含嵌套分式**时去掉外括号
 *   （分式横线本身已经起到分组作用）；含嵌套分式时保留括号，避免歧义。
 *
 * 只处理下列区域，避免误伤正文里的「图 2-5 / 图 2-6」这类斜杠：
 *   <div class="formula">…</div>   <td>…</td>
 *   <span class="kv">…</span>       <span class="mono">…</span>
 *
 * 用法：
 *   node fracify.js            干跑，只打印「改前 → 改后」对照，不写文件
 *   node fracify.js --apply    确认无误后写入 parts/*.html
 * =========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, 'parts');
const APPLY = process.argv.indexOf('--apply') >= 0;

/* ---------- 词法 ---------- */
/* 原子字符：数字、拉丁字母（含扩展：İ Û Ȧ Ṗ 等相量记号）、希腊字母、
   上下标数字、组合记号（U̇ 里的点）、间隔号、撇号、小数点、下划线。
   运算符（+ − = < > | 等）不在其中。
   注意：'|' 故意**不**算原子，否则 |Ȧu/Ȧu0| 会被拆错。 */
const ATOM_CH = /[0-9A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u024F\u0370-\u03FF\u1E00-\u1EFF\u1F00-\u1FFF\u00B2\u00B3\u00B9\u2080-\u2089\u2070-\u207F\u00B7\u2032\u2033\u00D7\u2219\u0300-\u036F._]/;

/* HTML 实体（&#775; &nbsp; …）算作原子的一部分 */
function entityAt(s, i) {
  const m = /^&#?\w+;/.exec(s.slice(i));
  return m ? m[0].length : 0;
}

/* 原子串结束位置（可能带 <sub>/<sup> 尾巴、HTML 实体） */
function atomEnd(s, i) {
  let j = i;
  for (;;) {
    const ms = /^<(sub|sup)>[\s\S]*?<\/\1>/.exec(s.slice(j));
    if (ms) { j += ms[0].length; continue; }
    const ent = entityAt(s, j);
    if (ent) { j += ent; continue; }
    if (j < s.length && ATOM_CH.test(s[j])) { j++; continue; }
    break;
  }
  return j;
}

function matchParen(s, i) {
  const depth = 0;
  let d = 0;
  const open = s[i], close = s[i] === '(' ? ')' : ']';
  for (let j = i; j < s.length; j++) {
    if (s[j] === open) d++;
    else if (s[j] === close) { d--; if (d === 0) return { end: j + 1 }; }
  }
  return { end: s.length };
}

function tokenize(s) {
  const toks = [];
  let i = 0, buf = '';
  const flush = () => { if (buf) { toks.push({ k: 't', v: buf }); buf = ''; } };
  while (i < s.length) {
    const c = s[i];
    if (c === '\u221A') {                                   /* √ 根号 */
      flush();
      let j = i + 1, inner;
      if (s[j] === '(') { const g = matchParen(s, j); inner = s.slice(j + 1, g.end - 1); i = g.end; }
      else { const e = atomEnd(s, j); inner = s.slice(j, e); i = e; }
      toks.push({ k: 'root', inner: inner });
      continue;
    }
    if (c === '(' || c === '[') {
      flush();
      const g = matchParen(s, i);
      toks.push({ k: 'grp', inner: s.slice(i + 1, g.end - 1), br: c });
      i = g.end; continue;
    }
    if (c === ')' || c === ']') { buf += c; i++; continue; }
    if (c === '<') {
      const ms = /^<(sub|sup)>[\s\S]*?<\/\1>/.exec(s.slice(i));
      if (ms) { flush(); toks.push({ k: 'a', v: ms[0] }); i += ms[0].length; continue; }
      /* 其它 HTML 标签整体当作文本，避免把 </span> 里的 '/' 当成除号 */
      const mt = /^<\/?[a-zA-Z][^>]*>/.exec(s.slice(i));
      if (mt) { flush(); toks.push({ k: 't', v: mt[0] }); i += mt[0].length; continue; }
      buf += c; i++; continue;
    }
    if (c === '/' || c === '\u2044') {                      /* 斜杠 / 分数斜线 */
      flush(); toks.push({ k: 'slash' }); i++; continue;
    }
    if (c === '&') {                                         /* HTML 实体算原子 */
      const ent = entityAt(s, i);
      if (ent) { flush(); toks.push({ k: 'a', v: s.slice(i, i + ent) }); i += ent; continue; }
    }
    if (ATOM_CH.test(c)) {
      let j = i; while (j < s.length && ATOM_CH.test(s[j])) j++;
      flush(); toks.push({ k: 'a', v: s.slice(i, j) }); i = j; continue;
    }
    buf += c; i++;
  }
  flush();
  return toks;
}

/* ---------- 渲染 ---------- */
function isExpAtom(v) { return /^<sup>/.test(v) || /[\u00B2\u00B3\u00B9]/.test(v); }
function isWs(t) { return t.k === 't' && t.v.trim() === ''; }

function convert(s) {
  const toks = tokenize(s);
  const out = [];
  let k = 0;
  while (k < toks.length) {
    const t = toks[k];
    if (t.k !== 'slash') { out.push(t); k++; continue; }

    /* 分子：向前取连续的 原子/根号/括号组。
       分子内部的空格留在分子里（1.38×10⁻²³ J/K 的单位空格不能丢），
       但分子两端的空格挪到分式外面（β₀ / (…) 的分隔空格不属于分子）。
       乘号「·」要特别判断：它可能是分子内部的连续乘积（U_cm·I_c1m），
       也可能是分式外面的乘号（½·(U_cm·I_c1m)/(V_CC·I_C0)）。
       判据：看「·」左边紧邻的 token —— 左边也是原子/根号/括号组就属于分子，否则分式从「·」处断开。 */
    const num = [];
    const lead = [];
    while (out.length) {
      const p = out[out.length - 1];
      if (p.k === 'a' && p.v === '\u00B7') {
        const below = out.length >= 2 ? out[out.length - 2] : null;
        const belowIsOperand = below && (below.k === 'a' || below.k === 'root' || below.k === 'grp')
                              && !(below.k === 'a' && below.v === '\u00B7');
        if (belowIsOperand) { num.unshift(out.pop()); continue; }
        break;
      }
      if (p.k === 'a' || p.k === 'root' || p.k === 'grp') { num.unshift(out.pop()); continue; }
      if (isWs(p)) { num.unshift(out.pop()); continue; }
      break;
    }
    while (num.length && isWs(num[0])) lead.unshift(num.shift());
    while (num.length && isWs(num[num.length - 1])) num.pop();

    /* 分母：向后取。括号组/根号整体作为一个分母，其后可能跟指数（并入分母） */
    let j = k + 1;
    const den = [];
    while (j < toks.length && isWs(toks[j])) j++;      /* 斜杠后的空格由分式横线代替 */
    if (j < toks.length && (toks[j].k === 'grp' || toks[j].k === 'root')) {
      den.push(toks[j]); j++;
      if (j < toks.length && toks[j].k === 'a' && isExpAtom(toks[j].v)) { den.push(toks[j]); j++; }
    } else {
      while (j < toks.length && toks[j].k === 'a') { den.push(toks[j]); j++; }
      /* 函数式记号 f(x)：分母里若紧跟一个括号组，它是参数表，要并入分母。
         否则 α₁(θ_c)/α₀(θ_c) 会变成 [α₁(θ_c)]/[α₀](θ_c) —— 数学上就错了。 */
      if (den.length && j < toks.length && toks[j].k === 'grp') { den.push(toks[j]); j++; }
    }
    if (!num.length || !den.length) {
      /* 不是分式：斜杠原样保留，分子/分母都要原样吐回去（不能丢内容！） */
      out.push.apply(out, lead);
      out.push.apply(out, num);
      out.push({ k: 't', v: '/' });
      k = k + 1;
      continue;
    }
    out.push.apply(out, lead);
    out.push({ k: 'frac', num: num, den: den });
    k = j;
  }
  return out.map(renderTok).join('');
}

function renderTok(t) {
  if (t.k === 't' || t.k === 'a') return t.v;
  if (t.k === 'grp') {
    const close = t.br === '[' ? ']' : ')';
    return t.br + convert(t.inner) + close;
  }
  if (t.k === 'root') return '\\sqrt{' + convert(t.inner) + '}';
  if (t.k === 'frac') return '\\frac{' + renderPart(t.num) + '}{' + renderPart(t.den) + '}';
  return '';
}

/* 分式的分子/分母：若整体是一个括号组，且内部没有嵌套分式，则去掉外括号 */
function renderPart(list) {
  if (list.length === 1 && list[0].k === 'grp') {
    const inner = convert(list[0].inner);
    if (inner.indexOf('\\frac') < 0) return inner;
    const close = list[0].br === '[' ? ']' : ')';
    return list[0].br + inner + close;
  }
  return list.map(renderTok).join('');
}

/* ---------- 区域改写 ---------- */
const REGIONS = [
  { re: /(<div class="formula"[^>]*>)([\s\S]*?)(<\/div>)/g, cls: 'formula' },
  { re: /(<td)([^>]*)>([\s\S]*?)(<\/td>)/g, cls: 'td' },
  { re: /(<span class="kv"[^>]*>)([\s\S]*?)(<\/span>)/g, cls: 'kv' },
  { re: /(<span class="mono"[^>]*>)([\s\S]*?)(<\/span>)/g, cls: 'mono' }
];

function convertRegion(kind, html) {
  if (kind === 'formula') {
    /* 公式块：公式号 span 不参与转换 */
    const parts = html.split(/(<span class="no"[^>]*>[\s\S]*?<\/span>)/);
    return parts.map(function (p, i) {
      if (i % 2 === 1) return p;                 /* 公式号原样 */
      return convert(p);
    }).join('');
  }
  return convert(html);
}

/* ---------- 主流程 ---------- */
if (require.main === module) {
let total = 0;
/* 扫 parts/<章>/*.html；命令行可给章号过滤，如：node fracify.js ch4 */
const CH_FILTER = process.argv.slice(2).filter(function (a) { return /^ch\d+$/.test(a); });
const files = [];
for (const ch of fs.readdirSync(DIR).sort()) {
  const d = path.join(DIR, ch);
  if (!fs.statSync(d).isDirectory()) continue;
  if (CH_FILTER.length && CH_FILTER.indexOf(ch) < 0) continue;
  for (const f of fs.readdirSync(d).filter(function (n) { return /\.html$/.test(n); }).sort()) {
    files.push({ ch: ch, name: f, full: path.join(d, f) });
  }
}
for (const fi of files) {
  const f = fi.ch + '/' + fi.name;
  const p = fi.full;
  let html = fs.readFileSync(p, 'utf8');
  const before = html;
  const notes = [];

  for (const rg of REGIONS) {
    html = html.replace(rg.re, function (m, a, b, c, d) {
      if (rg.cls === 'td') {
        const attrs = b || '';
        const inner = c;
        const out = convertRegion('td', inner);
        if (out !== inner) {
          notes.push({ kind: 'td', old: inner, neu: out });
          /* 公式型单元格换成数学衬线字体（.mt 优先级高于 td.n） */
          if (/class\s*=\s*"n"/.test(attrs) && /\\frac|\\sqrt/.test(out)) {
            return '<td' + attrs.replace(/class\s*=\s*"n"/, 'class="n mt"') + '>' + out + '</td>';
          }
        }
        return '<td' + attrs + '>' + out + '</td>';
      }
      const inner = b;
      const out = convertRegion(rg.cls, inner);
      if (out !== inner) notes.push({ kind: rg.cls, old: inner, neu: out });
      return a + out + c;
    });
  }

  if (html !== before) {
    total += notes.length;
    console.log('\n########## ' + f + '  (' + notes.length + ' 处) ##########');
    notes.forEach(function (n) {
      console.log('  旧: ' + n.old.replace(/\s+/g, ' ').trim());
      console.log('  新: ' + n.neu.replace(/\s+/g, ' ').trim());
      console.log('');
    });
    if (APPLY) { fs.writeFileSync(p, html, 'utf8'); console.log('  >> 已写入 ' + p); }
  }
}
console.log('--------------------------------------------');
console.log(APPLY ? ('已改写 ' + total + ' 处') : ('干跑：共 ' + total + ' 处待改写（加 --apply 才写文件）'));
}

/* 供其它脚本复用（第 3 章整页改造脚本 ch3_fracify.js 用它做线性分式 → 宏 的转换） */
module.exports = { convert: convert, convertRegion: convertRegion, REGIONS: REGIONS };
