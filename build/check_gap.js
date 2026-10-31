/* ===========================================================================
 * check_gap.js —— 电路图「线头断头 / 未接通」检测器
 *
 * 为什么单独写一个文件（不改 check_geom.js）：
 *   check_geom.js 正在被并行核查任务使用，改动它会影响它们的运行结果。
 *   这里独立实现所需的少量几何工具，保持 check_geom.js 零改动。
 *
 * 要抓的故障（教材图 → 页面重绘时最常见的低级错误）：
 *   ① 拐角缺口：一根横线画到 (340,296)，一根竖线从 (340,300) 起笔 —— 差 4px，接不上。
 *      页面看上去「C_c 右端没接到 +V_CC」，电路其实是断的。
 *   ② 共线缺口：两段本该连成一条直线的线，中间差了几像素。
 *   这两类都表现为：两个「线头」相距很近，却没有真正接上。
 *
 * 判定「线头」的方法：
 *   一个线段的端点 E 若是
 *     · 附近 0.8px 内没有别的端点            → 不是接头
 *     · 不落在任何别的线段上（不是 T 形交点） → 不是 T 形交点
 *     · 不落在任何矩形/圆形的轮廓或内部      → 没接到元件
 *   则 E 是一个「悬空线头」。两个悬空线头靠得很近且方向吻合 → 疑似断头。
 *
 * 用法：
 *   node check_gap.js                      查 parts/s2_*.html + examples/pages/*.html
 *   node check_gap.js <file.html> ...      额外查指定的整页 HTML
 * =========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const { prepare, execScripts, execScriptsOneScope, reportCaptured } = require('./check.js');

const TOL = +(process.env.GAP_TOL || 30);   /* 两个线头的最大间距（可用 GAP_TOL 环境变量调） */
const JOIN = 0.8;      /* 判定「已连接」的容差 */
const HORIZ = 1.5;     /* 判定「水平/垂直」的容差 */
/* 「填充多边形（实心箭头三角等）能跨越缺口」规则的总开关。
 * GAP_POLY=0 可整体关掉多边形感知 —— 回归脚本 scratch/test_gap_poly.js
 * 用它做故障注入：关掉后必须重新报出，证明这条规则真的接上了。 */
const POLY = process.env.GAP_POLY !== '0';

/* ---------------- 路径解析（完整 SVG path 语法） ----------------
 * 必须支持：
 *   · 逗号 / 空格 / 混合分隔：'M24,44 L132,44'（页面里绝大多数是这个写法）
 *   · 隐式重复坐标对：'M24,44 132,44' → 第二个点按 L 处理
 *   · 相对命令：m l h v a q c s t
 *   · 曲线：A(椭圆弧) Q(二次贝塞尔) C(三次贝塞尔) S/T(平滑变体)
 * 少支持一种就等于「整条 path 被静默丢弃」——
 * 本工具第一版就栽在这：只认 'M/L/H/V/A' + 空格分隔，
 * 于是 'M24,44 L132,44' 全部返回 null，扫描结果等于空跑（797 条 path 一条没看）。
 */
