/* serve.js —— 本地静态服务器（给 Browser 预览 / verify_runtime / 手机访问用）
 * 用法：node scratch/serve.js [port]
 * 根目录固定为本工程根 D:/课程文档/通信原理
 *
 * ⚠ 手机访问要点：
 *   1) 本机与手机必须连**同一个 WiFi**；
 *   2) 手机浏览器打开脚本打印的「手机可访问地址」（http://<内网IP>:<端口>/）；
 *   3) Windows 防火墙首次会弹窗 → 必须点「**允许访问**」（专用网络），
 *      否则手机会连不上；
 *   4) **不要用微信/QQ 内置浏览器**打开（缓存与 PWA 支持都受限），
 *      用系统浏览器（Chrome / Edge / Safari）。
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const PORT = +(process.argv[2] || 18076);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.md': 'text/markdown; charset=utf-8'
};

/* 列出本机可用于手机访问的内网 IPv4 */
function lanIPs() {
  const out = [];
  const ifs = os.networkInterfaces();
  for (const name of Object.keys(ifs)) {
    for (const i of ifs[name] || []) {
      if (i.family !== 'IPv4' || i.internal) continue;
      if (/^(169\.254|127\.)/.test(i.address)) continue;
      out.push({ name: name, ip: i.address });
    }
  }
  return out;
}

http.createServer(function (req, res) {
  let p = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(ROOT, path.normalize(p).replace(/^([/\\])+/, ''));
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end('403'); return; }
  fs.readFile(file, function (e, b) {
    if (e) { res.writeHead(404); res.end('404 ' + p); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(b);
  });
}).listen(PORT, '0.0.0.0', function () {
  console.log('serving ' + ROOT + ' on http://127.0.0.1:' + PORT + '/');
  const ips = lanIPs();
  if (ips.length) {
    console.log('手机可访问地址（需同一 WiFi，防火墙放行本端口）：');
    ips.forEach(function (x) { console.log('   http://' + x.ip + ':' + PORT + '/   [' + x.name + ']'); });
  } else {
    console.log('未找到内网 IPv4 —— 手机暂时无法访问（可先用 http://127.0.0.1:' + PORT + '/）');
  }
});
