/* =====================================================================
   片段自检工具： node check.js <partFile> [<partFile> ...]
   用桩 DOM 在 Node 里跑片段里的 <script>，抓语法错误与运行时异常，
   并触发所有 range 滑块的 input 事件，检查计算链路是否通。

   同时导出 prepare/execScripts/RECORD 供 check_geom.js 复用：
   在桩 DOM 里记录 SVG 元素的真实几何（属性、创建顺序），
   从而对「线压字 / 文字重叠 / 元素被 viewBox 裁切」做精确检查。
   ===================================================================== */
const fs = require('fs');
const path = require('path');

const noop = function () {};

/* 元素记录：开启后所有 createElementNS/createElement 产物都会登记 */
const RECORD = { on: false, seq: 0, els: [] };

function makeCtx(el) {
  /* 渐变对象：真实浏览器里 createLinearGradient 返回带 addColorStop 的对象。
     桩若返回 undefined → 页面脚本在 .addColorStop() 处抛错中断，
     后续所有绘图都不执行 → 误报「SVG 渲染为空」。必须补齐。 */
  const gradient = function () { return { addColorStop: function () { if (el) el._ops = (el._ops || 0) + 1; } }; };
  return new Proxy({
    measureText: function (t) { return { width: String(t).length * 7 }; },
    canvas: el || null
  }, {
    get: function (t, k) {
      if (k in t) return t[k];
      if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createConicGradient') {
        return function () { if (el) el._ops = (el._ops || 0) + 1; return gradient(); };
      }
      if (k === 'getImageData') {
        return function () { if (el) el._ops = (el._ops || 0) + 1; return { data: [], width: 0, height: 0 }; };
      }
      /* 任何 ctx 方法被调用都算「画过」——用于检测空白 canvas */
      return function () { if (el) el._ops = (el._ops || 0) + 1; };
    },
    set: function (t, k, v) { t[k] = v; return true; }
  });
}

/* 页面 console 捕获器：
 * 桩 DOM 里 querySelector/querySelectorAll 一律返回 null/[]，
 * 页末自检里「依赖真实 DOM」的断言在离线必然显示 FAIL —— 直接打到 stdout
 * 会被误读成页面缺陷（2026-10-31 实测：试点页 5 条断言里 4 条被误报）。
 * 这里把 console 输出收起来，由闸门统一带说明地转述。 */
function makeCaptureConsole() {
  const records = [];
  const push = function (level) {
    return function () {
      const text = Array.prototype.slice.call(arguments)
        .map(function (a) { return (typeof a === 'string') ? a : String(a); }).join(' ');
      records.push({ level: level, text: text });
    };
  };
  return {
    records: records,
    console: {
      log: push('log'), info: push('info'), warn: push('warn'),
      error: push('error'), debug: push('debug'), trace: push('trace')
    }
  };
}

const SELF_RE = /^(PASS|FAIL)\s{1,}\S/;

/* 把捕获到的 console 输出带说明地转述出来（不新增 FAIL/WARN 计数） */
function reportCaptured(ctx) {
  const recs = (ctx && ctx.capture && ctx.capture.records) || [];
  if (!recs.length) return;
  /* 页面常把多条断言用一次 console.log(out.join('\n')) 打印 →
     必须按行拆开再分类，否则首行 PASS 会把后面的 FAIL 一起带进「自检」类，
     而真正的页内调试输出又会被误判成断言。 */
  const lines = [];
  recs.forEach(function (r) {
    String(r.text).split(/\r?\n/).forEach(function (ln) {
      const t = ln.trim();
      if (t) lines.push({ level: r.level, text: t });
    });
  });
  const self = lines.filter(function (r) { return SELF_RE.test(r.text); });
  const other = lines.filter(function (r) { return !SELF_RE.test(r.text); });
  if (self.length) {
    console.log('  [自检·离线桩输出] ' + self.length + ' 条断言');
    console.log('    ⚠ 桩 DOM 不支持 querySelector/querySelectorAll 与正文读取 →');
    console.log('      依赖真实 DOM 的断言在离线桩里会显示 FAIL，这是**桩的局限**、不是页面缺陷；');
    console.log('      权威判定在闸门 ⑦ verify_runtime（真实 Chrome，逐条读回自检结论）。');
    self.forEach(function (r) { console.log('      ' + r.text); });
  }
  if (other.length) {
    console.log('  [页面 console] ' + other.length + ' 行');
    other.forEach(function (r) { console.log('      ' + r.text); });
  }
}

