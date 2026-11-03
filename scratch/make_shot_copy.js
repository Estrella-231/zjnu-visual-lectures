'use strict';
/* 造一份"只留新增辨析板块"的页面副本，用于截图核对版式。
   用法：node scratch/make_shot_copy.js <源页面相对路径> <副本名> <要保留的 section id 逗号分隔> */
const fs = require('fs'), path = require('path');
const SITE = path.join(__dirname, '..', 'site');
const src = path.join(SITE, process.argv[2]);
const outName = process.argv[3];
const keep = process.argv[4].split(',');
let html = fs.readFileSync(src, 'utf8');
html = html.replace(/<section\b([^>]*)id=["']([^"']+)["']([^>]*)>/gi, function (m, a, id, b) {
  if (keep.indexOf(id) >= 0) return m;
  return '<section' + a + 'id="' + id + '"' + b + ' style="display:none">';
});
/* 隐藏 hero 与 toc，只留正文 */
html = html.replace(/<header class="hero">([\s\S]*?)<\/header>/i, '<header class="hero" style="display:none">$1</header>');
fs.writeFileSync(path.join(SITE, outName), html, 'utf8');
console.log('已生成 ' + outName);
