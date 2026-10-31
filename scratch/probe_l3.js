/* 临时探针：对例3-1 单测 localRefs 判定 */
'use strict';
const fs = require('fs');
const path = require('path');

const src = 'D:/课程文档/通信电路/viz/例题解法_例3-1_谐波阻抗比.html';
const html = fs.readFileSync(src, 'utf8');

function localRefs(h) {
  const out = [];
  let m;
  const re1 = /(?:src|href)\s*=\s*["'](?!https?:|\/\/|#|data:|mailto:)([^"']+)["']/gi;
  while ((m = re1.exec(h))) {
    const v = m[1];
    if (/\.(png|jpe?g|svg|gif|webp|css|js|woff2?|mp4|webm)$/i.test(v)) out.push(v);
  }
  const re2 = /url\(\s*["']?([^"')]+)["']?\s*\)/gi;
  while ((m = re2.exec(h))) {
    const v = m[1];
    if (/^(https?:|data:|\/\/|#)/i.test(v)) continue;
    out.push(v);
  }
  return out;
}
const refs = localRefs(html);
console.log('localRefs 数量 = ' + refs.length);
console.log(refs.slice(0, 10).map(r => '  ' + r + '   [basename=' + path.basename(r) + ']').join('\n'));

/* 找出该页里所有 build/examples 的原始出现 */
const idx = html.indexOf('build/examples');
console.log('\n首个 build/examples 位置 = ' + idx);
if (idx > 0) console.log('上下文: ' + JSON.stringify(html.slice(idx - 120, idx + 90)));

/* 检查是否为 <a> 锚点 */
const all = [...html.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/gi)].map(m => m[1]);
console.log('\n该页全部 src/href 中含 build 的：');
all.filter(x => x.includes('build')).forEach(x => console.log('  ' + x));