function makeEl(tag, id) {
  const el = {
    tagName: (tag || 'div').toUpperCase(),
    id: id || '',
    value: '',
    style: {},
    width: 0, height: 0,
    checked: false,
    dataset: {},
    classList: { add: noop, remove: noop, toggle: noop, contains: function () { return false; } },
    children: [],
    attributes: {},
    _listeners: {},
    _order: RECORD.seq++,
    getContext: function () { this._ctx = (this._ctx || 0) + 1; return makeCtx(this); },
    appendChild: function (c) { this.children.push(c); c._parent = this; return c; },
    removeChild: function (c) {
      const i = this.children.indexOf(c);
      if (i >= 0) this.children.splice(i, 1);     // 真实删除：重绘时清空旧图形
      return c;
    },
    setAttribute: function (k, v) { this.attributes[k] = v; },
    getAttribute: function (k) { return this.attributes[k]; },
    addEventListener: function (ev, fn) { (this._listeners[ev] = this._listeners[ev] || []).push(fn); },
    removeEventListener: noop,
    dispatchEvent: function (ev) {
      const ls = this._listeners[ev.type] || [];
      for (let i = 0; i < ls.length; i++) ls[i].call(this, { type: ev.type, target: this });
      return true;
    },
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
    getBoundingClientRect: function () { return { top: 0, left: 0, width: 780, height: 400, bottom: 400, right: 780 }; },
    focus: noop, blur: noop, click: function () { this.dispatchEvent({ type: 'click' }); },
    insertAdjacentHTML: noop, remove: noop
  };
  /* innerHTML / textContent 赋值要像真浏览器那样清空子节点，
     否则重绘时旧图形会堆积，几何检查出现大量假阳性 */
  Object.defineProperty(el, 'innerHTML', {
    get: function () { return this._html || ''; },
    /* 真浏览器里 innerHTML 会把串**解析成节点** → 元素的 textContent 是剥掉标签后的纯文本。
       桩里不解析 DOM，但至少要让 textContent 拿到纯文本，
       否则「运行时写 innerHTML + 断言读 textContent」的组合在离线闸门下必然假 FAIL
       （真下标改造后读数面板改成 innerHTML = subHtml(…)，断言读的是 textContent）。
       零宽下划线是 <span> 包着的 '_' → 剥标签后仍在 → textContent 逐字不变 ✓ */
    set: function (v) {
      this._html = (v === undefined || v === null) ? '' : String(v);
      this.children.length = 0;
      this._text = this._html.replace(/<[^>]*>/g, '');
    },
    configurable: true
  });
  Object.defineProperty(el, 'textContent', {
    /* getter 必须**把直接文本与子节点的文本拼起来**（真浏览器就是这样）。
       · 页面若把一个 <text> 拆成「普通段 + <tspan> 下标段」，
         getter 只回 _text 就会让标签在离线闸门里变成**空串** ——
         文字宽度估成 0 →「线压字 / 文字重叠」判据对所有这类图**静默失效**。
       · parseSVGFragment 解析静态内联 SVG 时也是「直接文本在 _text、
         子节点在 children」，两者必须一起算。
       （真下标改造后 SVG 标注就是这个结构，见 build/subscript.js） */
    get: function () {
      var out = this._text || '';
      for (var i = 0; i < this.children.length; i++) {
        var c = this.children[i];
        if (!c) continue;
        if (c.textContent === undefined || c.textContent === null) continue;
        out += String(c.textContent);
      }
      return out;
    },
    set: function (v) { this._text = (v === undefined || v === null) ? '' : String(v); this.children.length = 0; },
    configurable: true
  });
  Object.defineProperty(el, 'firstChild', {
    get: function () { return this.children.length ? this.children[0] : null; },
    configurable: true
  });
  /* childNodes 与 children 指向同一列表（真浏览器里 childNodes 含文本节点、
     children 只含元素；本桩不产生裸文本节点，两者等价）。
     页末自检惯用 childNodes.length —— 没有这个 getter 会直接 TypeError。 */
  Object.defineProperty(el, 'childNodes', {
    get: function () { return this.children; },
    configurable: true
  });
  Object.defineProperty(el, 'lastChild', {
    get: function () { return this.children.length ? this.children[this.children.length - 1] : null; },
    configurable: true
  });
  /* outerHTML 赋值 = 该元素被整体替换（浏览器里节点会从文档树上摘掉）。
     记录 _replaced，供检查器区分「有意替换掉」与「忘了画」。 */
  Object.defineProperty(el, 'outerHTML', {
    get: function () { return this._outer || ''; },
    set: function (v) {
      this._outer = (v === undefined || v === null) ? '' : String(v);
      this._replaced = true;
      this.children.length = 0;
    },
    configurable: true
  });
  if (RECORD.on) RECORD.els.push(el);
  return el;
}