function parseD(d) {
  if (!d) return null;
  const t = String(d).trim();
  if (!/^[MmLlHhVvAaQqCcSsTtZz0-9eE\s.,+-]+$/.test(t)) return null;

  let i = 0;
  const skipSep = function () { while (i < t.length && /[\s,]/.test(t[i])) i++; };
  const num = function () {
    skipSep();
    const m = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(t.slice(i));
    if (!m) return null;
    i += m[0].length;
    return parseFloat(m[0]);
  };
  const readPt = function () {
    const x = num(), y = num();
    if (x === null || y === null) return null;
    return [x, y];
  };

  const pts = [];
  let closed = false;
  let cmd = null, rel = false, lastNum = null;
  let cx = 0, cy = 0, sx = 0, sy = 0;
  let prevC2 = null, prevQ = null;      /* S / T 的反射控制点 */

  function push(x, y) { pts.push([x, y]); cx = x; cy = y; }

  /* 椭圆弧 → 折线（末点强制落在真实终点） */
  function arcTo(rx, ry, rot, fa, fs, ex, ey) {
    const out = [];
    if (cx === ex && cy === ey) return out;
    let rX = Math.abs(rx), rY = Math.abs(ry);
    if (rX < 1e-12 || rY < 1e-12) { out.push([ex, ey]); return out; }
    const phi = (rot || 0) * Math.PI / 180;
    const cosp = Math.cos(phi), sinp = Math.sin(phi);
    const dx2 = (cx - ex) / 2, dy2 = (cy - ey) / 2;
    const xp1 = cosp * dx2 + sinp * dy2, yp1 = -sinp * dx2 + cosp * dy2;
    const lam = (xp1 * xp1) / (rX * rX) + (yp1 * yp1) / (rY * rY);
    if (lam > 1) { const s = Math.sqrt(lam); rX *= s; rY *= s; }
    const num2 = rX * rX * rY * rY - rX * rX * yp1 * yp1 - rY * rY * xp1 * xp1;
    const den2 = rX * rX * yp1 * yp1 + rY * rY * xp1 * xp1;
    let co = den2 === 0 ? 0 : Math.sqrt(Math.max(0, num2 / den2));
    if (fa) co = -co;
    const cxp = co * rX * yp1 / rY, cyp = -co * rY * xp1 / rX;
    const cxx = cosp * cxp - sinp * cyp + (cx + ex) / 2;
    const cyy = sinp * cxp + cosp * cyp + (cy + ey) / 2;
    const ang = function (ux, uy, vx, vy) {
      const sgn = (ux * vy - uy * vx) < 0 ? -1 : 1;
      const dot = ux * vx + uy * vy;
      return sgn * Math.acos(Math.max(-1, Math.min(1, dot / (Math.hypot(ux, uy) * Math.hypot(vx, vy)))));
    };
    const ux = (xp1 - cxp) / rX, uy = (yp1 - cyp) / rY;
    const vx = (-xp1 - cxp) / rX, vy = (-yp1 - cyp) / rY;
    const th1 = Math.atan2(uy, ux);
    let dth = ang(ux, uy, vx, vy);
    if (!fs && dth > 0) dth -= 2 * Math.PI;
    else if (fs && dth < 0) dth += 2 * Math.PI;
    const N = 16;
    for (let k = 1; k <= N; k++) {
      const a = th1 + dth * k / N;
      const ex2 = cosp * rX * Math.cos(a) - sinp * rY * Math.sin(a) + cxx;
      const ey2 = sinp * rX * Math.cos(a) + cosp * rY * Math.sin(a) + cyy;
      out.push(k === N ? [ex, ey] : [ex2, ey2]);
    }
    return out;
  }
  function quadTo(qx, qy, ex, ey) {
    const out = [], N = 12;
    for (let k = 1; k <= N; k++) {
      const u = k / N, v = 1 - u;
      const px = v * v * cx + 2 * v * u * qx + u * u * ex;
      const py = v * v * cy + 2 * v * u * qy + u * u * ey;
      out.push(k === N ? [ex, ey] : [px, py]);
    }
    return out;
  }
  function cubicTo(c1x, c1y, c2x, c2y, ex, ey) {
    const out = [], N = 14;
    for (let k = 1; k <= N; k++) {
      const u = k / N, v = 1 - u;
      const px = v * v * v * cx + 3 * v * v * u * c1x + 3 * v * u * u * c2x + u * u * u * ex;
      const py = v * v * v * cy + 3 * v * v * u * c1y + 3 * v * u * u * c2y + u * u * u * ey;
      out.push(k === N ? [ex, ey] : [px, py]);
    }
    return out;
  }
  function pushAll(arr) { for (const p of arr) push(p[0], p[1]); }

  while (true) {
    skipSep();
    if (i >= t.length) break;
    const ch = t[i];
    let explicit = false;
    if (/[A-Za-z]/.test(ch)) {
      const c = ch.toUpperCase();
      if ('MLHVZACQST'.indexOf(c) < 0) return null;
      cmd = c; lastNum = c; rel = (c !== ch); explicit = true; i++;
    } else {
      if (!cmd) return null;
      /* 隐式重复：M/m 之后的坐标对按 L/l 处理，其余命令沿用上一个 */
      if (lastNum === 'M') cmd = 'L';
      else if (lastNum === 'm') cmd = 'l';
    }
    if (cmd === 'Z') { closed = true; break; }

    if (cmd === 'M' || cmd === 'm') {
      const p = readPt(); if (!p) return null;
      const x = rel ? cx + p[0] : p[0], y = rel ? cy + p[1] : p[1];
      push(x, y); sx = x; sy = y;
      prevC2 = null; prevQ = null;
    } else if (cmd === 'L' || cmd === 'l') {
      const p = readPt(); if (!p) return null;
      push(rel ? cx + p[0] : p[0], rel ? cy + p[1] : p[1]);
      prevC2 = null; prevQ = null;
    } else if (cmd === 'H' || cmd === 'h') {
      const x = num(); if (x === null) return null;
      push(rel ? cx + x : x, cy);
      prevC2 = null; prevQ = null;
    } else if (cmd === 'V' || cmd === 'v') {
      const y = num(); if (y === null) return null;
      push(cx, rel ? cy + y : y);
      prevC2 = null; prevQ = null;
    } else if (cmd === 'A' || cmd === 'a') {
      const rx = num(), ry = num(), rot = num(), fa = num(), fs = num();
      const ex = num(), ey = num();
      if (rx === null || ry === null || rot === null || fa === null || fs === null || ex === null || ey === null) return null;
      const TX = rel ? cx + ex : ex, TY = rel ? cy + ey : ey;
      pushAll(arcTo(rx, ry, rot, fa, fs, TX, TY));
      prevC2 = null; prevQ = null;
    } else if (cmd === 'Q' || cmd === 'q') {
      const a = readPt(); const b = readPt();
      if (!a || !b) return null;
      const qx = rel ? cx + a[0] : a[0], qy = rel ? cy + a[1] : a[1];
      const ex = rel ? cx + b[0] : b[0], ey = rel ? cy + b[1] : b[1];
      pushAll(quadTo(qx, qy, ex, ey));
      prevQ = [qx, qy]; prevC2 = null;
    } else if (cmd === 'T' || cmd === 't') {
      const b = readPt(); if (!b) return null;
      const ex = rel ? cx + b[0] : b[0], ey = rel ? cy + b[1] : b[1];
      const qx = prevQ ? (2 * cx - prevQ[0]) : cx;
      const qy = prevQ ? (2 * cy - prevQ[1]) : cy;
      pushAll(quadTo(qx, qy, ex, ey));
      prevQ = [qx, qy]; prevC2 = null;
    } else if (cmd === 'C' || cmd === 'c') {
      const a = readPt(), b = readPt(), e = readPt();
      if (!a || !b || !e) return null;
      const c1x = rel ? cx + a[0] : a[0], c1y = rel ? cy + a[1] : a[1];
      const c2x = rel ? cx + b[0] : b[0], c2y = rel ? cy + b[1] : b[1];
      const ex = rel ? cx + e[0] : e[0], ey = rel ? cy + e[1] : e[1];
      pushAll(cubicTo(c1x, c1y, c2x, c2y, ex, ey));
      prevC2 = [c2x, c2y]; prevQ = null;
    } else if (cmd === 'S' || cmd === 's') {
      const a = readPt(), e = readPt();
      if (!a || !e) return null;
      const c1x = prevC2 ? (2 * cx - prevC2[0]) : cx;
      const c1y = prevC2 ? (2 * cy - prevC2[1]) : cy;
      const c2x = rel ? cx + a[0] : a[0], c2y = rel ? cy + a[1] : a[1];
      const ex = rel ? cx + e[0] : e[0], ey = rel ? cy + e[1] : e[1];
      pushAll(cubicTo(c1x, c1y, c2x, c2y, ex, ey));
      prevC2 = [c2x, c2y]; prevQ = null;
    } else {
      return null;
    }
  }

  const segs = [];
  for (let k = 1; k < pts.length; k++) segs.push([pts[k - 1], pts[k]]);
  if (closed && pts.length > 2) segs.push([pts[pts.length - 1], pts[0]]);
  return { segs: segs, closed: closed };
}

