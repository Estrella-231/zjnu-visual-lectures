/* 临时探针：论文讲解页的引用结构（本地图 / 外链 / 自包含性） */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = 'E:/Fuzhaodu/论文讲解/zotero_explainers';
const files = fs.readdirSync(ROOT).filter(f => f.endsWith('.html'));

function localRefs(html) {
  const out = [];
  let m;
  const re1 = /(?:src|href)\s*=\s*["'](?!https?:|\/\/|#|data:|mailto:)([^"']+)["']/gi;
  while ((m = re1.exec(html))) {
    const v = m[1];
    if (/\.(png|jpe?g|svg|gif|webp|css|js|woff2?|mp4|webm)$/i.test(v)) out.push(v);
  }
  const re2 = /url\(\s*["']?([^"')]+)["']?\s*\)/gi;
  while ((m = re2.exec(html))) {
    const v = m[1];
    if (/^(https?:|data:|\/\/|#)/i.test(v)) continue;
    out.push(v);
  }
  return out;
}
function extRefs(html) {
  const out = new Set();
  for (const m of html.matchAll(/(?:src|href)\s*=\s*["'](https?:\/\/[^"']+)["']/gi)) out.add(m[1]);
  for (const m of html.matchAll(/@import\s+["']([^"']+)["']/gi)) out.add(m[1]);
  for (const m of html.matchAll(/fonts\.(?:googleapis|gstatic)\.com[^"'\s]*/gi)) out.add(m[0]);
  return [...out];
}

console.log('=== 各讲解页的引用情况 ===');
let selfContained = 0;
for (const f of files) {
  const html = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const refs = localRefs(html);
  const ext = extRefs(html);
  const dirs = new Set(refs.map(r => path.dirname(r)));
  const missing = refs.filter(r => !fs.existsSync(path.resolve(ROOT, r)));
  if (!refs.length && !ext.length) selfContained++;
  console.log('  ' + f.padEnd(34) + ' 本地图=' + String(refs.length).padStart(3) +
    '  目录=' + [...dirs].join(',') + (missing.length ? '  ✗缺失' + missing.length : '') +
    (ext.length ? '  外链=' + ext.length : ''));
}
console.log('\n完全自包含的页面数 = ' + selfContained + ' / ' + files.length);

console.log('\n=== 一个示例页的引用明细 ===');
const sample = files.find(f => f.includes('讲解'));
const html = fs.readFileSync(path.join(ROOT, sample), 'utf8');
console.log('样本: ' + sample);
console.log('本地引用（前 12）:');
localRefs(html).slice(0, 12).forEach(r => console.log('   ' + r + '   存在=' + fs.existsSync(path.resolve(ROOT, r))));
console.log('外链:');
extRefs(html).forEach(r => console.log('   ' + r));
console.log('\n标题: ' + ((html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || '(无)'));
console.log('是否含 <svg>: ' + (html.match(/<svg[\s>]/gi) || []).length + ' 个');
console.log('是否含 MathJax/KaTeX: ' + /MathJax|KaTeX/i.test(html));
console.log('是否含 Math.random: ' + /Math\.random\(/.test(html));

console.log('\n=== pages_NN_* 目录内容抽样 ===');
const pdir = fs.readdirSync(ROOT).filter(d => d.startsWith('pages_'))[0];
const pf = fs.readdirSync(path.join(ROOT, pdir));
console.log(pdir + ' → ' + pf.length + ' 个文件: ' + pf.slice(0, 6).join(', '));
const sz = fs.readdirSync(path.join(ROOT, pdir)).reduce((n, x) => n + fs.statSync(path.join(ROOT, pdir, x)).size, 0);
console.log('  合计 ' + (sz / 1024 / 1024).toFixed(2) + ' MB');
