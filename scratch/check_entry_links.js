'use strict';
/* 线上入口页 → 所有 .html 链接：本地是否存在 + 线上是否 200 */
const fs = require('fs'), path = require('path'), https = require('https');
const SITE = path.join(__dirname, '..', 'site');
const BASE = 'https://qggpmfqcjeedw.space.mcode.cn';
const V = String(Date.now());
function get(u) {
  return new Promise(res => {
    https.get(u + '?v=' + V, { headers: { 'User-Agent': 'Mozilla/5.0 Chrome/131' }, timeout: 25000 }, r => {
      let b = ''; r.on('data', d => b += d);
      r.on('end', () => res({ code: r.statusCode, body: b }));
      r.on('error', e => res({ code: 0, err: e.message }));
    }).on('error', e => res({ code: 0, err: e.message }));
  });
}
function walk(d, o = []) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); e.isDirectory() ? walk(p, o) : o.push(p); } return o; }
const localSet = new Set(walk(SITE).map(f => path.relative(SITE, f).split(path.sep).join('/')));

(async () => {
  const entries = ['index.html', 'tongxin-dianlu/index.html', 'tongxin-yuanli/index.html', 'lunwen/index.html'];
  const allLinks = new Set();
  for (const e of entries) {
    const r = await get(BASE + '/' + e);
    if (r.code !== 200) { console.log('入口 ' + e + ' HTTP ' + r.code); continue; }
    const dir = e.includes('/') ? e.split('/')[0] : '';
    const re = /href\s*=\s*["']([^"']+\.html(?:#[^"']*)?)["']/gi;
    let m;
    while ((m = re.exec(r.body)) !== null) {
      let h = m[1].split('#')[0];
      if (/^https?:/i.test(h)) continue;
      const rel = dir ? dir + '/' + h : h;
      allLinks.add(rel);
    }
  }
  console.log('线上入口页共链接到 ' + allLinks.size + ' 个 html');
  let noLocal = 0, notOnline = 0;
  for (const l of [...allLinks].sort()) {
    if (!localSet.has(l)) { console.log('  本地缺: ' + l); noLocal++; continue; }
    const r = await get(BASE + '/' + l.split('/').map(encodeURIComponent).join('/'));
    if (r.code !== 200) { console.log('  线上 404: ' + l); notOnline++; }
  }
  console.log('本地缺 ' + noLocal + ' 个，线上 404 ' + notOnline + ' 个');
  /* 反查：本地 site/ 有、但线上入口页没链的 html（真正的孤儿） */
  const onlineEntryBlob = [];
  for (const e of entries) { const r = await get(BASE + '/' + e); onlineEntryBlob.push(r.body); }
  const blob = onlineEntryBlob.join('\n');
  const orphans = walk(SITE).filter(f => /\.html$/i.test(f))
    .map(f => path.relative(SITE, f).split(path.sep).join('/'))
    .filter(f => !/^index\.html$/.test(f) && blob.indexOf(path.basename(f)) < 0);
  console.log('\n本地有但线上入口页未链接的 html（' + orphans.length + '）:');
  orphans.forEach(o => console.log('   ' + o));
})();
