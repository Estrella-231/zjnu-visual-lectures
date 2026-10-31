/* ===========================================================================
 * math.js —— 页面数学公式的「宏 → HTML」渲染器（构建期使用）
 *
 * 为什么需要它：
 *   教材里的分式、根号都是竖排（堆叠）写法，例：
 *       f₀ = 1/(2π√(LC))        →   f₀ = [1] / [2π√LC]（分式竖排）
 *       Q_L = (1/r)√(L/C)       →   Q_L = [1/r] · √([L]/[C])
 *   页面原来一律写成斜杠线性形式，观感差、也看不出分式结构。
 *   这里在**构建期**把宏渲染成堆叠分式 / 带横线的根号。
 *
 * 宏语法（片段源文件里直接写）：
 *      \frac{分子}{分母}    →  <span class="frac">…</span>
 *      \sqrt{被开方数}       →  <span class="sqrt">√<span class="rad">…</span></span>
 *      ^{…} / _{…}          →  <sup>…</sup> / <sub>…</sub>
 *      \sum \int \prod      →  大算符（\sum 上下限、\int 右侧限位，照教材式）
 *      \omega \theta \pi …  →  希腊字母 / 运算符（Unicode）
 *      \tan \sin \cos …      →  正体函数名
 *      \left \right         →  删除（只起成对括号作用）
 *
 * 为什么不用 MathJax / KaTeX：
 *   页面必须完全自包含，不引用任何外部 CSS/JS/字体。宏渲染器只有几百字节。
 *
 * 为什么不在片段里直接写 HTML：
 *   源文件要可读、可 diff、可 review；宏写法短得多，改公式时不容易出错。
 *
 * .frac 里额外放了一个视觉隐藏的 <span class="fb">/</span>：
 *   · 复制粘贴得到的是线性写法（人读得懂、检索得到）；
 *   · 静态抄写检查（check_text.js）能把堆叠分式还原成 "分子/分母"，
 *     从而继续用「线性串」做公式抄写比对。
 *
 * 导出：
 *   renderMath(html, warnings)  —— 把宏渲染成 HTML（自动保护 <script> 段）
 *                                  warnings 为可选数组：收集源文件笔误与未知命令
 * =========================================================================== */
'use strict';

/* <script>…</script> / <style>…</style> 是 JS/CSS 代码，绝不能被宏替换动。
 * 这里是「原样跳过」而不是「挖成占位符」—— 这样 warnings 里的 index
 * 才与**源文件**下标一致，回修脚本才能精确定位到行。 */
const SCRIPT_RE = /<script\b[\s\S]*?<\/script>/gi;
const STYLE_RE = /<style\b[\s\S]*?<\/style>/gi;

/* ---------------------------------------------------------------------------
 * 1. 符号表
 * ------------------------------------------------------------------------- */

/* 希腊字母 / 运算符 → Unicode（教材用正体希腊字母） */
const SYMBOLS = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', zeta: 'ζ',
  eta: 'η', theta: 'θ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ',
  nu: 'ν', xi: 'ξ', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ',
  upsilon: 'υ', phi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ',
  Pi: 'Π', Sigma: 'Σ', Upsilon: 'Υ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
  times: '×', div: '÷', cdot: '·', pm: '±', mp: '∓',
  approx: '≈', neq: '≠', le: '≤', leq: '≤', ge: '≥', geq: '≥',
  infty: '∞', propto: '∝', to: '→', rightarrow: '→', leftarrow: '←',
  angle: '∠', perp: '⊥', parallel: '∥', ll: '≪', gg: '≫',
  in: '∈', notin: '∉', subset: '⊂', forall: '∀', exist: '∃',
  ast: '*', star: '⋆', circ: '∘', bullet: '•', prime: '′'
};

/* 函数名 → 正体纯文本（教材里 sin/cos/tan/lg 都是正体） */
const FUNCTIONS = [
  'sin', 'cos', 'tan', 'cot', 'sec', 'csc',
  'arcsin', 'arccos', 'arctan', 'arccot', 'arcsec', 'arccsc',
  'sh', 'ch', 'th', 'sinh', 'cosh', 'tanh',
  'lg', 'ln', 'log', 'exp', 'lim', 'limsup', 'liminf',
  'max', 'min', 'det', 'dim', 'ker'
];

