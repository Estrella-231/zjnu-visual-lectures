/* 临时探针：定位线上 HTML 与本地的差异 */
'use strict';
const https = require('https');
const fs = require('fs');
const path = require('path');

const BASE = 'https://qggpmfqcjeedw.space.mcode.cn';
const SITE = path.resolve(__dirname, '..', 'site');
const F = '原理讲解_4.0_信道的定义与分类_可视化.html';

function get(p) {
  return new Promise(res => {
    https.get(BASE + p, r => {
      const chunks = [];
      r.on('data', d => chunks.push(d));
      r.on('end', () => res(Buffer.concat(chunks)));
    }).on('error', e => res(Buffer.from('')));
  });
}

(async function () {
  const live = (await get('/' + encodeURIComponent(F))).toString('utf8');
  const local = fs.readFileSync(path.join(SITE, F), 'utf8');
  console.log('线上长度 = ' + live.length + '  本地长度 = ' + local.length + '  差 = ' + (live.length - local.length));

  let i = 0;
  while (i < Math.min(live.length, local.length) && live[i] === local[i]) i++;
  console.log('首个差异位置 = ' + i);
  console.log('线上：' + JSON.stringify(live.slice(Math.max(0, i - 60), i + 180)));
  console.log('本地：' + JSON.stringify(local.slice(Math.max(0, i - 60), i + 180)));

  console.log('\n线上是否含外部资源引用：');
  const ext = live.match(/(?:src|href)\s*=\s*["'](https?:)?\/\/[^"']+["']/gi) || [];
  console.log('  ' + (ext.length ? ext.slice(0, 8).join('\n  ') : '(无外部引用)'));
  console.log('线上是否含 <script src=：' + /<script[^>]+src=/i.test(live));
  console.log('线上是否含 manifest link：' + /rel="manifest"/i.test(live));
})();
