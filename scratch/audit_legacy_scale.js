/* 临时审计：旧 4 章整页 + 新试点页的规模统计（节数 / SVG / 滑块 / 外链 / 字体 / 自检标记） */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const files = [
  ['旧整页', path.join(ROOT, '第4章-信道-可视化讲解.html')],
  ['旧整页', path.join(ROOT, '第5章-模拟调制系统-可视化讲解.html')],
  ['旧整页', path.join(ROOT, '第6章-数字基带传输系统-可视化讲解.html')],
  ['旧整页', path.join(ROOT, '第7章-数字带通传输系统-可视化讲解.html')],
  ['新分节', path.join(ROOT, 'viz', '原理讲解_4.0_信道的定义与分类_可视化.html')]
];

const rows = [];
for (const [kind, f] of files) {
  if (!fs.existsSync(f)) { rows.push([kind, path.basename(f), '缺失']); continue; }
  const s = fs.readFileSync(f, 'utf8');
  const cnt = (re) => (s.match(re) || []).length;
  const externals = [...s.matchAll(/(?:src|href)\s*=\s*["'](https?:\/\/[^"']+)["']/gi)].map(m => m[1]);
  const fonts = [...s.matchAll(/fonts\.(googleapis|gstatic)\.com[^"'\s]*/gi)].map(m => m[0]);
  const fontFace = cnt(/@font-face/gi);
  const row = {
    kind,
    name: path.basename(f),
    KB: (Buffer.byteLength(s) / 1024).toFixed(1),
    section: cnt(/<section\b/gi),
    svg: cnt(/<svg[\s>]/gi),
    slider: cnt(/type\s*=\s*["']range["']/gi),
    formula: cnt(/class\s*=\s*["'][^"']*\bformula\b/gi),
    extURL: externals.length,
    googleFont: fonts.length,
    fontFace,
    titleCheck: /✓/.test((s.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || ''),
    selfCheck: /self-check|页末自检|自检/.test(s) ? '有' : '无'
  };
  rows.push(row);
}

console.log('类型     文件                                             KB     section svg slider formula 外链 谷歌字体 @font-face 标题✓');
for (const r of rows) {
  if (typeof r === 'string') { console.log(r); continue; }
  console.log(
    r.kind.padEnd(7) + ' ' + r.name.padEnd(46) + ' ' + String(r.KB).padStart(6) + ' ' +
    String(r.section).padStart(4) + String(r.svg).padStart(6) + String(r.slider).padStart(7) +
    String(r.formula).padStart(8) + String(r.extURL).padStart(6) + String(r.googleFont).padStart(9) +
    String(r.fontFace).padStart(11) + '  ' + (r.titleCheck ? '✓' : '—') + '  自检:' + r.selfCheck);
}

/* 外链明细 */
console.log('\n=== 外链明细 ===');
for (const [kind, f] of files) {
  if (!fs.existsSync(f)) continue;
  const s = fs.readFileSync(f, 'utf8');
  const ex = [...new Set([...s.matchAll(/(?:src|href)\s*=\s*["'](https?:\/\/[^"']+)["']/gi)].map(m => m[1]))];
  const gf = [...new Set([...s.matchAll(/fonts\.(?:googleapis|gstatic)\.com[^"'\s]*/gi)].map(m => m[0]))];
  if (ex.length || gf.length) {
    console.log(path.basename(f));
    ex.forEach(u => console.log('   URL  : ' + u));
    gf.forEach(u => console.log('   字体 : ' + u));
  }
}