/* ---------------- 变换 ---------------- */
const IDM = [1, 0, 0, 1, 0, 0];
function matMul(m1, m2) {
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

/* ---------------- <polyline> 的 points 解析 ----------------
 * ⚠️ 2026-10-28 补：标准库的 wire() 输出的是 <polyline>，而 collect() 原本只认
 *   LINE / PATH / RECT / CIRCLE —— 于是**标准库画的每一根导线都被静默丢弃**，
 *   「断头」检查对已迁移的电路图全部失效（闸门却报 FAIL 0）。
 *   补上之后必须用故障注入自证：故意让 polyline 断一截，必须被抓出来。
 * 解析失败（非法坐标）返回 null，由调用方记为坏属性，不静默跳过。 */
function parsePoints(s) {
  const out = [];
  const t = String(s || '').trim();
  if (!t) return out;
  const items = t.split(/[\s,]+/).filter(Boolean);
  for (let i = 0; i + 1 < items.length; i += 2) {
    const x = parseFloat(items[i]), y = parseFloat(items[i + 1]);
    if (!isFinite(x) || !isFinite(y)) return null;
    out.push([x, y]);
  }
  return out;
}

/* ---------------- 收集一个 svg 里的线段与形状 ----------------
 * 关键：一条 PATH 折线化后有 N 个顶点，但**只有首尾两个点才是真正的「线头」**，
 * 中间顶点是折线的内部接点。若把每个子段的端点都当线头，弧线会被拆成几十个
 * 互相只差 1~2px 的「线头」，产生成千上万条假阳性。
 * 所以这里同时保留：
 *   segs  —— 全部子线段（用于判断「某点是否落在别的线的身上」）
 *   wires —— 每条原始图元的真实首尾端点（用于两两比对）
 */
function collect(root) {
  const segs = [], shapes = [], wires = [];
  const walk = (el, m) => {
    const a = el.attributes || {};
    const tm = a.transform ? matMul(m, parseTransform(a.transform)) : m;
    const tag = el.tagName;
    const P = (x, y) => mApply(tm, x, y);
    if (tag === 'LINE') {
      const p1 = P(parseFloat(a.x1 || 0), parseFloat(a.y1 || 0));
      const p2 = P(parseFloat(a.x2 || 0), parseFloat(a.y2 || 0));
      const wi = wires.length;
      segs.push({ a: p1, b: p2, wi: wi, filled: false });
      wires.push({ a: p1, b: p2, wi: wi, el: el });
    } else if (tag === 'POLYLINE') {
      /* 标准库 wire() 的输出。折线中间顶点是内部接点，只有首尾是真线头；
       * 但每一段都要进 segs（用于判断「某点是否落在别的线的身上」）。 */
      const pts = parsePoints(a.points);
      if (!pts) return;
      const wi = wires.length;
      const pp = pts.map(p => P(p[0], p[1]));
      for (let i = 1; i < pp.length; i++) segs.push({ a: pp[i - 1], b: pp[i], wi: wi, filled: false });
      if (pp.length >= 2) wires.push({ a: pp[0], b: pp[pp.length - 1], wi: wi, el: el });
    } else if (tag === 'PATH') {
      const pd = parseD(a.d);
      if (!pd) return;
      /* 闭合路径（箭头三角形、闭合框）没有线头 */
      if (pd.closed) {
        pd.segs.forEach(s => segs.push({ a: P(s[0][0], s[0][1]), b: P(s[1][0], s[1][1]), wi: -1, filled: true }));
        return;
      }
      const wi = wires.length;
      const pts = [];
      pd.segs.forEach(s => {
        const pa = P(s[0][0], s[0][1]), pb = P(s[1][0], s[1][1]);
        segs.push({ a: pa, b: pb, wi: wi, filled: false });
        pts.push(pa, pb);
      });
      if (pts.length >= 2) wires.push({ a: pts[0], b: pts[pts.length - 1], wi: wi, el: el });
    } else if (tag === 'RECT') {
      const x = parseFloat(a.x || 0), y = parseFloat(a.y || 0);
      const w = parseFloat(a.width || 0), h = parseFloat(a.height || 0);
      const c = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]].map(p => P(p[0], p[1]));
      shapes.push({ kind: 'rect', c: c, fill: a.fill });
    } else if (tag === 'CIRCLE') {
      const cx = parseFloat(a.cx || 0), cy = parseFloat(a.cy || 0), r = parseFloat(a.r || 0);
      shapes.push({ kind: 'circ', cx: cx, cy: cy, r: r, ctr: P(cx, cy), fill: a.fill });
    } else if (tag === 'POLYGON') {
      /* 填充多边形：标准库 arrow() 的**实心三角箭头**就是它。
       * ⚠ 早先完全没被收集 → 检测器**看不见**箭头，于是把「杆的末端」与
       *   「元件引线端」当成两个线头（原理讲解 3.7 页 svgD 假报 3 条）。
       *   必须收集成 shape，才可能由 bridgedByFilledPoly 判定「缺口被箭头跨越」。 */
      const pts = parsePoints(a.points);
      if (!pts || pts.length < 3) return;
      shapes.push({ kind: 'poly', c: pts.map(p => P(p[0], p[1])), fill: a.fill });
    }
    (el.children || []).forEach(cc => walk(cc, tm));
  };
  (root.children || []).forEach(c => walk(c, IDM));
  return { segs: segs, shapes: shapes, wires: wires };
}

