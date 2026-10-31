/* ============================================================================
 * 通信原理 · 可视化讲解页 通用自检脚本
 * ---------------------------------------------------------------------------
 * 用法：
 *   node verify_page.js "D:\课程文档\通信原理\第7章-数字带通传输系统-可视化讲解.html"
 *
 * 作用：
 *   1) 抽出页面 <script> 做语法检查 + 桩 DOM 冒烟测试（抓运行时异常）
 *   2) 校验页面里的 erfc 实现精度（对照数学手册）
 *   3) 结构自检：交互图数量、滑块数量、章节数、目录链接数
 *   4) 第 7 章专属：逐条对撞教材公式（表 7-1、例题、习题 7-6/7-7/7-11、多进制公式）
 *
 * 为什么要它：交互页的数学如果写错，页面不会报错、截图也未必看得出来。
 *             把公式抽出来用 Node 复算并与教材数值对撞，是唯一可靠的自检手段。
 * ==========================================================================*/
const fs = require('fs');
const path = require('path');

const htmlPath = process.argv[2] ||
  'D:\\课程文档\\通信原理\\第7章-数字带通传输系统-可视化讲解.html';
const html = fs.readFileSync(htmlPath, 'utf8');
const isCh7 = /第7章|ch7/i.test(path.basename(htmlPath));

let ok = true;
function check(name, got, want, tol) {
  const pass = (typeof want === 'number') ? Math.abs(got - want) <= (tol || 1e-9) : got === want;
  if (!pass) ok = false;
  console.log((pass ? '  PASS  ' : '  FAIL  ') + name +
    '  got=' + got + (typeof want === 'number' ? ' want=' + want : ''));
}

/* ---------- 桩 DOM ---------- */
function makeEl(tag) {
  return {
    tagName: tag, children: [], attrs: {}, _text: '', _html: '', value: '', style: {},
    classList: { add() {}, remove() {} },
    setAttribute(k, v) { this.attrs[k] = v; },
    getAttribute(k) { return this.attrs[k]; },
    appendChild(c) { this.children.push(c); return c; },
    removeChild(c) {},
    addEventListener(ev, fn) { (this._ev = this._ev || {})[ev] = fn; },
    querySelectorAll() { return []; },
    get firstChild() { return this.children[0] || null; },
    get textContent() { return this._text; },
    set textContent(v) { this._text = String(v); },
    get innerHTML() { return this._html; },
    set innerHTML(v) { this._html = v; },
    getContext() { return new Proxy({}, { get: () => () => {} }); }
  };
}
const elements = {};
const defaults = {};
for (const m of html.matchAll(/<input[^>]*id="([^"]+)"[^>]*value="([^"]*)"/g)) defaults[m[1]] = m[2];
for (const m of html.matchAll(/<input[^>]*value="([^"]*)"[^>]*id="([^"]+)"/g)) defaults[m[2]] = m[1];
global.document = {
  getElementById(id) {
    if (!elements[id]) { elements[id] = makeEl('div'); elements[id].value = defaults[id] !== undefined ? defaults[id] : ''; }
    return elements[id];
  },
  createElementNS(ns, tag) { return makeEl(tag); },
  createElement(tag) { return makeEl(tag); },
  querySelectorAll() { return []; }
};
global.window = global;
global.setInterval = () => 0;
global.clearInterval = () => {};

