/* ===========================================================================
 * check_geom.js —— 基于「运行时真实 DOM」的几何自检
 *
 * 为什么不用静态解析：片段里大量坐标是运行时拼接的（如 'M120,'+yT+' L120,'+yB），
 * 静态解析只能覆盖字面坐标。check_geom.js 复用 check.js 的桩 DOM，
 * 把片段脚本真跑一遍，记录每个 SVG 元素的真实属性与创建顺序，再做几何判定。
 *
 * 检查项：
 *   ① 线压字   —— 线段与文字包围盒相交，且线后画 → FAIL（真正遮挡文字）
 *   ② 线穿字   —— 线先画、文字无实心底色遮挡 → WARN（线会从字里透出来）
 *   ③ 文字重叠 —— 同图内两段文字重叠面积 > 35% → FAIL
 *   ④ 重复标签 —— 同图内同文同坐标画了两次 → FAIL（叠加字形 + 一份永远不更新）
 *   ⑤ 元素越界 —— 元素超出 svg viewBox → WARN（会被裁掉）
 *
 * 用法：node check_geom.js
 * 退出码：0 = 无 FAIL
 * =========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const { prepare, execScripts, execScriptsOneScope, RECORD, reportCaptured } = require('./check.js');

const DIR = path.join(__dirname, 'parts');

/* ---------------- 几何工具 ---------------- */
function parseD(d) {
  if (!d) return null;
  const t = String(d).trim();
  if (!/^[MLZ0-9\s.,\-]+$/.test(t)) return null;
  const pts = []; let i = 0, closed = false;
  while (i < t.length) {
    const ch = t[i];
    if (ch === 'M' || ch === 'L') {
      i++;
      const m = /^\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)/.exec(t.slice(i));
      if (!m) return null;
      pts.push([parseFloat(m[1]), parseFloat(m[2])]);
      i += m[0].length;
    } else if (ch === 'Z') { closed = true; i++; }
    else if (/[\s,]/.test(ch)) i++;
    else return null;
  }
  const segs = [];
  for (let k = 1; k < pts.length; k++) segs.push([pts[k - 1], pts[k]]);
  if (closed && pts.length > 2) segs.push([pts[pts.length - 1], pts[0]]);
  return segs;
}
/* ---------------- <polyline> 的 points 解析 ----------------
 * ⚠️ 这段是 2026-10-28 补的，补之前**标准库画的每一根导线都被静默丢弃**：
 *   svg_components.js 的 wire() 输出的是 <polyline points="x,y x,y …">，
 *   而 collect() 只认 LINE / PATH / RECT / CIRCLE —— 于是「线压字」「文字重叠」
 *   「元素越界」这些判据对所有已迁移到标准库的电路图**全部失效**，
 *   闸门却一直报「FAIL 0」。这属于检测器自身的静默失效，比页面缺陷更危险。
 * 补上之后必须有故障注入自证：故意在 polyline 上制造断点，必须被抓出来。
 * 解析失败（非法坐标）一律当作「坏属性」上报，不静默跳过。 */
function parsePoints(s) {
  const out = [];
  const t = String(s || '').trim();
  if (!t) return out;
  const items = t.split(/[\s,]+/).filter(Boolean);
  for (let i = 0; i + 1 < items.length; i += 2) {
    const x = parseFloat(items[i]), y = parseFloat(items[i + 1]);
    if (!isFinite(x) || !isFinite(y)) return null;   /* 非法坐标 → 让调用方记为坏属性 */
    out.push([x, y]);
  }
  return out;
}
/* ---------------- 文字墨迹盒（按字形估算，不用 em 盒） ----------------
 * 为什么要墨迹盒而不是 em 盒：
 *   em 盒（y-0.8fs ~ y+0.22fs）对「−」「+」「·」这类矮字符高出真实墨迹 2~3 倍，
 *   会把「圆边从字旁经过」误判成「圆边压字」，产生大量假阳性。
 * 墨迹盒：横向按各字符实际 advance width 累加；纵向取该串的最大上伸/下伸。 */
