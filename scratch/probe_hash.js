/* 临时探针：核对线上内容与本地 site/ 逐字节一致 */
'use strict';
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const BASE = 'https://qggpmfqcjeedw.space.mcode.cn';
const SITE = path.resolve(__dirname, '..', 'site');

function sha(buf) { return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16); }

function get(p) {
  return new Promise(res => {
    https.get(BASE + p, r => {
      const chunks = [];
      r.on('data', d => chunks.push(d));
      r.on('end', () => res({ code: r.statusCode, buf: Buffer.concat(chunks) }));
    }).on('error', e => res({ code: 0, buf: Buffer.from('ERR ' + e.message) }));
  });
}

(async function () {
  console.log('=== 线上 vs 本地 site/ 逐字节核对 ===');
  const files = fs.readdirSync(SITE).filter(f => f !== 'index.html' || true);
  for (const f of files) {
    const r = await get('/' + encodeURIComponent(f));
    const local = fs.readFileSync(path.join(SITE, f));
    const same = r.code === 200 && r.buf.equals(local);
    console.log('  ' + f.padEnd(46) + ' HTTP ' + r.code +
      '  线上 ' + sha(r.buf) + '  本地 ' + sha(local) + '  → ' + (same ? '一致 ✓' : '不一致 ✗'));
  }
  console.log('\n（index.html 与 00_学习入口.html 内容相同，站点根的 index.html 是同一份）');
})();