console.log('\n=== 1. 脚本语法 + 桩 DOM 冒烟测试 ===');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.error('  FAIL  未找到 <script>'); process.exit(1); }
try {
  new Function(m[1])();
  console.log('  PASS  脚本解析并执行完毕，无运行时异常');
} catch (e) {
  ok = false;
  console.log('  FAIL  ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 5).join('\n'));
}

/* ---------- 数学工具（与页面同款） ---------- */
function erfc(x) {
  const z = Math.abs(x), t = 1 / (1 + 0.5 * z);
  const c = [1.00002368, 0.37409196, 0.09678418, -0.18628806, 0.27886807,
    -1.13520398, 1.48851587, -0.82215223, 0.17087277];
  let res = c[8];
  for (let i = 7; i >= 0; i--) res = c[i] + t * res;
  const ans = t * Math.exp(-z * z - 1.26551223 + t * res);
  return x >= 0 ? ans : 2 - ans;
}
const sqrt = Math.sqrt, exp = Math.exp, log10 = Math.log10;

console.log('\n=== 2. erfc 精度（对照数学手册） ===');
const known = { 0: 1, 0.5: 0.4795001222, 1: 0.1572992071, 1.5: 0.0338948535, 2: 0.00467773498, 3: 2.20904970e-5, 4: 1.54172579e-8 };
for (const k in known) {
  const x = parseFloat(k);
  const err = Math.abs(erfc(x) - known[k]) / known[k];
  const pass = err < 1e-6;
  if (!pass) ok = false;
  console.log((pass ? '  PASS  ' : '  FAIL  ') + 'erfc(' + x + ') 相对误差=' + err.toExponential(2));
}

/* ---------- 结构自检 ---------- */
console.log('\n=== 3. HTML 结构自检 ===');
const charts = (html.match(/<svg class="chart"/g) || []).length;
const sliders = (html.match(/type="range"/g) || []).length;
const secs = (html.match(/<section id="s\d+"/g) || []).length;
const toc = (html.match(/<nav class="toc">[\s\S]*?<\/nav>/) || [''])[0];
const tocLinks = (toc.match(/href="#s\d+"/g) || []).length;
console.log('         交互图表: ' + charts + '   滑块: ' + sliders + '   章节: ' + secs + '   目录链接: ' + tocLinks);
if (charts === 0) { ok = false; console.log('  FAIL  没有任何交互图表'); }
if (secs !== tocLinks) { ok = false; console.log('  FAIL  章节数与目录链接数不一致'); }
/* 章节锚点与 section id 必须一一对应 */
const anchors = new Set((html.match(/href="#(s\d+)"/g) || []).map(s => s.slice(7, -1)));
const ids = new Set((html.match(/<section id="(s\d+)"/g) || []).map(s => s.slice(13, -1)));
for (const a of anchors) if (!ids.has(a)) { ok = false; console.log('  FAIL  目录锚点 #' + a + ' 无对应 section'); }
console.log((ok ? '  PASS  ' : '       ') + '锚点与 section id 对应关系检查完成');

/* ---------- 第7章专属：教材公式对撞 ---------- */
const isCh4 = /第4章|ch4/i.test(path.basename(htmlPath));
if (isCh4) {
  console.log('\n=== 4. 第4章：教材公式逐条对撞 ===');

  const L2 = Math.log2, L10 = Math.log10, SQ = Math.sqrt;

  console.log('\n-- §4.1 视线 / 天波几何（教材式 4.1-1 ~ 4.1-3）--');
  function dvis(hkm, rkm) { return SQ(hkm * hkm + 2 * rkm * hkm); }
  check('习题4-1 精确式 D = 2√(h²+2rh) = 45.149 km', 2 * dvis(0.04, 6370), 45.1487, 5e-4);
  check('习题4-1 近似式 h=D²/50 → D = 44.721 km（课件答案）', SQ(40 * 50), 44.7214, 5e-4);
  check('习题4-2 4/3 等效半径单跳跳距 = 5274.34 km', 2 * dvis(400, 6370 * 4 / 3), 5274.3404, 5e-3);
  check('习题4-2 误用真实半径 6370 km 只有 4585.19 km', 2 * dvis(400, 6370), 4585.1936, 5e-3);
  check('习题4-3 覆盖地面半径 R = √(h²+2rh) = 505.173 km', dvis(20, 6370), 505.1732, 5e-4);
  check('习题4-3 若误乘 2 得 1010.35 km（错误）', 2 * dvis(20, 6370), 1010.3465, 5e-3);

  console.log('\n-- §4.1 自由空间传播（教材式 4.1-11 / 4.1-12）--');
  function PRfree(fMHz, dkm, PtW, Gt, Gr) {
    const lam = 300 / fMHz;
    return lam * lam * PtW * Gt * Gr / (16 * Math.PI * Math.PI * Math.pow(dkm * 1000, 2));
  }
  function Ltr(fMHz, dkm, Gt, Gr) {
    const lam = 300 / fMHz;
    return 16 * Math.PI * Math.PI * Math.pow(dkm * 1000, 2) / (lam * lam * Gt * Gr);
  }
  check('教材例4-1 P_R = 3.5621×10⁻⁹ W', PRfree(800, 50, 10, 100, 10).toExponential(4), 3.5621e-9, 5e-13);
  check('教材例4-1 L_tr = 94.483 dB', 10 * L10(Ltr(800, 50, 100, 10)), 94.483, 5e-3);
  check('L_fs 速算式 32.44+20lgd+20lgf = 124.481 dB',
    32.44 + 20 * L10(50) + 20 * L10(800), 124.481, 5e-3);
  const pt49 = 4e-9 * 16 * Math.PI * Math.PI * Math.pow(50000, 2) / (Math.pow(1 / 6, 2) * 100 * 10);
  check('习题4-9 最小发射功率 P_T = 56.849 W', pt49, 56.8489, 5e-3);
  check('习题4-9 P_T = 47.547 dBm', 10 * L10(pt49) + 30, 47.547, 5e-3);

  console.log('\n-- §4.5 热噪声（教材式 4.5-1）--');
  check('习题4-5 V = √(4kTRB) = 7.7211 μV',
    SQ(4 * 1.38e-23 * 300 * 600 * 6e6) * 1e6, 7.72114, 1e-4);
  check('4kTRB = 5.9616×10⁻¹¹', 4 * 1.38e-23 * 300 * 600 * 6e6, 5.9616e-11, 1e-14);

  console.log('\n-- §4.6 离散信道容量（式 4.6-1 ~ 4.6-6）--');
  function H(probs) { return -probs.reduce((s, p) => s + p * L2(p), 0); }
  function capCalc(px, k) {
    const M = px.length, post = [], py = [];
    for (let i = 0; i < M; i++) {
      let s = 0;
      for (let j = 0; j < M; j++) s += px[j] * (i === j ? 1 - (M - 1) * k : k);
      py.push(s);
    }
    for (let i = 0; i < M; i++) {
      const row = [];
      for (let j = 0; j < M; j++) row.push(px[j] * (i === j ? 1 - (M - 1) * k : k) / py[i]);
      post.push(row);
    }
    let Hxy = 0;
    for (let b = 0; b < M; b++) for (let c = 0; c < M; c++) Hxy -= py[b] * post[b][c] * L2(post[b][c]);
    return { Hx: H(px), Hxy: Hxy, C: H(px) - Hxy };
  }
  const ex42 = capCalc([0.5, 0.5], 8 / 1024);
  check('教材例4-2 H(x) = 1.000000 b/符号', ex42.Hx, 1, 1e-9);
  check('教材例4-2 H(x/y) = 0.065915 b/符号（教材取近似 0.065）', ex42.Hxy, 0.0659147, 1e-6);
  check('教材例4-2 C = 0.934086 b/符号（教材近似 0.935）', ex42.C, 0.9340853, 1e-6);
  check('教材例4-2 C_t = 934.09 b/s（教材近似 935）', 1000 * ex42.C, 934.0853, 1e-2);
  const ex46 = capCalc([0.25, 0.25, 3 / 16, 5 / 16], 1 / 1024);
  check('习题4-6 H(x) = 1.977217 b/符号', ex46.Hx, 1.977217, 1e-6);
  check('习题4-6 H(x/y) = 0.033338 b/符号', ex46.Hxy, 0.033338, 1e-6);
  check('习题4-6 C = 1.943879 b/符号', ex46.C, 1.943879, 1e-6);
  check('习题4-7 C_t = 1943.88 b/s', 1000 * ex46.C, 1943.879, 1e-2);

  console.log('\n-- §4.6 连续信道容量（式 4.6-7 ~ 4.6-13）--');
  check('习题4-8 C = 3×10³·log₂(1+100) = 19974.63 b/s', 3e3 * L2(101), 19974.634, 1e-2);
  check('习题4-8 I = 400万×log₂16 = 16 Mbit', 4e6 * L2(16), 16e6, 1);
  check('习题4-8 t = I/C = 801.02 s', 16e6 / (3e3 * L2(101)), 801.016, 5e-3);
  check('课件例 C = 3×10³·log₂(1001) = 29901.68 b/s', 3e3 * L2(1001), 29901.68, 1e-2);
  check('课件例 每像素信息量 log₂12 = 3.584963 bit', L2(12), 3.584963, 1e-6);
  check('课件例 t = 269.76 s（课件用 I=8.055Mbit 得 269.4 s）',
    2.25e6 * L2(12) / (3e3 * L2(1001)), 269.76, 5e-2);
  const snr0 = 100;
  check('式(4.6-12) lim(B→∞)C = (S/n₀)·log₂e = 144.27 b/s', snr0 / Math.LN2, 144.2695, 1e-3);
  check('B=1 MHz 时 C 已达渐近值 144.262 b/s', 1e6 * L2(1 + snr0 / 1e6), 144.2622, 1e-3);
  check('式(4.6-13) C = B·log₂(1+E_b/n₀) 与式(4.6-8) 同式',
    1e6 * L2(1 + snr0 / 1e6), 1e6 * L2(1 + 100 / 1e6), 1e-12);

  console.log('\n-- §4.4 多径幅频（教材式 4.4-11）--');
  let maxErr = 0;
  for (let i = 0; i < 2000; i++) {
    const tau = 0.5 + i * 0.01, f = 10 + i * 7.3, w = 2 * Math.PI * f * tau;
    const a = SQ(Math.pow(1 + Math.cos(w), 2) + Math.pow(Math.sin(w), 2));
    const b = 2 * Math.abs(Math.cos(w / 2));
    maxErr = Math.max(maxErr, Math.abs(a - b));
  }
  check('|1+e^(−jωτ)| = 2|cos(ωτ/2)| 随机抽样最大误差 < 1e-12', maxErr < 1e-12, true);

  console.log('\n-- §4.5 噪声等效带宽（教材式 4.5-3 右端：只取正频率侧）--');
  /* 教材式 (4.5-3)：B_n = ∫_{-∞}^{∞}P_n(f)df/[2P_n(f₀)] = ∫₀^∞ P_n(f)df / P_n(f₀)
     窄带噪声 f₀ ≫ 带宽时负频率镜像可忽略，故 B_n = 正频率侧曲线下的面积 / P_n(f₀)。 */
  check('高斯型 B_n/B_3dB = 1.505384（= √(2π)/(2√ln2)）',
    SQ(2 * Math.PI) / (2 * SQ(Math.log(2))), 1.505384, 1e-6);
  check('矩形型 B_n = B_3dB（教材结论）', 1, 1, 1e-12);
  /* 复算页面 w10Draw 的数值积分算法 */
  (function () {
    const f0 = 5000, B3 = 1000, alpha = 0.5, N = 24000, spanI = 12000, df = spanI / N;
    const sg3 = B3 / (2 * SQ(Math.log(2)));
    const A3 = Math.acos(Math.SQRT2 - 1) / Math.PI;   /* 0.36421 */
    const shape = (f, mode) => {
      const x = Math.abs(f - f0);
      if (mode === 'rect') return x <= B3 / 2 ? 1 : 0;
      if (mode === 'gauss') return Math.exp(-(f - f0) * (f - f0) / (2 * sg3 * sg3));
      const x3 = B3 / 2, tr = x3, w0 = x3 * (1 - A3);
      if (x <= w0) return 1;
      if (x >= w0 + tr) return 0;
      const a = (x - w0) / tr;
      return 0.5 * (1 + Math.cos(Math.PI * a));
    };
    const bn = (mode) => {
      let t = 0;
      for (let i = 0; i < N; i++) t += shape(f0 - spanI / 2 + df * (i + 0.5), mode) * df;
      return t;
    };
    check('页面同算法 · 矩形 B_n = 1000 Hz', bn('rect'), 1000, 1e-6);
    check('页面同算法 · 高斯 B_n = 1505.387 Hz', bn('gauss'), 1505.387, 1e-2);
    check('页面同算法 · 升余弦 B_n = 1135.786 Hz（解析式，数值积分离散误差 < 1 Hz）',
      Math.abs(bn('rc') - 1135.786) < 1, true, 0);
    check('升余弦 -3 dB 点确实落在 ±B₃dB/2（幅值 1/√2）',
      shape(f0 + B3 / 2, 'rc'), 1 / Math.SQRT2, 1e-9);
    /* 形状本身必须合法：单调、无 W 形、无负值 */
    const A3b = Math.acos(Math.SQRT2 - 1) / Math.PI;
    const w0b = 500 * (1 - A3b), trb = 500;
    let mono = true, prev = Infinity, vmin = Infinity;
    for (let i = 0; i <= 400; i++) {
      const x = w0b + (trb * i) / 400;
      const v = 0.5 * (1 + Math.cos(Math.PI * (x - w0b) / trb));
      if (v > prev + 1e-12) mono = false;     /* 出现回升 ⇒ W 形 ⇒ 归一化写错 */
      if (v < vmin) vmin = v;
      prev = v;
    }
    check('升余弦过渡带单调下降（无 W 形）', mono, true, 0);
    check('升余弦过渡带末端归零', vmin < 1e-9, true, 0);
    check('高斯 -3 dB 点在 ±B₃dB/2（幅值 1/√2）',
      shape(f0 + B3 / 2, 'gauss'), 1 / Math.SQRT2, 1e-9);
    check('三种形状等效带宽次序：矩形 < 升余弦 < 高斯',
      bn('rect') < bn('rc') && bn('rc') < bn('gauss'), true, 0);
  })();

  console.log('\n-- §4.3 编码信道误码率 --');
  check('P_e = P(0)P(1/0)+P(1)P(0/1)（等概率 ⇒ 等于总错转概率）',
    0.5 * (1 / 128) + 0.5 * (1 / 128), 1 / 128, 1e-12);
  check('非等概率时不能直接相加', 0.7 * 0.1 + 0.3 * 0.1, 0.1, 1e-12);
}

/* ---------- 第7章专属：教材公式对撞 ---------- */
if (isCh7) {
  console.log('\n=== 4. 第7章：教材公式逐条对撞 ===');

  console.log('\n-- 表 7-1 误码率公式一览（r = 10） --');
  const r = 10;
  console.log('         2ASK 相干  ½erfc(√(r/4)) = ' + (0.5 * erfc(sqrt(r / 4))).toExponential(4));
  console.log('         2ASK 包络  ½e^(-r/4)       = ' + (0.5 * exp(-r / 4)).toExponential(4));
  console.log('         2FSK 相干  ½erfc(√(r/2)) = ' + (0.5 * erfc(sqrt(r / 2))).toExponential(4));
  console.log('         2FSK 包络  ½e^(-r/2)       = ' + (0.5 * exp(-r / 2)).toExponential(4));
  console.log('         2PSK 相干  ½erfc(√r)      = ' + (0.5 * erfc(sqrt(r))).toExponential(4));
  console.log('         2DPSK 相干 erfc(√r)       = ' + erfc(sqrt(r)).toExponential(4));
  console.log('         2DPSK 差分  ½e^(-r/2)       = ' + (0.5 * exp(-r / 2)).toExponential(4));

  console.log('\n-- 教材例题（p.195，r = 26） --');
  check('2ASK 相干 (1/√(πr))e^(-r/4) = 1.66e-4',
    ((1 / sqrt(Math.PI * 26)) * exp(-26 / 4)).toExponential(3), 1.66e-4, 5e-7);
  check('2ASK 包络 ½e^(-r/4) = 7.52e-4',
    (0.5 * exp(-26 / 4)).toExponential(3), 7.517e-4, 1e-7);

  console.log('\n-- 习题 7-11（r = 10 dB → 线性 10） --');
  check('2PSK  ½erfc(√10) = 3.87e-6', (0.5 * erfc(sqrt(10))).toExponential(3), 3.87e-6, 5e-9);
  check('2DPSK 相干 erfc(√10) = 7.74e-6', erfc(sqrt(10)).toExponential(3), 7.74e-6, 1e-8);
  check('2DPSK 差分 ½e^-5 = 3.37e-3', (0.5 * exp(-5)).toExponential(3), 3.37e-3, 5e-6);
  check('2DPSK 相干 = 2 × 2PSK', erfc(sqrt(10)), 2 * 0.5 * erfc(sqrt(10)), 1e-12);

  console.log('\n-- 习题 7-6（最优门限 b = a/2，r = 10） --');
  check('Pe = ½erfc(√(r/4)) = 0.012674', (0.5 * erfc(sqrt(10 / 4))).toFixed(6), 0.012674, 1e-6);

  console.log('\n-- 3 dB 关系（反解 r） --');
  function solveR(f, target) {
    let lo = -30, hi = 70;
    for (let i = 0; i < 200; i++) {
      const mid = (lo + hi) / 2, rr = Math.pow(10, mid / 10);
      if (f(rr) > target) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }
  const aAsk = solveR(rr => 0.5 * erfc(sqrt(rr / 4)), 1e-4);
  const aFsk = solveR(rr => 0.5 * erfc(sqrt(rr / 2)), 1e-4);
  const aPsk = solveR(rr => 0.5 * erfc(sqrt(rr)), 1e-4);
  const lAsk = Math.pow(10, aAsk / 10), lFsk = Math.pow(10, aFsk / 10), lPsk = Math.pow(10, aPsk / 10);
  console.log('         Pe=1e-4: 2ASK r=' + lAsk.toFixed(2) + ' (' + aAsk.toFixed(2) + ' dB), ' +
    '2FSK r=' + lFsk.toFixed(2) + ' (' + aFsk.toFixed(2) + ' dB), 2PSK r=' + lPsk.toFixed(2) + ' (' + aPsk.toFixed(2) + ' dB)');
  check('r_ASK / r_FSK = 2', lAsk / lFsk, 2, 1e-9);
  check('r_FSK / r_PSK = 2', lFsk / lPsk, 2, 1e-9);
  check('r_ASK / r_PSK = 4', lAsk / lPsk, 4, 1e-9);
  check('2ASK 比 2PSK 差 6.02 dB', aAsk - aPsk, 6.0206, 1e-3);
  check('2FSK 比 2PSK 差 3.01 dB', aFsk - aPsk, 3.0103, 1e-3);

  console.log('\n-- 多进制公式 --');
  const maskPe = (M, rr) => (1 - 1 / M) * erfc(sqrt(3 / (M * M - 1)) * sqrt(rr));
  check('MASK M=2 退化为 ½erfc(√r) (=2PSK)', maskPe(2, 10), 0.5 * erfc(sqrt(10)), 1e-12);
  console.log('         MASK r=10: M=4 → ' + maskPe(4, 10).toExponential(3) +
    '   M=8 → ' + maskPe(8, 10).toExponential(3) + '   M=16 → ' + maskPe(16, 10).toExponential(3));
  console.log('         MPSK r=20: M=4 → ' + erfc(sqrt(20) * Math.sin(Math.PI / 4)).toExponential(3) +
    '   M=8 → ' + erfc(sqrt(20) * Math.sin(Math.PI / 8)).toExponential(3));
  console.log('         MDPSK r=20: M=4 → ' + erfc(sqrt(40) * Math.sin(Math.PI / 8)).toExponential(3));
  const qpsk = 1 - Math.pow(1 - 0.5 * erfc(sqrt(20 / 2)), 2);
  check('QPSK 精确式(7.5-33) 与 MPSK 近似(7.5-36) 同量级', qpsk / erfc(sqrt(20) * Math.sin(Math.PI / 4)) < 1.2, true);

  console.log('\n-- 2DPSK 差分编码链 --');
  const abs = [1, 0, 0, 1, 1, 0, 1, 0];
  const rel = []; let cur = 0;
  for (const a of abs) { cur = a ^ cur; rel.push(cur); }
  const dec = []; let prev = 0;
  for (const b of rel) { dec.push(b ^ prev); prev = b; }
  check('差分译码还原绝对码', dec.join(''), abs.join(''));
  let flips = 0; for (let i = 1; i < rel.length; i++) if (rel[i] !== rel[i - 1]) flips++;
  console.log('         绝对码 ' + abs.join('') + ' → 相对码 ' + rel.join('') + '（' + flips + ' 次 π 跳变）');
}

console.log('\n=== 结果 ===');
console.log(ok ? '  全部通过 ✅' : '  存在未通过项 ❌');
process.exit(ok ? 0 : 1);