function charMetrics(ch) {
  const c = ch.codePointAt(0);
  if (c >= 0x2E80) return { w: 1.00, asc: 0.88, desc: 0.12 };              /* CJK / 全角 */
  if (c >= 0x0300 && c <= 0x036F) return { w: 0, asc: 0, desc: 0, mark: true }; /* 组合附加符 */
  if (c >= 0x2070 && c <= 0x209F) return { w: 0.36, asc: 0.05, desc: 0.40 }; /* 上下标 */
  if (ch === ' ') return { w: 0.28, asc: 0, desc: 0 };
  if (ch === '_') return { w: 0.50, asc: 0, desc: 0.20 };
  if (ch >= '0' && ch <= '9') return { w: 0.556, asc: 0.70, desc: 0 };
  if (ch >= 'A' && ch <= 'Z') {
    const w = ch === 'I' ? 0.28 : 0.68;
    return { w: w, asc: 0.72, desc: 0 };
  }
  if (ch >= 'a' && ch <= 'z') {
    const d = 'gjpqy'.indexOf(ch) >= 0 ? 0.21 : 0;
    let w = 0.54;
    if ('ijl'.indexOf(ch) >= 0) w = 0.26;
    else if ('ftr'.indexOf(ch) >= 0) w = 0.32;
    return { w: w, asc: 0.52, desc: d };
  }
  switch (ch) {
    case '+': return { w: 0.584, asc: 0.52, desc: 0.04 };
    case '−': case '-': case '–': return { w: 0.584, asc: 0.32, desc: 0.02 };
    case '·': return { w: 0.33, asc: 0.30, desc: 0.02 };
    case '×': case '÷': return { w: 0.58, asc: 0.34, desc: 0.02 };
    case '=': return { w: 0.584, asc: 0.34, desc: 0.04 };
    case '.': case ',': return { w: 0.28, asc: 0.02, desc: 0.18 };
    case '(': case ')': case '[': case ']': case '|': case '/': return { w: 0.33, asc: 0.75, desc: 0.20 };
    case '°': return { w: 0.40, asc: 0.62, desc: 0.02 };
    case '²': case '³': return { w: 0.40, asc: 0.50, desc: 0.02 };
    case '±': return { w: 0.584, asc: 0.52, desc: 0.04 };
    case '→': case '←': return { w: 0.90, asc: 0.35, desc: 0.05 };
    case '↔': return { w: 0.90, asc: 0.35, desc: 0.05 };
    case '≤': case '≥': return { w: 0.75, asc: 0.52, desc: 0.05 };
    case '≈': return { w: 0.58, asc: 0.40, desc: 0.04 };
    case '′': return { w: 0.26, asc: 0.74, desc: 0 };
    case '√': return { w: 0.75, asc: 0.72, desc: 0.02 };
  }
  /* 带变音符的拉丁字母：按去音符后的基字母估算 */
  const base = ch.normalize('NFD').charCodeAt(0);
  if (base >= 0x41 && base <= 0x5A) return { w: 0.62, asc: 0.74, desc: 0 };
  if (base >= 0x61 && base <= 0x7A) return { w: 0.54, asc: 0.55, desc: 0.20 };
  return { w: 0.56, asc: 0.60, desc: 0.05 };
}
function textBox(x, y, str, fs, anchor) {
  let w = 0, asc = 0, desc = 0, pendingAsc = 0;
  for (const ch of str) {
    const m = charMetrics(ch);
    w += m.w * fs;
    if (m.mark) { pendingAsc = Math.max(pendingAsc, 0.80); continue; }   /* 组合点要抬高上伸 */
    asc = Math.max(asc, m.asc, pendingAsc);
    pendingAsc = 0;
    desc = Math.max(desc, m.desc);
  }
  asc = Math.max(asc, pendingAsc);
  let x0;
  if (anchor === 'middle') x0 = x - w / 2;
  else if (anchor === 'end') x0 = x - w;
  else x0 = x;
  return { x0: x0, x1: x0 + w, y0: y - asc * fs, y1: y + desc * fs, w: w };
}
function segRect(x1, y1, x2, y2, b) {
  const dx = x2 - x1, dy = y2 - y1;
  let t0 = 0, t1 = 1;
  const clip = (p, q) => {
    if (Math.abs(p) < 1e-12) return q >= 0;
    const r = q / p;
    if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
    else { if (r < t0) return false; if (r < t1) t1 = r; }
    return true;
  };
  if (!clip(-dx, x1 - b.x0)) return false;
  if (!clip(dx, b.x1 - x1)) return false;
  if (!clip(-dy, y1 - b.y0)) return false;
  if (!clip(dy, b.y1 - y1)) return false;
  return true;
}
function overlapArea(a, b) {
  const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  return (w <= 0 || h <= 0) ? 0 : w * h;
}
function rot(pt, cx, cy, ang) {
  const a = ang * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  const dx = pt[0] - cx, dy = pt[1] - cy;
  return [cx + dx * c - dy * s, cy + dx * s + dy * c];
}