/* ---------------- 内联 SVG 解析 ----------------
   第 3 章等手工整页把电路图**直接写在 HTML 里**（不是运行时用 lib.js 绘制）。
   buildRegistry 原来只认 input/canvas/select/... 这些标签，不认 <svg>，
   于是这些页面的 SVG 子树在桩 DOM 里根本不存在 →
   误报「SVG 渲染为空」，而且所有几何检查（压字/重叠/越界）全部落空。 */
function parseAttrs(s) {
  const attrs = {};
  const re = /([A-Za-z_:][-\w:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    attrs[m[1]] = m[3] !== undefined ? m[3] : (m[4] !== undefined ? m[4] : m[5]);
  }
  return attrs;
}
const SVG_TAG_RE = /<(\/?)([A-Za-z][-\w:.]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
const SVG_VOID = new Set(['path', 'line', 'rect', 'circle', 'ellipse', 'use', 'stop',
                          'polyline', 'polygon', 'image', 'animate']);
function parseSVGFragment(src) {
  const root = { tagName: '#ROOT', attributes: {}, children: [], _text: '' };
  const stack = [root];
  let last = 0, m;
  SVG_TAG_RE.lastIndex = 0;
  while ((m = SVG_TAG_RE.exec(src)) !== null) {
    const close = m[1] === '/', tag = m[2], raw = m[3] || '', selfClose = m[4] === '/';
    const txt = src.slice(last, m.index);
    if (txt.trim()) stack[stack.length - 1]._text += txt;
    last = SVG_TAG_RE.lastIndex;
    if (close) {
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tagName === tag.toUpperCase()) { stack.length = i; break; }
      }
      continue;
    }
    const el = makeEl(tag);
    el.attributes = parseAttrs(raw);
    el._text = '';                 /* makeEl 不初始化 _text，undefined+str 会得到 'undefined…' */
    stack[stack.length - 1].children.push(el);
    if (!selfClose && !SVG_VOID.has(tag.toLowerCase())) stack.push(el);
  }
  return root;
}
function findSvgEnd(html, from) {
  const re = /<svg\b|<\/svg\s*>/gi;
  re.lastIndex = from;
  let depth = 1, m;
  while ((m = re.exec(html)) !== null) {
    if (m[0].charAt(1) === '/') { depth--; if (depth === 0) return m.index; }
    else depth++;
  }
  return html.length;
}
function buildRegistry(html) {
  const reg = {};
  // <input ... id="X" ...>
  const re = /<(input|canvas|select|textarea|button|div|span|p|table)\b([^>]*)>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const tag = m[1].toLowerCase();
    const attrs = m[2];
    const idm = attrs.match(/\bid\s*=\s*["']([^"']+)["']/i);
    if (!idm) continue;
    const id = idm[1];
    if (reg[id]) continue;
    const el = makeEl(tag, id);
    const vm = attrs.match(/\bvalue\s*=\s*["']([^"']*)["']/i);
    if (vm) el.value = vm[1];
    const tm = attrs.match(/\btype\s*=\s*["']([^"']*)["']/i);
    el.type = tm ? tm[1].toLowerCase() : '';
    reg[id] = el;
  }
  /* 内联 <svg id="...">：连同子树一起注册 */
  const noScript = html.replace(/<script(?:\s[^>]*)?>[\s\S]*?<\/script>/gi, '');
  const svgRe = /<svg\b([^>]*)>/gi;
  let sm;
  while ((sm = svgRe.exec(noScript)) !== null) {
    const attrs = parseAttrs(sm[1]);
    const id = attrs.id;
    if (!id || reg[id]) continue;
    const inner = noScript.slice(svgRe.lastIndex, findSvgEnd(noScript, svgRe.lastIndex));
    const el = makeEl('svg', id);
    el.attributes = attrs;
    const frag = parseSVGFragment(inner);
    el.children = frag.children;
    el._text = frag._text;
    reg[id] = el;
  }
  return reg;
}