/* ---------------- 几何辅助 ---------------- */
function dist(p, q) { return Math.hypot(p[0] - q[0], p[1] - q[1]); }
function pointSegDist(p, s) {
  const [a, b] = s;
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const L2 = dx * dx + dy * dy;
  if (L2 < 1e-9) return dist(p, a);
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}
/* 一个形状是不是「实心」（有可见填充）。
 * 只有实心形状才能「跨越缺口」；一圈 fill:none 的轮廓不导电、也不遮住缺口。 */
function isFilledShape(sh) {
  const f = String(sh.fill === undefined || sh.fill === null ? '' : sh.fill).trim().toLowerCase();
  if (!f) return false;
  if (f === 'none' || f === 'transparent') return false;
  return true;
}
/* 点是否落在多边形内部（含边界容差 tol）。
 * 射线法判内外，边界另用「到边的距离 ≤ tol」判「在边上」。 */
function ptInPoly(p, c, tol) {
  if (!c || c.length < 3) return false;
  const t = (tol === undefined) ? JOIN : tol;
  const n = c.length;
  for (let i = 0; i < n; i++) {
    if (pointSegDist(p, [c[i], c[(i + 1) % n]]) <= t) return true;   /* 边界上 */
  }
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const yi = c[i][1], yj = c[j][1];
    if ((yi > p[1]) !== (yj > p[1])) {
      const xc = (c[j][0] - c[i][0]) * (p[1] - yi) / (yj - yi) + c[i][0];
      if (p[0] < xc) inside = !inside;
    }
  }
  return inside;
}
/* 缺口是否被一个**实心多边形完整跨越**：
 * 缺口的两个线头**都**落在该多边形内部或边界上 → 这段缺口被实心形状盖住，不是断口。
 *
 * 为什么需要这条规则：标准库 arrow() 的杆画到「尖端前 0.7×headLength」就停
 * （headLength=9 → 6.3px），剩下的空隙由**实心三角头**填满。
 * 检测器早先只收集 LINE/POLYLINE/PATH/RECT/CIRCLE，**完全没有 POLYGON**，
 * 于是看不见箭头三角，把「杆的末端」与「元件引线端」当成两个线头
 * （原理讲解 3.7 页 svgD 假报 3 条）。
 *
 * 判据要求「两端点都在内/边界上」而不是「一端在内」——
 * 只盖住一半的缺口仍是真断口，不能放过（回归用例④专门盯这一条）。 */
function bridgedByFilledPoly(x, y, G) {
  if (!POLY) return false;
  for (const sh of G.shapes) {
    if (sh.kind !== 'poly') continue;
    if (!isFilledShape(sh)) continue;
    if (ptInPoly(x, sh.c, JOIN) && ptInPoly(y, sh.c, JOIN)) return true;
  }
  return false;
}
function shapeDist(sh, p) {
  if (sh.kind === 'circ') return Math.abs(dist(p, sh.ctr) - sh.r);
  /* 多边形：只有**实心**的才算实体（未填充的只是一圈轮廓，线头落在轮廓上不等于接上）。
   * GAP_POLY=0 时多边形对检测器完全不可见。 */
  if (sh.kind === 'poly' && (!POLY || !isFilledShape(sh))) return Infinity;
  /* 到轮廓的距离。⚠ 边数不能写死 4 —— 三角形只有 3 条边，
   *   写死会在 c[3] 上取到 undefined（这是本轮补 POLYGON 时踩到的坑）。 */
  let best = Infinity;
  const c = sh.c;
  const n = c.length;
  for (let i = 0; i < n; i++) {
    const a = c[i], b = c[(i + 1) % n];
    best = Math.min(best, pointSegDist(p, [a, b]));
  }
  return best;
}

/* ---------------- 主检测 ---------------- */
/* 点是否落在线段的**内部**（端点重合不算）。
 * 区分两种情况：
 *   · 装饰箭头压在导线上 → 箭尖落在导线内部 → 线头已接在电路里 → 不是断口
 *   · 真实断头发生在 T 形节点 → 第三条线的**端点**正好落在缺口点上 → 仍然要报 */
