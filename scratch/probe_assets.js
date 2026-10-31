/* 临时探针：检查各课程页面是否引用本地资产（img / 绝对路径 / 非 html 本地文件） */
'use strict';
const fs = require('fs');
const path = require('path');

const dirs = [
  'D:/课程文档/通信电路/viz',
  'D:/课程文档/通信原理/viz',
  'D:/课程文档/通信原理'
];

for (const d of dirs) {
  const files = fs.readdirSync(d).filter(f => f.endsWith('.html'));
  const img = new Set(), abs = new Set(), loc = new Set(), ext = new Set();
  for (const f of files) {
    const s = fs.readFileSync(path.join(d, f), 'utf8');
    for (const m of s.matchAll(/<img[^>]+src\s*=\s*["']([^"']+)["']/gi)) img.add(f + ' → ' + m[1]);
    for (const m of s.matchAll(/(?:src|href)\s*=\s*["'](\/[^"']+)["']/gi)) abs.add(f + ' → ' + m[1]);
    for (const m of s.matchAll(/(?:src|href)\s*=\s*["'](?!https?:|\/\/|#|data:|mailto:)([^"']+\.(?:png|jpg|jpeg|svg|css|js|woff2?))["']/gi)) loc.add(f + ' → ' + m[1]);
    for (const m of s.matchAll(/(?:src|href)\s*=\s*["'](https?:\/\/[^"']+)["']/gi)) ext.add(f + ' → ' + m[1].slice(0, 80));
  }
  console.log('=== ' + d + '  (' + files.length + ' 个 html) ===');
  console.log('  <img> 引用      : ' + img.size); [...img].slice(0, 6).forEach(x => console.log('      ' + x));
  console.log('  绝对路径 /...   : ' + abs.size); [...abs].slice(0, 6).forEach(x => console.log('      ' + x));
  console.log('  本地非 html 资源: ' + loc.size); [...loc].slice(0, 8).forEach(x => console.log('      ' + x));
  console.log('  外链            : ' + ext.size); [...ext].slice(0, 6).forEach(x => console.log('      ' + x));
  console.log('');
}
