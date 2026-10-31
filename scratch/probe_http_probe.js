/* 临时探针：检查 18077 端口的 HTTP 根目录与目标页响应 */
'use strict';
const http = require('http');
const path = require('path');
const name = '原理讲解_4.0_信道的定义与分类_可视化.html';

const urls = [
  'http://127.0.0.1:18077/viz/' + encodeURIComponent(name),
  'http://127.0.0.1:18077/' + encodeURIComponent(name),
  'http://127.0.0.1:18077/'
];

let i = 0;
function next() {
  if (i >= urls.length) return;
  const u = urls[i++];
  const req = http.get(u, res => {
    let body = '';
    res.on('data', d => body += d);
    res.on('end', () => {
      const title = (body.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || '';
      console.log('URL   :', u);
      console.log('状态  :', res.statusCode, res.headers['content-type'] || '');
      console.log('长度  :', body.length);
      console.log('title :', JSON.stringify(title.trim().slice(0, 60)));
      console.log('svg数 :', (body.match(/<svg[\s>]/gi) || []).length);
      console.log('片段  :', JSON.stringify(body.slice(0, 160)));
      console.log('---');
      next();
    });
  });
  req.on('error', e => { console.log('URL   :', u, '\n错误  :', e.message, '\n---'); next(); });
  req.setTimeout(8000, () => { req.destroy(); console.log('URL   :', u, '\n超时\n---'); next(); });
}
next();