function pointSegInterior(p, s) {
  const [a, b] = s;
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const L2 = dx * dx + dy * dy;
  if (L2 < 1e-9) return false;
  const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2;
  if (t <= 0.02 || t >= 0.98) return false;      /* 端点不算「穿过」 */
  const qx = a[0] + t * dx, qy = a[1] + t * dy;
  return Math.hypot(p[0] - qx, p[1] - qy) <= JOIN;
}
/* 跨图元附着：线头落在**第三条图元**身上 → 它已经接在电路里，不是断口。
 * 典型场景：直流电流方向的装饰箭头（arrow()）压在一根导线上，
 * 箭尖落在导线内部。只做「成对判定」时会误报，因为成对的那条线是电感/回路。
 * 例：#svgFeed 线头(140,70) 与 (140,66) —— (140,66) 其实落在 V_CC 引线上。 */
function touchesOtherWire(p, excludeWi, G) {
  for (const s of G.segs) {
    if (s.wi < 0) continue;                        /* 闭合形状（箭头三角、闭合框）不参与 */
    if (excludeWi.indexOf(s.wi) >= 0) continue;    /* 排除本对的两条 */
    if (pointSegInterior(p, [s.a, s.b])) return true;
  }
  return false;
}
/* 「线头落在端子圆心」豁免的开关。GAP_PORT_INNER=0 可关掉 —— 回归脚本用它做故障注入，
 * 证明这条规则真的接上了（关掉后必须重新报出）。 */
const PORT_INNER = process.env.GAP_PORT_INNER !== '0';
function touchesShape(p, G) {
  for (const sh of G.shapes) {
    const d = shapeDist(sh, p);
    if (d <= JOIN) return true;
    if (sh.kind === 'circ') {
      if (d <= 4) return true;                        /* 同名端圆点 / 端子圆圈（轮廓附近） */
      /* 线头落在端子圆圈**圆心** → 已接到该端子，不算断口。
       * 起因：标准库 port() 画的是「空心端子圆圈 + 导线端点正好落在圆心」，
       * 而 shapeDist 对圆返回的是「到轮廓的距离」= r（端口 r=4.5 > 旧的 4px 容差），
       * 于是端子线头被当成悬空线头 → 假报「共线缺口」。
       * 判据取「到圆心的距离 ≤ JOIN」而不是「落在圆内」——
       * 前者只豁免**确实落在端子锚点上**的线头，
       * 圆圈内侧 1~3px 处的「差一点没接上」仍要报出来。 */
      if (PORT_INNER && Math.hypot(p[0] - sh.ctr[0], p[1] - sh.ctr[1]) <= JOIN) return true;
    }
  }
  return false;
}
function isShortParallel(A, B) {
  const la = Math.hypot(A.b[0] - A.a[0], A.b[1] - A.a[1]);
  const lb = Math.hypot(B.b[0] - B.a[0], B.b[1] - B.a[1]);
  /* 两段都很短 = 元件自身的一部分（电容极板、接地横杠、端子小段），不是导线断口 */
  if (la < 20 && lb < 20) return true;
  return false;
}
/* ---------------- 「符号笔画」判定 ----------------
 * 电容极板、接地横杠这类**元件符号的一笔**，不是导线：
 * 它们的两个端点没有电气意义，检测器不该把它们当线头。
 *
 * 判据（同时满足）：
 *   ① 本段很短（长度 ≤ SYM_MAX）；
 *   ② 有一条**与它垂直**的线段，其端点落在本段的**中间 40%** 上（T 形接点）。
 * 典型：电容极板 = 水平短段，竖直引线接在正中；接地横杠 = 水平短段，竖直短桩接在正中。
 *
 * 为什么必须要求「垂直 + 正中」：普通导线也可能是短段、也可能有 T 形交点；
 * 只有「垂直接在正中」才是符号笔画的结构特征。
 *
 * 误报场景（本规则要消掉的）：
 *   · 两个相邻电容的极板碰巧共线（图 4.8：x=380 与 x=430 两支的极板）
 *   · 两个相邻接地符号的最长横杠共线（图 8.11：x=580 与 x=640 两个接地）
 * 这两处两段都是「符号笔画」，不是导线断口。
 */
const SYM_MAX = +(process.env.GAP_SYM_MAX || 34);       /* 符号笔画的最大长度（px） */
/* 「同轴短横线堆叠」的最大间距（px）：接地符号相邻横杠的间距约 7px，
 * 取 12 留余量。GAP_SYM_STACK=0 可关掉判据② —— 回归脚本用它做故障注入，
 * 证明这条规则真的接上了（关掉后必须重新报出）。 */
