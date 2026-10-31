/* 体检：各 section 的交互密度 + 页级 script 的结构（为拆节试点选点） */
'use strict';
const fs = require('fs');
const s = fs.readFileSync('D:/课程文档/通信原理/第4章-信道-可视化讲解.html', 'utf8');
const lines = s.split(/\r?\n/);
const secRe = /<section[^>]*id="([^"]+)"[^>]*>/g;
const bounds = [];
let m;
while ((m = secRe.exec(s)) !== null) {
  bounds.push({ id: m[1], start: m.index, line: s.slice(0, m.index).split(/\r?\n/).length });
}
/* section 正文 = 从本 section 到下一 section（或 footer/script） */
const scriptIdx = s.lastIndexOf('<script>');
const footerIdx = s.indexOf('<footer');
for (let i = 0; i < bounds.length; i++) {
  const end = i + 1 < bounds.length ? bounds[i + 1].start
    : Math.min(scriptIdx > 0 ? scriptIdx : s.length, footerIdx > 0 ? footerIdx : s.length);
  const body = s.slice(bounds[i].start, end);
  const ids = [...new Set([...body.matchAll(/id="([^"]+)"/g)].map(x => x[1]))];
  const rng = (body.match(/type="range"/g) || []).length;
  const btn = (body.match(/<button/g) || []).length;
  const hdl = (body.match(/on(click|input|change)=/g) || []).length;
  const svg = (body.match(/<svg/g) || []).length;
  const dl = (body.match(/data-[a-z]+=/g) || []).length;
  console.log(bounds[i].id, 'L' + bounds[i].line,
    'len=' + String(end - bounds[i].start).padStart(5),
    'svg=' + String(svg).padStart(2), 'range=' + rng, 'btn=' + btn,
    '内联事件=' + hdl, 'data属性=' + dl, 'ids=' + ids.length);
}
/* 页级 script 结构 */
const sc = s.slice(scriptIdx);
console.log('\n页级 script: 起于 L' + s.slice(0, scriptIdx).split(/\r?\n/).length + ' 长度 ' + sc.length);
const fns = [...sc.matchAll(/function ([A-Za-z_$][\w$]*)\(/g)].map(x => x[1]);
console.log('function 数=' + fns.length);
console.log('前 60: ' + fns.slice(0, 60).join(', '));
const iife = /\(function\s*\(/.test(sc);
console.log('含 IIFE: ' + iife);
console.log('DOMContentLoaded/setInterval: ' + (sc.match(/DOMContentLoaded|setInterval/g) || []).length);