/* ---------------- 变换（支持 translate / rotate，仿射矩阵） ---------------- */
const IDM = [1, 0, 0, 1, 0, 0];
function matMul(m1, m2) {          /* 先作用 m2，再作用 m1 */
  return [
    m1[0] * m2[0] + m1[2] * m2[1], m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3], m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4], m1[1] * m2[4] + m1[3] * m2[5] + m1[5]
  ];
}
function mTranslate(tx, ty) { return [1, 0, 0, 1, tx || 0, ty || 0]; }
function mRotate(deg, cx, cy) {
  const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  const R = [c, s, -s, c, 0, 0];
  return matMul(matMul(mTranslate(cx || 0, cy || 0), R), mTranslate(-(cx || 0), -(cy || 0)));
}
function mApply(m, x, y) { return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; }
function parseTransform(s) {
  let m = IDM;
  const re = /(translate|rotate)\s*\(([^)]*)\)/g;
  let k;
  while ((k = re.exec(s || '')) !== null) {
    const nums = (k[2].match(/-?[\d.]+/g) || []).map(Number);
    if (k[1] === 'translate') m = matMul(m, mTranslate(nums[0] || 0, nums[1] || 0));
    else m = matMul(m, mRotate(nums[0] || 0, nums[1] || 0, nums[2] || 0));
  }
  return m;
}
/* 变换后的轴对齐包络 */
function hullBox(corners) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  corners.forEach(c => {
    if (c[0] < x0) x0 = c[0]; if (c[0] > x1) x1 = c[0];
    if (c[1] < y0) y0 = c[1]; if (c[1] > y1) y1 = c[1];
  });
  return { x0: x0, x1: x1, y0: y0, y1: y1 };
}

/* ---------------- 几何属性合法性守卫 ----------------
   SVG 对不合法的属性值是「静默忽略」而不是报错：例如 y="按输出波形20"
   （字符串拼接的结果），浏览器会丢弃整个 y 属性，文字退回 y=0 渲染，
   于是几个标题全叠在画幅左上角。
   这类故障几何比较查不出来 —— parseFloat 得 NaN，参与任何比较恒为 false，
   所有重叠/越界判据都会静默失效。
   故单独判「属性存在但不是合法数字」：有就一定错。 */
const NUMOK = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?(px|pt|pc|em|ex|%)?$/;
function badCoords(a, names) {
  const out = [];
  names.forEach(function (n) {
    if (!(n in a)) return;                       /* 属性缺省 → 用默认值，合法 */
    const raw = String(a[n]).trim();
    if (!NUMOK.test(raw)) out.push(n + '="' + raw + '"');
  });
  return out;
}
const GEOM_ATTRS = {
  TEXT: ['x', 'y'],
  LINE: ['x1', 'y1', 'x2', 'y2'],
  RECT: ['x', 'y', 'width', 'height'],
  CIRCLE: ['cx', 'cy', 'r']
};

/* 隐藏子树：页面常用「互斥状态切换」——同一位置放两套标注，
   用 <g style="display:none"> 把当前不用的那套藏起来（按钮切换）。
   隐藏的分支不参与任何几何判定，否则会把合法设计误判成重复标签/文字重叠。
   （教材图与页面样式都可能用 display:none / visibility:hidden / opacity:0） */