const SYM_STACK = +(process.env.GAP_SYM_STACK || 12);
function projT(p, w) {
  const dx = w.b[0] - w.a[0], dy = w.b[1] - w.a[1];
  const L2 = dx * dx + dy * dy;
  if (L2 < 1e-9) return -1;
  return ((p[0] - w.a[0]) * dx + (p[1] - w.a[1]) * dy) / L2;
}
function isSymbolStroke(w, G) {
  const la = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
  if (la < 1e-6 || la > SYM_MAX) return false;
  const horiz = Math.abs(w.b[1] - w.a[1]) <= HORIZ;
  const vert = Math.abs(w.b[0] - w.a[0]) <= HORIZ;
  if (!horiz && !vert) return false;
  /* 判据①：有一条与它垂直的线段，其端点落在本段中间 40% 上（T 形接点）。
     典型：电容极板 = 水平短段，竖直引线接在正中；接地符号最长那根横杠 = 竖直短桩接在正中。 */
  for (const s of G.segs) {
    if (s.wi < 0 || s.wi === w.wi) continue;
    const sh = Math.abs(s.b[1] - s.a[1]) <= HORIZ;
    const sv = Math.abs(s.b[0] - s.a[0]) <= HORIZ;
    if (horiz ? !sv : !sh) continue;              /* 必须与本段垂直 */
    for (const p of [s.a, s.b]) {
      const t = projT(p, w);
      if (t < 0.3 || t > 0.7) continue;           /* 必须接在中间 40% */
      if (pointSegDist(p, [w.a, w.b]) <= JOIN) return true;
    }
  }
  /* 判据②：同轴短横线堆叠（接地 / 电平符号的多根横杠）。
     接地符号的**下两根**横杠没有任何垂直引线接在正中，按判据①认不出来；
     但它们与最长那根**中点同轴、上下紧邻**（Δx ≤ 2px，Δy ≤ 12px）——
     这正是「一组同心递减横杠」的结构特征，据此认成符号笔画。
     为什么必须补这条：两个独立接地符号的下横杠常常**共线**，
     判据①只认得出最长那根，于是下横杠之间被误报成「共线缺口」
     （原理讲解 3.7 页 svgA 的 Ⅰ/Ⅱ 两臂假负载，两个接地符号并排）。
     ⚠️ 该判据只在「两根都被认成符号笔画」时才起作用（见 findGaps 的
        `sym.has(A.wi) && sym.has(B.wi)`），不会放过真正的断口。 */
  if (horiz) {
    const mx = (w.a[0] + w.b[0]) / 2, my = w.a[1];
    for (const s of G.segs) {
      if (s.wi < 0 || s.wi === w.wi) continue;
      if (Math.abs(s.b[1] - s.a[1]) > HORIZ) continue;      /* 必须是水平短段 */
      const sl = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);
      if (sl < 1e-6 || sl > SYM_MAX) continue;
      const sx = (s.a[0] + s.b[0]) / 2, sy = s.a[1];
      if (Math.abs(sx - mx) <= 2 && Math.abs(sy - my) > 0.5 && Math.abs(sy - my) <= SYM_STACK) return true;
    }
  }
  return false;
}
/* 收集一幅图里所有「符号笔画」图元的下标 */
function symbolStrokeSet(G) {
  const set = new Set();
  for (const w of G.wires) if (isSymbolStroke(w, G)) set.add(w.wi);
  return set;
}
/* ---------------- 连通分量（并查集） ----------------
 * 核心思路：先把真正接在一起的图元并成「同一个电气节点」。
 *   ① 两端点重合（≤ JOIN）              → 同一个节点
 *   ② 某个端点落在另一条线的身上（T 形交点、电容极板上） → 同一个节点
 * 只有「本该相连、却分属两个连通分量」的线头，才算断口。
 * 这一层把下面三类误报一次性消掉：
 *   · 电容两极板之间的固有间隙（极板把两端并成了同一个节点）
 *   · 装饰箭头压在导线上（箭头端点落在导线身上 → 并入同一节点）
 *   · 用一条 2px 短引线搭桥（搭桥线把两端并成了同一个节点）
 */
function buildComponents(G) {
  const W = G.wires, n = W.length;
  const parent = new Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;
  function find(a) { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; }
  function union(a, b) { const ra = find(a), rb = find(b); if (ra !== rb) parent[rb] = ra; }

  const onBody = (p, wi) => {
    for (const s of G.segs) {
      if (s.wi !== wi) continue;
      if (pointSegDist(p, [s.a, s.b]) <= JOIN) return true;
    }
    return false;
  };
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const A = W[i], B = W[j];
      const same = dist(A.a, B.a) <= JOIN || dist(A.a, B.b) <= JOIN ||
                   dist(A.b, B.a) <= JOIN || dist(A.b, B.b) <= JOIN;
      if (same) { union(i, j); continue; }
      if (onBody(A.a, B.wi) || onBody(A.b, B.wi) || onBody(B.a, A.wi) || onBody(B.b, A.wi)) union(i, j);
    }
  }
  return { find: find, union: union };
}

