/* 临时探针：查通信电路页面引用的本地图片到底是什么、有多大、被哪些页用 */
'use strict';
const fs = require('fs');
const path = require('path');

const VIZ = 'D:/课程文档/通信电路/viz';
const files = fs.readdirSync(VIZ).filter(f => f.endsWith('.html'));
const refs = new Map();      /* 资源路径 → [用到它的页面] */
const perPage = new Map();   /* 页面 → 资源数 */

for (const f of files) {
  const s = fs.readFileSync(path.join(VIZ, f), 'utf8');
  const set = new Set();
  for (const m of s.matchAll(/(?:src|href)\s*=\s*["'](?!https?:|\/\/|#|data:|mailto:)([^"']+\.(?:png|jpg|jpeg|svg))["']/gi)) {
    set.add(m[1]);
    if (!refs.has(m[1])) refs.set(m[1], []);
    refs.get(m[1]).push(f);
  }
  if (set.size) perPage.set(f, set.size);
}

console.log('=== 引用本地图片的页面（' + perPage.size + ' / ' + files.length + '）===');
[...perPage.entries()].sort((a, b) => b[1] - a[1]).forEach(([f, n]) => {
  const kind = f.startsWith('原理讲解') ? '原理讲解' : f.startsWith('例题解法') ? '例题解法' : f.startsWith('习题解法') ? '习题解法' : '其他';
  console.log('  [' + kind + '] ' + f + '  → ' + n + ' 张');
});

console.log('\n=== 引用到的图片文件（共 ' + refs.size + ' 个）===');
let total = 0, missing = 0;
const groups = {};
for (const [rel, users] of refs) {
  const abs = path.resolve(VIZ, rel);
  let size = 0, ok = false;
  if (fs.existsSync(abs)) { size = fs.statSync(abs).size; ok = true; total += size; } else { missing++; }
  const dir = path.dirname(rel).replace(/\\/g, '/');
  groups[dir] = groups[dir] || { n: 0, bytes: 0, missing: 0 };
  groups[dir].n++;
  groups[dir].bytes += size;
  if (!ok) groups[dir].missing++;
}
Object.keys(groups).sort().forEach(d => {
  console.log('  ' + d + '  → ' + groups[d].n + ' 个，合计 ' + (groups[d].bytes / 1024 / 1024).toFixed(2) + ' MB' +
    (groups[d].missing ? '，其中 ' + groups[d].missing + ' 个文件不存在' : ''));
});
console.log('\n  图片总体积 = ' + (total / 1024 / 1024).toFixed(2) + ' MB；缺失 = ' + missing);