function isHidden(el) {
  const st = el.style || {};
  if (st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0') return true;
  const raw = (el.attributes && el.attributes.style) ? String(el.attributes.style) : '';
  if (/display\s*:\s*none/i.test(raw)) return true;
  if (/visibility\s*:\s*hidden/i.test(raw)) return true;
  if (/opacity\s*:\s*0(\.0+)?\s*(;|$)/i.test(raw)) return true;
  return false;
}

/* ---------------- 遍历记录下来的 SVG 树 ---------------- */
function collect(rootId, root) {
  const texts = [], segs = [], shapes = [], bad = [];
  const walk = (el, m, hid) => {
    const a = el.attributes || {};
    const tm = a.transform ? matMul(m, parseTransform(a.transform)) : m;
    const tag = el.tagName;
    const P = (x, y) => mApply(tm, x, y);
    if (hid || isHidden(el)) { (el.children || []).forEach(cc => walk(cc, tm, true)); return; }
    if (GEOM_ATTRS[tag]) {
      const bc = badCoords(a, GEOM_ATTRS[tag]);
      if (bc.length) bad.push({ tag: tag, attrs: bc, s: (el.textContent || '').trim().slice(0, 30) });
    }
    if (a.transform && tm.some(function (v) { return !isFinite(v); })) {
      bad.push({ tag: tag, attrs: ['transform="' + String(a.transform) + '"'], s: (el.textContent || '').trim().slice(0, 30) });
    }
    if (tag === 'TEXT') {
      const fs = a['font-size'] ? parseFloat(a['font-size']) : 16;
      const anchor = a['text-anchor'] || 'start';
      const s = (el.textContent || '').trim();
      /* 文字内容是 JS 字面量 → 一定是把变量/布尔值当标签画出来了
         （典型：helper 把 opt.label 当文字用，而调用方传的是 label:true） */
      if (/^(true|false|undefined|null|NaN|\[object Object\])$/i.test(s)) {
        bad.push({ tag: tag, attrs: ['text="' + s + '"'], s: s });
      }
      /* 坐标非法的文字不参与几何比较（NaN 会让所有判据失效），只报 bad */
      const bx = parseFloat(a.x || 0), by = parseFloat(a.y || 0);
      if (s && isFinite(bx) && isFinite(by)) {
        const lb = textBox(parseFloat(a.x || 0), parseFloat(a.y || 0), s, fs, anchor);  /* 元素自身坐标系 */
        const c = [[lb.x0, lb.y0], [lb.x1, lb.y0], [lb.x1, lb.y1], [lb.x0, lb.y1]].map(p => P(p[0], p[1]));
        const box = hullBox(c);
        const cp = P(parseFloat(a.x || 0), parseFloat(a.y || 0));
        /* 白描边光晕：线条会被光晕遮断，文字始终可读 → 不再判「线压字/边框压字」 */
        const po = String(a['paint-order'] || '');
        const stc = String(a.stroke || '').toLowerCase();
        const halo = po.indexOf('stroke') >= 0 &&
                     (stc === '#fff' || stc === '#ffffff' || stc === 'white') &&
                     parseFloat(a['stroke-width'] || 0) >= 2.5;
        texts.push({ s: s, box: box, cx: cp[0], cy: cp[1], fs: fs, order: el._order, halo: halo });
      }
    } else if (tag === 'LINE') {
      const p1 = P(parseFloat(a.x1 || 0), parseFloat(a.y1 || 0));
      const p2 = P(parseFloat(a.x2 || 0), parseFloat(a.y2 || 0));
      segs.push({ a: p1, b: p2, order: el._order, kind: 'line' });
    } else if (tag === 'POLYLINE') {
      /* 标准库 wire() 的输出。补上这个分支之前，本检查器对所有导线是「全盲」的
       * （见 parsePoints 上方的说明）。折线的中间顶点不是线头，但每一段都要参与
       * 「线压字 / 线穿字」判定，所以按段拆开。 */
      const pts = parsePoints(a.points);
      if (!pts) {
        bad.push({ tag: tag, attrs: ['points="' + String(a.points || '').slice(0, 60) + '"'], s: '' });
      } else {
        for (let i = 1; i < pts.length; i++) {
          segs.push({ a: P(pts[i - 1][0], pts[i - 1][1]), b: P(pts[i][0], pts[i][1]), order: el._order, kind: 'poly' });
        }
      }
    } else if (tag === 'PATH') {
      const ss = parseD(a.d);
      if (ss) ss.forEach(s => segs.push({ a: P(s[0][0], s[0][1]), b: P(s[1][0], s[1][1]), order: el._order, kind: 'path' }));
    } else if (tag === 'RECT') {
      const x = parseFloat(a.x || 0), y = parseFloat(a.y || 0), w = parseFloat(a.width || 0), h = parseFloat(a.height || 0);
      const c = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]].map(p => P(p[0], p[1]));
      shapes.push({ kind: 'rect', box: hullBox(c), fill: a.fill, order: el._order,
                    corners: c, stroke: a.stroke, sw: parseFloat(a['stroke-width'] || 0) });
    } else if (tag === 'CIRCLE') {
      const cx = parseFloat(a.cx || 0), cy = parseFloat(a.cy || 0), r = parseFloat(a.r || 0);
      const c = [[cx - r, cy - r], [cx + r, cy - r], [cx + r, cy + r], [cx - r, cy + r]].map(p => P(p[0], p[1]));
      const ctr = P(cx, cy);
      const det = Math.abs(tm[0] * tm[3] - tm[1] * tm[2]);
      const rs = r * Math.sqrt(det);
      shapes.push({ kind: 'circ', box: hullBox(c), cx: ctr[0], cy: ctr[1], r: rs, fill: a.fill, order: el._order,
                    stroke: a.stroke, sw: parseFloat(a['stroke-width'] || 0) });
    }
    (el.children || []).forEach(cc => walk(cc, tm, hid));
  };
  (root.children || []).forEach(c => walk(c, IDM, false));
  return { texts: texts, segs: segs, shapes: shapes, bad: bad };
}
function shapeHas(sh, x, y) {
  /* transparent / rgba(...,0) 都是「不挡字」的填充：
     页面常用 fill="transparent" 的矩形做点击热区，它不会盖住任何东西。 */
  if (!sh.fill || sh.fill === 'none' || /transparent/i.test(sh.fill)) return false;
  if (sh.kind === 'circ') {
    const dx = x - sh.cx, dy = y - sh.cy;
    return dx * dx + dy * dy <= sh.r * sh.r;
  }
  const b = sh.box;
  return x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1;
}