/* 线段相交（算交叉，不含共线重叠的退化情形） */
function segCross(p1, p2, p3, p4) {
  const d = function (a, b, c) { return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]); };
  const d1 = d(p3, p4, p1), d2 = d(p3, p4, p2), d3 = d(p1, p2, p3), d4 = d(p1, p2, p4);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  const on = function (a, b, c) {
    return Math.abs(d(a, b, c)) < 1e-9 &&
      c[0] >= Math.min(a[0], b[0]) - 1e-9 && c[0] <= Math.max(a[0], b[0]) + 1e-9 &&
      c[1] >= Math.min(a[1], b[1]) - 1e-9 && c[1] <= Math.max(a[1], b[1]) + 1e-9;
  };
  if (on(p3, p4, p1) || on(p3, p4, p2) || on(p1, p2, p3) || on(p1, p2, p4)) return true;
  return false;
}
/* 缺口是否被「元件符号」跨越（电容两极板、方框内部）→ 不是断口 */
function spannedBySymbol(x, y, exWi, G) {
  let hits = 0;
  for (const s of G.segs) {
    if (s.wi < 0) continue;
    if (exWi.indexOf(s.wi) >= 0) continue;
    if (segCross(x, y, s.a, s.b)) { hits++; if (hits >= 2) return true; }
  }
  /* 缺口落在矩形/圆形元件的外形内部 */
  for (const sh of G.shapes) {
    if (sh.kind === 'circ') {
      if (dist(x, sh.ctr) <= sh.r + JOIN && dist(y, sh.ctr) <= sh.r + JOIN) return true;
      continue;
    }
    /* ⚠ 多边形**不能**走下面这条「外接矩形内部」判据：
     *   三角形的 bbox 比它本身大得多，会把「其实还在缺口外」的线头误判成「在元件内部」，
     *   等于把规则放松过头。多边形一律交给 bridgedByFilledPoly()
     *   （要求实心 + 两端点都在内）单独判定。 */
    if (sh.kind === 'poly') continue;
    const c = sh.c;
    const xs = c.map(p => p[0]), ys = c.map(p => p[1]);
    const x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
    const y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
    const inx = p => p[0] >= x0 - JOIN && p[0] <= x1 + JOIN;
    const iny = p => p[1] >= y0 - JOIN && p[1] <= y1 + JOIN;
    if (inx(x) && iny(x) && inx(y) && iny(y)) return true;
    for (let k = 0; k < c.length; k++) {
      const a = c[k], b = c[(k + 1) % c.length];
      if (pointSegDist(x, [a, b]) <= JOIN && pointSegDist(y, [a, b]) <= JOIN) return true;
    }
  }
  return false;
}
/* 找出一幅图里所有「疑似断头」。**唯一的判定实现**：
 *   check_gap.js 自己用它出报告；scratch/gap_detail.js 也用它出明细。
 *   历史上诊断脚本曾各自复制一份判定逻辑，闸门加了新规则后两边结论不一致
 *   （闸门 FAIL 0，诊断脚本报 3 条），所以必须共用这一份。 */
function findGaps(G) {
  const W = G.wires;                 /* 每条图元的真实首尾端点 */
  const comp = buildComponents(G);
  const sym = symbolStrokeSet(G);   /* 「符号笔画」图元（电容极板、接地横杠…） */
  const hits = [];

  for (let i = 0; i < W.length; i++) {
    for (let j = i + 1; j < W.length; j++) {
      const A = W[i], B = W[j];
      if (A.wi === B.wi) continue;                    /* 同一条图元 */
      if (comp.find(i) === comp.find(j)) continue;     /* 已经接在一起 */
      if (isShortParallel(A, B)) continue;            /* 电容极板、接地横杠 */
      /* 两笔都是「符号笔画」（电容极板 / 接地横杠）→ 是符号的一部分，不是导线断口 */
      if (sym.has(A.wi) && sym.has(B.wi)) continue;
      let best = null;
      for (const x of [A.a, A.b]) {
        for (const y of [B.a, B.b]) {
          const d = dist(x, y);
          if (d <= JOIN || d > TOL) continue;
          if (!best || d < best.d) best = { x: x, y: y, d: d };
        }
      }
      if (!best) continue;
      const exWi = [A.wi, B.wi];
      if (touchesShape(best.x, G) || touchesShape(best.y, G)) continue;
      /* 线头若落在第三条图元**内部**（装饰箭头压在导线上、T 形交点）→ 该端已接在电路里 */
      if (touchesOtherWire(best.x, exWi, G) || touchesOtherWire(best.y, exWi, G)) continue;
      /* 缺口被元件符号跨越（电容极板间隙、方框内部）→ 不是断口 */
      if (spannedBySymbol(best.x, best.y, exWi, G)) continue;
      /* 缺口被**实心多边形**完整跨越（标准库 arrow() 的实心三角盖住杆与端子之间的空隙）→ 不是断口 */
      if (bridgedByFilledPoly(best.x, best.y, G)) continue;

      const dA = [A.b[0] - A.a[0], A.b[1] - A.a[1]];
      const dB = [B.b[0] - B.a[0], B.b[1] - B.a[1]];
      const hA = Math.abs(dA[1]) <= HORIZ, vA = Math.abs(dA[0]) <= HORIZ;
      const hB = Math.abs(dB[1]) <= HORIZ, vB = Math.abs(dB[0]) <= HORIZ;
      const dx = best.y[0] - best.x[0], dy = best.y[1] - best.x[1];
      let why = null;
      if (hA && hB && Math.abs(dy) <= HORIZ) why = '共线缺口';
      else if (vA && vB && Math.abs(dx) <= HORIZ) why = '共线缺口';
      else if ((hA && vB) || (vA && hB)) {
        if (Math.abs(dx) <= 4 && Math.abs(dy) <= TOL) why = '拐角缺口';
      }
      if (!why) continue;
      hits.push({ why: why, x: best.x, y: best.y, d: best.d, A: A, B: B, exWi: exWi });
    }
  }
  return hits;
}
function checkSvg(id, G, rec) {
  for (const h of findGaps(G)) {
    rec.fail++;
    console.log('  [FAIL] 疑似断头（' + h.why + '）  #' + id +
      '  线头(' + h.x.map(v => v.toFixed(1)).join(',') + ') 与 (' + h.y.map(v => v.toFixed(1)).join(',') + ') 相距 ' + h.d.toFixed(1) + 'px');
  }
}

