/* dump_page_text.js —— 把独立整页 HTML 的可见正文抽成纯文本，便于人工核对。
 * 用法：node scratch/dump_page_text.js <file.html> [startLine] [endLine]
 * 注意：只删标签，**保留实体**（&lt; &gt; &amp; 等），避免把教材的不等号读成等号。
 */
'use strict';
const fs = require('fs');
const file = process.argv[2];
if (!file) { console.error('用法: node scratch/dump_page_text.js <file.html>'); process.exit(2); }
let s = fs.readFileSync(file, 'utf8');
// 去掉 <style> / <script> 段
s = s.replace(/<style[\s\S]*?<\/style>/gi, '\n[STYLE]\n');
s = s.replace(/<script[\s\S]*?<\/script>/gi, '\n[SCRIPT]\n');
// 块级标签换成换行
s = s.replace(/<\/(p|div|h1|h2|h3|h4|li|tr|section|figure|figcaption|details|summary|td|th|table|nav|header|main|body|html|blockquote)>/gi, '\n');
s = s.replace(/<(br|hr)\s*\/?>/gi, '\n');
// 删剩余标签
s = s.replace(/<[^>]*>/g, '');
s = s.replace(/&nbsp;/g, ' ');
s = s.replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(Number(d)));
s = s.replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCodePoint(parseInt(h, 16)));
s = s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"');
const lines = s.split(/\r?\n/).map(l => l.trim()).filter(l => l.length);
const a = Number(process.argv[3] || 1), b = Number(process.argv[4] || lines.length);
lines.slice(a - 1, b).forEach((l, i) => console.log((a + i) + ': ' + l));
console.log('---- 原始字符数 ' + fs.readFileSync(file, 'utf8').length + ' / 抽出文本行数 ' + lines.length);
