/* check_online.js —— 线上全站链接体检：逐个 URL 查状态码
 * 用法：node scratch/check_online.js [站点根URL]
 * ⚠ CDN 缓存最长 30 天 → 追加 ?v=N 强制回源（否则测的是旧缓存）
 */
'use strict';
const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.resolve(__dirname, '..');
const SITE = path.join(ROOT, 'site');
const BASE = (process.argv[2] || 'https://qggpmfqcjeedw.space.mcode.cn').replace(/\/+$/, '');
const CACHE_BUST = process.env.ONLINE_V || String(Date.now());

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}
const files = walk(SITE).map(f => path.relative(SITE, f).replace(/\\/g, '/')).sort();

function head(url) {
  return new Promise(resolve => {
    const u = new URL(url);
    let done = false;
    const finish = o => { if (!done) { done = true; resolve(o); } };
    const req = https.request({
      hostname: u.hostname, path: u.pathname + u.search, method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131' },
      timeout: 25000
    }, res => {
      let n = 0;
      /* ⚠ 只统计字节数就够判状态码，但**不能**在中途 destroy 响应流：
         destroy 之后 'end' 不会触发，而 resolve 只挂在 'end' 上 → 请求永远挂起，
         整个脚本会静默卡在那个文件上（症状：只查了前几个 URL 就没有后续输出）。
         正确做法：继续把流读完（或用 res.destroy() 后走 'close' 事件 resolve）。 */
      res.on('data', d => { n += d.length; });
      res.on('end', () => finish({ code: res.statusCode, len: n, ctype: res.headers['content-type'] || '' }));
      res.on('close', () => finish({ code: res.statusCode, len: n, ctype: res.headers['content-type'] || '' }));
      res.on('error', e => finish({ code: res.statusCode || 0, len: n, err: e.message }));
    });
    req.on('error', e => finish({ code: 0, err: e.message }));
    req.on('timeout', () => { req.destroy(); finish({ code: 0, err: 'timeout' }); });
    req.end();
  });
}

(async () => {
  console.log('站点根：' + BASE + '   缓存绕过参数 v=' + CACHE_BUST);
  let ok = 0, bad = 0;
  const problems = [];
  for (const f of files) {
    const url = BASE + '/' + f.split('/').map(encodeURIComponent).join('/') + '?v=' + CACHE_BUST;
    const r = await head(url);
    const good = r.code === 200;
    if (good) ok++; else { bad++; problems.push(f + '  → HTTP ' + r.code + (r.err ? ' ' + r.err : '')); }
    const tag = good ? 'OK  ' : 'FAIL';
    console.log(tag + ' ' + f + '  [' + r.code + ' ' + (r.len || 0) + 'B' + (r.ctype ? ' ' + r.ctype : '') + ']');
  }
  console.log('\n--------------------------------------------');
  console.log('线上文件 ' + files.length + ' 个：OK ' + ok + ' / FAIL ' + bad);
  if (problems.length) { console.log('问题清单：'); problems.forEach(p => console.log('  - ' + p)); }
  process.exit(bad ? 1 : 0);
})();
