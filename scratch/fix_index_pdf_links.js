/* 给 index.html 的 PDF 链接统一加 docs/ 前缀（幂等）；UTF-8 无 BOM，替换后自检。 */
'use strict';
const fs = require('fs');
const p = 'D:/课程文档/通信原理/index.html';
const orig = fs.readFileSync(p, 'utf8');
let s = orig;
const hits = (s.match(/href="[^"]*\.pdf"/g) || []).length;
s = s.replace(/href="([^"]*\.pdf)"/g, (m, a) =>
  a.indexOf('docs/') === 0 ? m : 'href="docs/' + a + '"');
fs.writeFileSync(p, s);
const now = fs.readFileSync(p, 'utf8');
const after = (now.match(/href="docs\/[^"]*\.pdf"/g) || []).length;
const bad = (now.match(/href="docs\/docs\//g) || []).length;
console.log('原PDF链接:', hits, '| 现docs/前缀:', after, '| 重复前缀:', bad,
  '| 字节:', orig.length, '->', now.length);
if (after !== hits || bad > 0) { console.error('FAIL'); process.exit(1); }
console.log('PASS');