/* 准备运行环境：doc / win / sandbox / 注册表 / 片段脚本 */
function prepare(file, opts) {
  opts = opts || {};
  const html = fs.readFileSync(file, 'utf8');
  const cap = makeCaptureConsole();
  const scripts = [];
  const re = /<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) scripts.push(m[1]);

  const reg = buildRegistry(html);
  const doc = {
    title: '',
    body: makeEl('body', 'body'),
    documentElement: makeEl('html', 'html'),
    getElementById: function (id) {
      if (!reg[id]) reg[id] = makeEl('div', id);
      return reg[id];
    },
    createElement: function (tag) { return makeEl(tag); },
    createElementNS: function (ns, tag) { return makeEl(tag); },
    createTextNode: function (t) { return { textContent: t }; },
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
    addEventListener: function () {},
    removeEventListener: function () {}
  };
  const win = {
    devicePixelRatio: 2,
    innerWidth: 1280, innerHeight: 900,
    addEventListener: function () {}, removeEventListener: function () {},
    requestAnimationFrame: function (fn) { return setTimeout(fn, 0); },
    getComputedStyle: function () { return {}; },
    Math: Math, Date: Date, JSON: JSON, console: cap.console, isNaN: isNaN, isFinite: isFinite,
    parseFloat: parseFloat, parseInt: parseInt, Number: Number, String: String, Object: Object,
    Array: Array, Error: Error, Promise: Promise, Set: Set, Map: Map, RegExp: RegExp
  };
  win.window = win;
  win.self = win;
  win.globalThis = win;

  const sandbox = {
    document: doc, window: win, console: cap.console,
    Math: Math, Date: Date, JSON: JSON, isNaN: isNaN, isFinite: isFinite,
    parseFloat: parseFloat, parseInt: parseInt, Number: Number, String: String,
    Object: Object, Array: Array, Error: Error, Promise: Promise, Set: Set, Map: Map, RegExp: RegExp,
    setTimeout: setTimeout, clearTimeout: clearTimeout, setInterval: setInterval, clearInterval: clearInterval
  };
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  win.document = doc;

  if (opts.record) { RECORD.on = true; RECORD.seq = 0; RECORD.els = []; }
  return { html: html, scripts: scripts, reg: reg, doc: doc, win: win, sandbox: sandbox, file: file, capture: cap };
}

/* 执行共享库 + 片段脚本（必须同一函数作用域，否则 const 声明不共享）
 * opts.noLib = true：页面自带库副本（整页 HTML，如 examples/pages/*.html），
 *                 不再额外注入 lib.js，否则 const 重复声明会 SyntaxError。 */