/* 形状边框 → 线段列表：矩形的 4 条边 / 圆的 36 段折线 */
function borderSegs(sh) {
  const segs = [];
  if (sh.kind === 'rect' && sh.corners) {
    const c = sh.corners;
    for (let i = 0; i < c.length; i++) segs.push([c[i], c[(i + 1) % c.length]]);
  } else if (sh.kind === 'circ') {
    const N = 36;
    let prev = null;
    for (let i = 0; i <= N; i++) {
      const a = 2 * Math.PI * i / N;
      const p = [sh.cx + sh.r * Math.cos(a), sh.cy + sh.r * Math.sin(a)];
      if (prev) segs.push([prev, p]);
      prev = p;
    }
  }
  return segs;
}

/* ---------------- 主流程 ---------------- */
function main() {
let fail = 0, warn = 0, gSeg = 0, gTxt = 0;
/* 检查目标：① parts/<章>/*.html（原理讲解片段）② examples/pages/*.html（例题解法整页） */
const targets = [];
for (const ch of fs.readdirSync(DIR).sort()) {
  const d = path.join(DIR, ch);
  if (!fs.statSync(d).isDirectory()) continue;
  fs.readdirSync(d).filter(f => /\.html$/.test(f)).sort()
    .forEach(f => targets.push({ label: 'parts/' + ch + '/' + f, file: path.join(d, f), noLib: false }));
}
const EXDIR = path.join(__dirname, 'examples', 'pages');
if (fs.existsSync(EXDIR)) {
  fs.readdirSync(EXDIR).filter(f => /\.html$/.test(f)).sort()
    .forEach(f => targets.push({ label: 'examples/pages/' + f, file: path.join(EXDIR, f), noLib: true }));
}
/* ③ 已构建产物 viz/*.html —— 用 --viz 开启。
   第 3 章 7 页是独立手工整页（不在 parts/ 下），历史上从未被几何检查覆盖，
   而它们的电路图同样是运行时绘制的。整页自带 lib.js 副本 → noLib=true。 */
if (process.argv.includes('--viz')) {
  const VIZ = path.join(__dirname, '..', 'viz');
  if (fs.existsSync(VIZ)) {
    fs.readdirSync(VIZ).filter(f => /\.html$/.test(f)).sort()
      .forEach(f => targets.push({ label: 'viz/' + f, file: path.join(VIZ, f), noLib: true }));
  }
}
/* 前缀过滤：node check_geom.js --viz ch3 → 只看 viz/原理讲解_3.* 与 parts/ch3/*
 * 显式文件参数：node check_geom.js <file.html> → 额外查指定的整页 HTML
 *   （与 check_gap.js 的用法一致：回归脚本要用临时文件直接跑闸门，
 *    而不是把判定逻辑复制一份到测试里 —— 判定只能有一处。）
 *   位置参数若以 .html 结尾且文件确实存在 → 当作文件；否则仍按子串过滤标签。 */
const ARGS = process.argv.slice(2).filter(a => !a.startsWith('--'));
const FILEARGS = ARGS.filter(a => /\.html$/i.test(a) && fs.existsSync(path.resolve(a)));
const FILT = ARGS.filter(a => FILEARGS.indexOf(a) < 0).filter(a => !/^\d+$/.test(a));
FILEARGS.forEach(f => {
  const full = path.resolve(f);
  targets.push({ label: path.relative(path.join(__dirname, '..'), full), file: full, noLib: true });
});
const FILTERED = FILT.length ? targets.filter(t => FILT.some(f => t.label.indexOf(f) >= 0)) : targets;
for (const t of FILTERED) {
  const f = t.label;
  const full = t.file;
  const html = fs.readFileSync(full, 'utf8');
  /* 页面上每个 <svg id viewBox> 与 <canvas id> */
  const svgs = [];
  const canvases = [];
  const re = /<(svg|canvas)\b([^>]*)>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const at = m[2];
    const idm = /\bid\s*=\s*["']([^"']+)["']/i.exec(at);
    if (!idm) continue;
    if (m[1].toLowerCase() === 'canvas') { canvases.push({ id: idm[1] }); continue; }
    const vm = /\bviewBox\s*=\s*["']([^"']+)["']/i.exec(at);
    const vb = vm ? vm[1].trim().split(/\s+/).map(Number) : null;
    svgs.push({ id: idm[1], vb: vb && vb.length === 4 ? vb : null });
  }

  const ctx = prepare(full, { record: true });
  const errors = t.noLib ? execScriptsOneScope(ctx) : execScripts(ctx, { noLib: t.noLib });
  const rec = { fail: 0, warn: 0, msgs: [] };
  if (errors.length) {
    console.log('\n=== ' + f + ' ===');
    errors.forEach(e => { console.log('  [FAIL] 脚本异常 ' + e.where + ': ' + e.msg); rec.fail++; });
    fail += rec.fail;
    continue;
  }
  console.log('\n=== ' + f + ' ===');
  reportCaptured(ctx);
  /* 按 svg id 分组：用注册表里的容器元素 */
  const byId = {};
  svgs.forEach(s => { byId[s.id] = s; });
  let totalSeg = 0, totalTxt = 0;
  svgs.forEach(s => {
    const root = ctx.reg[s.id] || (ctx.doc.getElementById(s.id));
    if (!root) return;
    const G = collect(s.id, root);
    totalSeg += G.segs.length; totalTxt += G.texts.length;
    gSeg += G.segs.length; gTxt += G.texts.length;

    /* ⑧ 空白渲染：<svg id> 必须在运行时真的画出内容
       （典型故障：绘图函数写好了但忘了在初始化里调用 → 页面上是一张白图）
       注意：被 outerHTML 整体替换掉的元素属于「有意替换」，不算空图。 */
    if ((!root.children || root.children.length === 0) && !root._replaced) {
      rec.fail++;
      console.log('  [FAIL] SVG 渲染为空  #' + s.id + '  （有 <svg id="' + s.id + '">，但脚本没往里画任何元素）');
    }

    /* ⑨ 几何属性不是合法数字：SVG 会静默忽略整个属性，元素退回默认值
       （典型：把字符串和数字相加算出了 y="按输出波形20"，文字全叠到 y=0） */
    G.bad.forEach(b => {
      rec.fail++;
      console.log('  [FAIL] 几何属性非法  #' + s.id + '  <' + b.tag.toLowerCase() + '> ' + b.attrs.join(' ') +
        (b.s ? ('  内容「' + b.s + '」') : ''));
    });

    /* ⑤ 越界检查 */
    if (s.vb) {
      const [vx, vy, vw, vh] = s.vb;
      const b = { x0: vx, x1: vx + vw, y0: vy, y1: vy + vh };
      const chkBox = (bx, what) => {
        if (bx.x0 < b.x0 - 0.6 || bx.x1 > b.x1 + 0.6 || bx.y0 < b.y0 - 0.6 || bx.y1 > b.y1 + 0.6) {
          rec.warn++;
          console.log('  [WARN] 超出 viewBox  #' + s.id + '  ' + what +
            '  框=(' + bx.x0.toFixed(1) + ',' + bx.y0.toFixed(1) + ')-(' + bx.x1.toFixed(1) + ',' + bx.y1.toFixed(1) + ')' +
            '  viewBox=(' + b.x0 + ',' + b.y0 + ')-(' + b.x1 + ',' + b.y1 + ')');
        }
      };
      G.texts.forEach(t => chkBox(t.box, '文字「' + t.s + '」'));
      G.shapes.forEach(sh => {
        if (sh.kind === 'rect') chkBox(sh.box, '矩形');
        else chkBox({ x0: sh.cx - sh.r, x1: sh.cx + sh.r, y0: sh.cy - sh.r, y1: sh.cy + sh.r }, '圆');
      });
      /* 路径/线段也要查越界（元件被画到画幅外的典型错误就出在这里） */
      G.segs.forEach(L => {
        const bb = { x0: Math.min(L.a[0], L.b[0]), x1: Math.max(L.a[0], L.b[0]),
                     y0: Math.min(L.a[1], L.b[1]), y1: Math.max(L.a[1], L.b[1]) };
        const inside = bb.x1 >= b.x0 && bb.x0 <= b.x1 && bb.y1 >= b.y0 && bb.y0 <= b.y1;
        if (!inside) {
          rec.warn++;
          console.log('  [WARN] 线条整段落在 viewBox 之外  #' + s.id + '  (' + L.a.map(v => v.toFixed(1)) + '→' + L.b.map(v => v.toFixed(1)) + ')');
        }
      });
    }

    /* ① ② 线 × 字 */
    G.segs.forEach(L => {
      G.texts.forEach(T => {
        if (T.halo) return;                    /* 带白描边光晕，线被遮断不算遮挡 */
        const b = { x0: T.box.x0 + 1.2, x1: T.box.x1 - 1.2, y0: T.box.y0 + 1.2, y1: T.box.y1 - 1.2 };
        if (b.x1 <= b.x0 || b.y1 <= b.y0) return;
        if (!segRect(L.a[0], L.a[1], L.b[0], L.b[1], b)) return;
        if (L.order > T.order) {
          rec.fail++;
          console.log('  [FAIL] 线压字  #' + s.id + '  线(' + L.a.map(v => v.toFixed(1)) + '→' + L.b.map(v => v.toFixed(1)) +
            ')  压住文字「' + T.s + '」@(' + T.cx.toFixed(1) + ',' + T.cy.toFixed(1) + ')');
        } else {
          /* 线先画：若文字被后画的实心形状包住，则导线其实被挡住 */
          const covered = G.shapes.some(sh => sh.order > L.order && shapeHas(sh, T.cx, T.cy));
          if (!covered) {
            rec.warn++;
            console.log('  [WARN] 线穿字（线先画）  #' + s.id + '  线(' + L.a.map(v => v.toFixed(1)) + '→' + L.b.map(v => v.toFixed(1)) +
              ')  文字「' + T.s + '」@(' + T.cx.toFixed(1) + ',' + T.cy.toFixed(1) + ')');
          }
        }
      });
    });

    /* ⑥ 形状边框压字：矩形/圆的轮廓线穿过文字（教材里框边会把字切断或压住） */
    G.shapes.forEach(sh => {
      const bs = borderSegs(sh);
      if (!bs.length) return;
      const edgeName = sh.kind === 'rect' ? '矩形边框' : '圆形边框';
      bs.forEach(L => {
        G.texts.forEach(T => {
          if (T.halo) return;                  /* 带白描边光晕，边框被遮断不算压字 */
          const b = { x0: T.box.x0 + 1.5, x1: T.box.x1 - 1.5, y0: T.box.y0 + 1.5, y1: T.box.y1 - 1.5 };
          if (b.x1 <= b.x0 || b.y1 <= b.y0) return;
          if (!segRect(L[0][0], L[0][1], L[1][0], L[1][1], b)) return;
          rec.fail++;
          console.log('  [FAIL] ' + edgeName + '压字  #' + s.id + '  ' + edgeName +
            ' 压住文字「' + T.s + '」@(' + T.cx.toFixed(1) + ',' + T.cy.toFixed(1) + ')');
        });
      });
    });

    /* ⑦ 文字被后画的不透明形状盖住（文字虽在，但看不见了） */
    G.texts.forEach(T => {
      G.shapes.forEach(sh => {
        if (sh.order <= T.order) return;
        if (!sh.fill || sh.fill === 'none' || /transparent/i.test(sh.fill)) return;
        if (!shapeHas(sh, T.cx, T.cy)) return;
        rec.fail++;
        console.log('  [FAIL] 文字被形状盖住  #' + s.id + '  文字「' + T.s + '」@(' +
          T.cx.toFixed(1) + ',' + T.cy.toFixed(1) + ') 被后画的' + (sh.kind === 'rect' ? '矩形' : '圆') + '覆盖');
      });
    });

    /* ③ 文字重叠 */
    for (let i = 0; i < G.texts.length; i++) {
      for (let j = i + 1; j < G.texts.length; j++) {
        const A = G.texts[i], B = G.texts[j];
        const ar = overlapArea(A.box, B.box);
        const min = Math.min((A.box.x1 - A.box.x0) * (A.box.y1 - A.box.y0), (B.box.x1 - B.box.x0) * (B.box.y1 - B.box.y0));
        if (min > 0 && ar / min > 0.35) {
          rec.fail++;
          console.log('  [FAIL] 文字重叠 ' + (ar / min * 100).toFixed(0) + '%  #' + s.id +
            '  「' + A.s + '」@(' + A.cx.toFixed(1) + ',' + A.cy.toFixed(1) + ')' +
            ' ⟷ 「' + B.s + '」@(' + B.cx.toFixed(1) + ',' + B.cy.toFixed(1) + ')');
        }
      }
    }

    /* ④ 重复标签：同文 + 同中心 */
    for (let i = 0; i < G.texts.length; i++) {
      for (let j = i + 1; j < G.texts.length; j++) {
        const A = G.texts[i], B = G.texts[j];
        if (A.s === B.s && Math.abs(A.cx - B.cx) < 1 && Math.abs(A.cy - B.cy) < 1) {
          rec.fail++;
          console.log('  [FAIL] 重复标签  #' + s.id + '  「' + A.s + '」在 (' + A.cx.toFixed(1) + ',' + A.cy.toFixed(1) + ') 画了两次');
        }
      }
    }
  });

  /* ⑧ 空白 canvas：取得过上下文却一次都没绘制 → 页面上是一张空白坐标图 */
  canvases.forEach(c => {
    const el = ctx.reg[c.id];
    if (!el) return;
    if (!el._ctx) {
      rec.fail++;
      console.log('  [FAIL] canvas 未取得绘图上下文  #' + c.id + '  （<canvas id="' + c.id + '"> 从未被绘制）');
    } else if (!el._ops) {
      rec.fail++;
      console.log('  [FAIL] canvas 没有任何绘制调用  #' + c.id + '  （页面上会是一片空白）');
    }
  });

  if (!rec.fail && !rec.warn) {
    console.log('  [PASS] 无遮挡/重叠/重复标签/越界/空图  （线段 ' + totalSeg + ' 条，文字 ' + totalTxt + ' 处）');
  }
  fail += rec.fail; warn += rec.warn;
}
console.log('\n--------------------------------------------');
console.log('检查目标数：' + FILTERED.length + ' 个（线段 ' + gSeg + ' 条，文字 ' + gTxt + ' 处）');
if (FILTERED.length === 0) console.log('⚠ 过滤后没有任何目标 —— 本次是空跑，不等于通过！');
console.log('汇总：FAIL ' + fail + ' 条，WARN ' + warn + ' 条');
/* 用 exitCode 而不是 exit()：管道输出时 exit() 会截断尚未刷出的 stdout */
process.exitCode = fail ? 1 : 0;
}

/* 作为库被 require 时只导出函数，不跑主流程（供 scratch/ 下的回归/诊断脚本复用）。
   ⚠️ 判定逻辑只能有一份：诊断脚本请 require 本文件，不要复制粘贴一份判定算法
      （历史上 gap_detail.js 复制过一份，两边结论不一致，差点去修并不存在的缺陷）。 */
module.exports = { parseD: parseD, parsePoints: parsePoints, collect: collect, main: main };
if (require.main === module) main();