/* 成对括号命令：只起成对作用，直接删除 */
const DELETED = ['left', 'right', 'bigl', 'bigr', 'Bigl', 'Bigr', 'displaystyle', 'limits', 'nolimits'];

/* 大算符：符号 + 限位排法
 *   sum  → 上下限（教材式 (5-16)：+∞ 在 ∑ 正上、n=1 在正下）
 *   int  → 右侧限位（教材式 (5-28)：π 在右上、−π 在右下）
 *   prod → 上下限（同 sum） */
const BIGOPS = {
  sum: { ch: '∑', mode: 'stack' },
  prod: { ch: '∏', mode: 'stack' },
  int: { ch: '∫', mode: 'side' }
};

/* 命令名按长度降序，保证 \Delta 不会先被 \D 之类截断、最长匹配优先 */
const CMD_NAMES = Object.keys(SYMBOLS).concat(FUNCTIONS, DELETED, Object.keys(BIGOPS))
  .sort((a, b) => b.length - a.length);

/* ---------------------------------------------------------------------------
 * 2. 宏渲染
 * ------------------------------------------------------------------------- */
function renderMath(html, warnings) {
  return convertMacros(html, warnings);
}

/* 顺序扫描，遇到宏就递归处理花括号内的内容 */
function convertMacros(str, warnings) {
  let out = '';
  let i = 0;
  while (i < str.length) {
    const ch = str[i];

    /* --- 反斜杠命令 --- */
    if (ch === '\\') {
      /* 分式：两个参数组 */
      if (str.startsWith('\\frac', i) && str[i + 5] === '{') {
        const a = readGroup(str, i + 5);           /* 分子 */
        const b = readGroup(str, a.next);         /* 分母 */
        out += fracHtml(convertMacros(a.content, warnings), convertMacros(b.content, warnings));
        i = b.next;
        i = eatExtraBrace(str, i, warnings);
        continue;
      }
      /* 根号：一个参数组 */
      if (str.startsWith('\\sqrt', i) && str[i + 5] === '{') {
        const a = readGroup(str, i + 5);
        out += sqrtHtml(convertMacros(a.content, warnings));
        i = a.next;
        i = eatExtraBrace(str, i, warnings);
        continue;
      }
      const hit = matchCommand(str, i);
      if (hit) {
        out += hit.out;
        i = hit.next;
        continue;
      }
      /* 未知命令：原样保留并记告警（避免默默显示成 "\foo"） */
      const unk = str.slice(i).match(/^\\([a-zA-Z]+)/);
      if (unk && warnings) {
        warnings.push({ type: 'unknown-command', cmd: unk[1], index: i,
          ctx: str.slice(Math.max(0, i - 30), i + 30).replace(/\s+/g, ' ') });
      }
      out += ch;
      i++;
      continue;
    }

    /* --- 原样跳过 <script> / <style> 段 --- */
    if (ch === '<') {
      if (str.startsWith('<script', i)) {
        const e = str.indexOf('</script>', i);
        const stop = e < 0 ? str.length : e + 9;
        out += str.slice(i, stop);
        i = stop;
        continue;
      }
      if (str.startsWith('<style', i)) {
        const e = str.indexOf('</style>', i);
        const stop = e < 0 ? str.length : e + 8;
        out += str.slice(i, stop);
        i = stop;
        continue;
      }
    }

    /* --- 幂 / 下标的花括号形式 ^{…} _{…} --- */
    if ((ch === '^' || ch === '_') && str[i + 1] === '{') {
      const g = readGroup(str, i + 1);
      const tag = ch === '^' ? 'sup' : 'sub';
      out += '<' + tag + '>' + convertMacros(g.content, warnings) + '</' + tag + '>';
      i = g.next;
      continue;
    }

    out += ch;
    i++;
  }
  return out;
}

/* 匹配一个反斜杠命令（最长匹配优先） */
function matchCommand(str, i) {
  for (const name of CMD_NAMES) {
    if (!str.startsWith('\\' + name, i)) continue;
    /* 命令名后面不能紧跟字母（那是别的命令，如 \tanx） */
    const after = str[i + 1 + name.length];
    if (after && /[a-zA-Z]/.test(after)) continue;
    const next = i + 1 + name.length;

    /* 大算符：吃掉紧跟的 <sub>…</sub> / <sup>…</sup> 作为限位 */
    if (BIGOPS[name]) {
      const lim = readLimits(str, next);
      return { out: bigopHtml(BIGOPS[name], lim.sub, lim.sup), next: lim.next };
    }
    /* 成对括号命令：删除 */
    if (DELETED.indexOf(name) >= 0) return { out: '', next };
    /* 函数名：正体纯文本 */
    if (FUNCTIONS.indexOf(name) >= 0) return { out: name, next };
    /* 符号表 */
    return { out: SYMBOLS[name], next };
  }
  return null;
}

