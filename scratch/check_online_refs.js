'use strict';
/* 线上 HTML 页面引用的所有本地资源 → 本地 site/ 是否存在（防部署后 404） */
const fs = require('fs'), path = require('path'), https = require('https');
const SITE = path.join(__dirname, '..', 'site');
const BASE = 'https://qggpmfqcjeedw.space.mcode.cn';
const V = String(Date.now());

function get(url) {
  return new Promise(res => {
    https.get(url + '?v=' + V, { headers: { 'User-Agent': 'Mozilla/5.0 Chrome/131' }, timeout: 25000 }, r => {
      let b = ''; r.on('data', d => b += d);
      r.on('end', () => res({ code: r.statusCode, body: b }));
      r.on('error', e => res({ code: 0, err: e.message }));
    }).on('error', e => res({ code: 0, err: e.message }));
  });
}
function walk(d, o = []) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); e.isDirectory() ? walk(p, o) : o.push(p); } return o; }
const localAll = walk(SITE).map(f => path.relative(SITE, f).split(path.sep).join('/'));
const localSet = new Set(localAll);

(async () => {
  /* 列出线上所有 html：先从本地清单出发（本地是权威来源） */
  const pages = localAll.filter(f => /\.html$/i.test(f));
  const miss = [];
  for (const p of pages) {
    const r = await get(BASE + '/' + p.split('/').map(encodeURIComponent).join('/'));
    if (r.code !== 200) { miss.push('PAGE HTTP ' + r.code + '  ' + p); continue; }
    const refs = new Set();
    let m;
    const re1 = /(?:src|href)\s*=\s*["']([^"':#?][^"']*)["']/gi;
    while ((m = re1.exec(r.body)) !== null) refs.add(m[1]);
    const re2 = /url\(\s*["']?([^"')]+)["']?\s*\)/gi;
    while ((m = re2.exec(r.body)) !== null) refs.add(m[1]);
    for (const raw of refs) {
      if (/^(?:https?:|data:|mailto:|javascript:|#|\/\/)/i.test(raw)) continue;
      const rel = path.posix.normalize(path.posix.join(path.posix.dirname(p), raw.split('#')[0].split('?')[0]));
      if (!localSet.has(rel)) miss.push('ASSET MISSING  ' + rel + '   ← ' + p);
    }
  }
  console.log('检查线上页面 ' + pages.length + ' 个');
  console.log('问题 ' + miss.length + ' 条');
  miss.slice(0, 40).forEach(x => console.log('  ' + x));
  /* 顺便报出线上存在、本地没有的候选（反向不可行，只能报本地有但线上 404 的） */
})();
