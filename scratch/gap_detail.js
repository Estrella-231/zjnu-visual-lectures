/* ===========================================================================
 * gap_detail.js —— 把 check_gap 的「疑似断头」逐条展开成可操作的细节
 *
 * 输出每条命中的：
 *   文件 / SVG id / 类型 / 间距 / 两个线头坐标 / 两条线各自的原始图元属性
 *   （标签、id、class、坐标、变换），以及「该线头附近的其它图元」。
 * 这样就能按坐标精确回改源文件，而不是靠猜。
 *
 * ⚠️ 判定逻辑**不再自带一份**：直接用 build/check_gap.js 导出的 findGaps()。
 *   历史上本文件复制过一份判定算法，闸门新增「符号笔画」规则后两边结论不一致
 *   （闸门 FAIL 0、本脚本报 3 条），排查时极易误判 —— 判定只能有一处。
 * =========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const { prepare, execScriptsOneScope } = require('../build/check.js');
const { collect, findGaps } = require('../build/check_gap.js');

const ROOT = path.join(__dirname, '..');
const EXDIR = path.join(ROOT, 'build', 'examples', 'pages');

/* 把图元属性转成一行可读描述 */
function describe(el, p1, p2) {
  if (!el) return '(无元素)';
  const a = el.attributes || {};
  const tag = el.tagName;
  const id = a.id ? ' #' + a.id : '';
  const cls = a.class ? ' .' + String(a.class).split(/\s+/).join('.') : '';
  let geo = '';
  if (tag === 'LINE') geo = 'x1=' + a.x1 + ' y1=' + a.y1 + ' x2=' + a.x2 + ' y2=' + a.y2;
  else if (tag === 'PATH') geo = 'd=' + a.d;
  else geo = '';
  const tr = a.transform ? ' transform=' + a.transform : '';
  const extra = [];
  for (const k of ['marker-end', 'stroke', 'stroke-width', 'fill', 'stroke-dasharray', 'data-label']) {
    if (a[k] !== undefined) extra.push(k + '=' + a[k]);
  }
  return '<' + tag + id + cls + '> ' + geo + tr + (extra.length ? ' | ' + extra.join(' ') : '') +
    ' | 端点 ' + p1.map(v => v.toFixed(1)).join(',') + ' → ' + p2.map(v => v.toFixed(1)).join(',');
}

/* 缺口两点之间还夹着哪些图元（元件符号/极板/方框） */
function betweenInfo(x, y, exWi, G) {
  const parts = [];
  const mx = (x[0] + y[0]) / 2, my = (x[1] + y[1]) / 2;
  const pad = 6;
  for (const s of G.segs) {
    if (exWi.indexOf(s.wi) >= 0) continue;
    const sx = [s.a[0], s.b[0]], sy = [s.a[1], s.b[1]];
    const x0 = Math.min.apply(null, sx), x1 = Math.max.apply(null, sx);
    const y0 = Math.min.apply(null, sy), y1 = Math.max.apply(null, sy);
    const hit = (x0 - pad <= mx && mx <= x1 + pad) && (y0 - pad <= my && my <= y1 + pad);
    if (hit) {
      const len = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);
      parts.push('seg(' + s.a.map(v => v.toFixed(0)).join(',') + '→' + s.b.map(v => v.toFixed(0)).join(',') +
        ' len=' + len.toFixed(0) + (s.wi < 0 ? ' closed' : ''));
    }
  }
  for (const sh of G.shapes) {
    if (sh.kind === 'circ') {
      if (Math.abs(sh.ctr[0] - mx) <= sh.r + pad && Math.abs(sh.ctr[1] - my) <= sh.r + pad)
        parts.push('circ(' + sh.ctr.map(v => v.toFixed(0)).join(',') + ' r=' + sh.r.toFixed(0) + ')');
    } else {
      const xs = sh.c.map(p => p[0]), ys = sh.c.map(p => p[1]);
      const x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
      const y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
      if (x0 - pad <= mx && mx <= x1 + pad && y0 - pad <= my && my <= y1 + pad)
        parts.push('rect(' + x0.toFixed(0) + ',' + y0.toFixed(0) + ' ' + (x1 - x0).toFixed(0) + 'x' + (y1 - y0).toFixed(0) + ')');
    }
  }
  return parts.length ? parts.join(' ; ') : '(空)';
}

const out = [];
function main() {
  const ARGS = process.argv.slice(2);
  const files = [];
  if (ARGS.includes('--viz')) {
    /* 第 3 章那 7 页与「工具演示」页是手工整页，不在 build/examples/pages/ 下 ——
       不显式纳入就等于「没查」。中文文件名不要在命令行手写（PowerShell 会按 GBK 拆乱码）。 */
    const VIZ = path.join(ROOT, 'viz');
    fs.readdirSync(VIZ).filter(f => /\.html$/.test(f)).sort().forEach(f => files.push(path.join(VIZ, f)));
  } else {
    fs.readdirSync(EXDIR).filter(f => /\.html$/.test(f)).sort().forEach(f => files.push(path.join(EXDIR, f)));
  }
  for (const file of files) {
    const f = path.basename(file);
    const html = fs.readFileSync(file, 'utf8');
    const ids = [];
    const re = /<svg\b([^>]*)>/gi; let m;
    while ((m = re.exec(html)) !== null) {
      const im = /\bid\s*=\s*["']([^"']+)["']/i.exec(m[1]);
      if (im) ids.push(im[1]);
    }
    const ctx = prepare(file, { record: true });
    const errors = execScriptsOneScope(ctx);
    if (errors.length) { out.push('!! ' + f + ' 脚本异常：' + errors.map(e => e.msg).join(';')); continue; }
    ids.forEach(id => {
      const root = ctx.reg[id] || ctx.doc.getElementById(id);
      if (!root) return;
      const G = collect(root);
      for (const h of findGaps(G)) {
        out.push([
          '--- ' + f + '  #' + id + '  ' + h.why + '  d=' + h.d.toFixed(1),
          '    线头A ' + h.x.map(v => v.toFixed(1)).join(',') + '   线头B ' + h.y.map(v => v.toFixed(1)).join(','),
          '    A: ' + describe(h.A.el, h.A.a, h.A.b),
          '    B: ' + describe(h.B.el, h.B.a, h.B.b),
          '    中间: ' + betweenInfo(h.x, h.y, h.exWi, G)
        ].join('\n'));
      }
    });
  }
  fs.writeFileSync(path.join(__dirname, 'gap_detail.txt'), out.join('\n'), 'utf8');
  console.log('共 ' + out.length + ' 条 → scratch/gap_detail.txt');
}
main();