function execScripts(ctx, opts) {
  const noLib = !!(opts && opts.noLib);
  const libPath = path.join(__dirname, 'lib.js');
  let libSrc = '';
  if (fs.existsSync(libPath)) libSrc = fs.readFileSync(libPath, 'utf8');
  if (noLib) libSrc = '';
  /* 章级共享脚本 parts/<章>/_script.js：片段里的启动调用（window.__CH.*）
     依赖它先执行 —— 与浏览器里 <head> 注入的顺序保持一致。 */
  let chSrc = '';
  if (ctx.file) {
    /* 兼容相对路径（parts/ch4/x.html）与绝对路径（.../parts/ch4/x.html） */
    const mm = /(?:^|[\\/])parts[\\/]([^\\/]+)[\\/][^\\/]+\.html$/.exec(ctx.file);
    if (mm) {
      const cp = path.join(__dirname, 'parts', mm[1], '_script.js');
      if (fs.existsSync(cp)) chSrc = fs.readFileSync(cp, 'utf8');
    }
  }
  const prefix = libSrc + '\n' + chSrc + '\n';
  const errors = [];
  const c = (ctx.capture && ctx.capture.console) || console;
  try {
    new Function('document', 'window', 'console', prefix)(ctx.doc, ctx.win, c);
  } catch (e) {
    errors.push({ where: '共享库', msg: e.message, stack: String(e.stack || '').split('\n').slice(0, 4).join('\n') });
    return errors;
  }
  ctx.scripts.forEach(function (code, i) {
    try {
      new Function('document', 'window', 'console',
        prefix + '\n/* === part script ' + (i + 1) + ' === */\n' + code)(ctx.doc, ctx.win, c);
    } catch (e) {
      errors.push({ where: 'script#' + (i + 1), msg: e.message, stack: String(e.stack || '').split('\n').slice(0, 4).join('\n') });
    }
  });
  return errors;
}

/* 整页 HTML：浏览器里多段内联脚本共享全局作用域，
   因此这里把所有 <script> 拼成一段在同一个函数作用域里执行。 */
function execScriptsOneScope(ctx) {
  const errors = [];
  const body = ctx.scripts.map(function (c, i) {
    return '\n/* === page script ' + (i + 1) + ' === */\n' + c;
  }).join('\n');
  try {
    new Function('document', 'window', 'console', body)(ctx.doc, ctx.win, (ctx.capture && ctx.capture.console) || console);
  } catch (e) {
    errors.push({ where: '整页脚本', msg: e.message, stack: String(e.stack || '').split('\n').slice(0, 4).join('\n') });
  }
  return errors;
}

function runPart(file) {
  console.log('\n=== ' + path.basename(file) + ' ===');
  const ctx = prepare(file);
  if (!ctx.scripts.length) { console.log('  (片段内没有 <script>)'); return true; }
  const errors = execScripts(ctx);
  let ok = errors.length === 0;
  errors.forEach(function (e) {
    console.log('  [FAIL] ' + e.where + ' 运行异常: ' + e.msg);
    console.log('         ' + e.stack);
  });

  // 触发所有 range / select 的 input 事件
  let fired = 0;
  Object.keys(ctx.reg).forEach(function (id) {
    const el = ctx.reg[id];
    if (el.type === 'range' || el.type === 'number' || el.tagName === 'SELECT') {
      try {
        el.dispatchEvent({ type: 'input' });
        fired++;
      } catch (e) {
        ok = false;
        console.log('  [FAIL] 触发 #' + id + ' input 时异常: ' + e.message);
      }
    }
  });
  // 触发所有 button 的 click
  Object.keys(ctx.reg).forEach(function (id) {
    const el = ctx.reg[id];
    if (el.tagName === 'BUTTON') {
      try { el.dispatchEvent({ type: 'click' }); } catch (e) {
        ok = false;
        console.log('  [FAIL] 触发 #' + id + ' click 时异常: ' + e.message);
      }
    }
  });
  console.log('  脚本数: ' + ctx.scripts.length + '，触发滑块/按钮: ' + fired + ' 个');
  reportCaptured(ctx);
  if (ok) console.log('  [PASS] 无语法/运行时错误');
  return ok;
}

module.exports = { prepare: prepare, execScripts: execScripts, execScriptsOneScope: execScriptsOneScope, buildRegistry: buildRegistry, makeEl: makeEl, RECORD: RECORD, runPart: runPart, reportCaptured: reportCaptured };

if (require.main === module) {
  const files = process.argv.slice(2);
  if (!files.length) { console.log('用法: node check.js <partFile> [...]'); process.exit(1); }
  let all = true;
  files.forEach(function (f) { if (!runPart(f)) all = false; });
  console.log('\n总体: ' + (all ? 'PASS' : 'FAIL'));
  process.exit(all ? 0 : 1);
}