/* ---------------- 主流程 ---------------- */
function main() {
const targets = [];
const DIR = path.join(__dirname, 'parts');
if (fs.existsSync(DIR)) {
  for (const ch of fs.readdirSync(DIR).sort()) {
    const d = path.join(DIR, ch);
    if (!fs.statSync(d).isDirectory()) continue;
    fs.readdirSync(d).filter(f => /\.html$/.test(f)).sort()
      .forEach(f => targets.push({ label: 'parts/' + ch + '/' + f, file: path.join(d, f), noLib: false }));
  }
}
const EXDIR = path.join(__dirname, 'examples', 'pages');
if (fs.existsSync(EXDIR)) {
  fs.readdirSync(EXDIR).filter(f => /\.html$/.test(f)).sort()
    .forEach(f => targets.push({ label: 'examples/pages/' + f, file: path.join(EXDIR, f), noLib: true }));
}
/* ③ 已构建产物 viz/*.html —— 用 --viz 开启。
 *   为什么必须有这个开关：第 3 章那 7 页是独立手工整页（不在 parts/ 下），
 *   另有「工具演示」页 —— 它们既不在 parts/ 也不在 examples/pages/，
 *   不显式纳入就等于「没查」。
 *   ⚠️ 不要用命令行参数传中文文件名：PowerShell 会按 GBK 编码传给 node，
 *      路径会被拆成乱码（ENOENT）。用 --viz 或前缀过滤，别手写文件名。 */
const ARGS = process.argv.slice(2);
const VIZFLAG = ARGS.includes('--viz');
if (VIZFLAG) {
  const VIZ = path.join(__dirname, '..', 'viz');
  if (fs.existsSync(VIZ)) {
    fs.readdirSync(VIZ).filter(f => /\.html$/.test(f)).sort()
      .forEach(f => targets.push({ label: 'viz/' + f, file: path.join(VIZ, f), noLib: true }));
  }
}
/* 前缀过滤（--viz ch3 → 只看含 ch3 的页面）；纯文字页（入口/目录）不参与 */
const FILT = ARGS.filter(a => !a.startsWith('--')).filter(a => !/^\d+$/.test(a));
const TEXTPAGE = /^(00_|index|专题目录_)/;
/* 显式文件参数：node check_gap.js <file.html> → 额外查指定页面。
   ⚠️ 中文文件名经 PowerShell 传参会按 GBK 拆成乱码（ENOENT），
      所以日常请用 --viz / 前缀过滤，别在命令行手写中文名。 */
const FILEARGS = ARGS.filter(a => !a.startsWith('--') && /\.html$/i.test(a) && fs.existsSync(path.resolve(a)));
FILEARGS.forEach(f => {
  const full = path.resolve(f);
  targets.push({ label: path.relative(path.join(__dirname, '..'), full), file: full, noLib: true });
});
/* 前缀过滤：FILT 里既可能有「页名前缀」（如 ch3），也可能是**显式文件路径**。
 * ⚠️ 曾经只按 label（相对路径）做 indexOf 匹配 → 传**绝对路径**时永远匹配不上，
 *    于是显式传入的合成页面被过滤掉 → 检测器「零命中」却没人发现，
 *    连带让 scratch/test_gap_symstroke.js 这类回归用例一直假失败。
 *    现在补一条「解析后路径相同」的判据，两种写法都能命中。 */
const FILTERED = (FILT.length ? targets.filter(t => FILT.some(f =>
  t.label.indexOf(f) >= 0 ||
  (f && /\.html$/i.test(f) && path.resolve(f) === path.resolve(t.file)))) : targets)
  .filter(t => !TEXTPAGE.test(path.basename(t.file)));

let fail = 0;
for (const t of FILTERED) {
  const html = fs.readFileSync(t.file, 'utf8');
  const ids = [];
  const re = /<svg\b([^>]*)>/gi; let m;
  while ((m = re.exec(html)) !== null) {
    const im = /\bid\s*=\s*["']([^"']+)["']/i.exec(m[1]);
    if (im) ids.push(im[1]);
  }
  const ctx = prepare(t.file, { record: true });
  const errors = t.noLib ? execScriptsOneScope(ctx) : execScripts(ctx, { noLib: t.noLib });
  console.log('\n=== ' + t.label + ' ===');
  reportCaptured(ctx);
  if (errors.length) {
    errors.forEach(e => { console.log('  [FAIL] 脚本异常 ' + e.where + ': ' + e.msg); fail++; });
    continue;
  }
  const rec = { fail: 0 };
  let n = 0;
  ids.forEach(id => {
    const root = ctx.reg[id] || ctx.doc.getElementById(id);
    if (!root) return;
    const G = collect(root);
    n += G.segs.length;
    checkSvg(id, G, rec);
  });
  if (!rec.fail) console.log('  [PASS] 无断头/未接通  （线段 ' + n + ' 条）');
  fail += rec.fail;
}
console.log('\n--------------------------------------------');
console.log('汇总：FAIL ' + fail + ' 条');
/* 用 exitCode 而不是 exit()：管道输出时 exit() 会截断尚未刷出的 stdout */
process.exitCode = fail ? 1 : 0;
}

/* 作为库被 require 时只导出函数，不跑主流程（供 scratch/ 下的诊断脚本复用） */
module.exports = { parseD: parseD, collect: collect, checkSvg: checkSvg, findGaps: findGaps, main: main, TOL: TOL, JOIN: JOIN, ptInPoly: ptInPoly, bridgedByFilledPoly: bridgedByFilledPoly, isFilledShape: isFilledShape };
if (require.main === module) main();