/* 源文件笔误：宏（\frac / \sqrt）后面多写了一个右花括号。
 * 例：\frac{R(...)}{π r_d}}  —— 多余的 } 会原样显示到页面上。
 * 这里消费掉它，并记一条告警，让检查器把源文件位置报出来。 */
function eatExtraBrace(str, i, warnings) {
  if (str[i] !== '}') return i;
  if (warnings) {
    warnings.push({ type: 'extra-brace', index: i,
      ctx: str.slice(Math.max(0, i - 46), i + 14).replace(/\s+/g, ' ') });
  }
  return i + 1;
}

/* 读取大算符紧跟的 <sub>…</sub> 与 <sup>…</sup> */function readLimits(str, i) {
  const m = str.slice(i).match(/^\s*(?:<sub>([\s\S]*?)<\/sub>)?\s*(?:<sup>([\s\S]*?)<\/sup>)?/);
  if (!m) return { sub: null, sup: null, next: i };
  return { sub: m[1] === undefined ? null : m[1], sup: m[2] === undefined ? null : m[2], next: i + m[0].length };
}

/* 大算符 HTML
 *   stack（∑/∏）：上下限 —— grid 行 1=上限、2=算符、3=下限
 *   side （∫）  ：右侧限位 —— 算符 + 右侧竖排的上下限 */
function bigopHtml(op, sub, sup) {
  const ch = '<span class="op">' + op.ch + '</span>';
  if (op.mode === 'side') {
    if (sub === null && sup === null) return '<span class="opint">' + op.ch + '</span>';
    return '<span class="opint">' + op.ch + '</span>' +
           (sup !== null ? '<sup>' + sup + '</sup>' : '') +
           (sub !== null ? '<sub>' + sub + '</sub>' : '');
  }
  /* stack：源文件里限位写成 <sub>…</sub><sup>…</sup>，
     教材式是「上限在上、下限在下」，故 up 取 sup、dn 取 sub */
  let h = '<span class="bigop">' + ch;
  if (sup !== null) h += '<span class="lim up">' + sup + '</span>';
  if (sub !== null) h += '<span class="lim dn">' + sub + '</span>';
  return h + '</span>';
}

/* 读取 {…}，支持嵌套 */
function readGroup(str, i) {
  if (str[i] !== '{') {
    throw new Error('math.js: 宏缺少 "{"，位置 ' + i + '：' + str.slice(Math.max(0, i - 20), i + 20));
  }
  let depth = 0;
  let j = i;
  for (; j < str.length; j++) {
    if (str[j] === '{') depth++;
    else if (str[j] === '}') {
      depth--;
      if (depth === 0) { j++; break; }
    }
  }
  if (depth !== 0) throw new Error('math.js: 花括号不配对：' + str.slice(i, i + 40));
  return { content: str.slice(i + 1, j - 1), next: j };
}

function fracHtml(num, den) {
  return '<span class="frac">' +
           '<span class="fn">' + num + '</span>' +
           '<span class="fb">/</span>' +          /* 隐藏的线性分隔符 */
           '<span class="fd">' + den + '</span>' +
         '</span>';
}

function sqrtHtml(arg) {
  /* 被开方数里若含堆叠分式，根号要竖向拉长才罩得住（教材式 (2-6) 的 √(L/C) 就是这样）。
     高根号改由 CSS 的 mask 画钩，所以这里的 "√" 字形只留在 .sg 里做占位，
     保证复制粘贴时线性文本里仍然带着根号。 */
  const tall = arg.indexOf('class="frac"') >= 0;
  const sgn = tall
    ? '<span class="sgn"><span class="sg">\u221A</span></span>'
    : '<span class="sgn">\u221A</span>';
  return '<span class="sqrt' + (tall ? ' tall' : '') + '">' + sgn +
         '<span class="rad">' + arg + '</span></span>';
}

module.exports = { renderMath: renderMath, SYMBOLS: SYMBOLS, FUNCTIONS: FUNCTIONS };
