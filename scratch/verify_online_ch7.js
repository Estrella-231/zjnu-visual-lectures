'use strict';
/* 线上页面按 UTF-8 正确解码后核对新增内容 */
const https = require('https');
const BASE = 'https://qggpmfqcjeedw.space.mcode.cn';
function get(u) {
  return new Promise(res => {
    https.get(u, { headers: { 'User-Agent': 'Mozilla/5.0 Chrome/131' }, timeout: 25000 }, r => {
      const chunks = [];
      r.on('data', d => chunks.push(d));
      r.on('end', () => res({ code: r.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
      r.on('error', e => res({ code: 0, err: e.message }));
    }).on('error', e => res({ code: 0, err: e.message }));
  });
}
(async () => {
  const p = '/tongxin-yuanli/第7章-数字带通传输系统-可视化讲解.html';
  const url = BASE + p.split('/').map(encodeURIComponent).join('/') + '?v=' + Date.now();
  const r = await get(url);
  console.log('status ' + r.code + '  len ' + r.body.length);
  const checks = ['这四张卡片，其实分属三个不同的维度', '最容易混的一点', '交互 · 体制命名器',
    '数字调制 vs 模拟调制：同与异', '进制这一维：M 决定每码元带几个比特',
    '产生方法不写进体制名', 'id="w14"', 'data-b14="mul"', 'id="w14M"'];
  checks.forEach(c => console.log((r.body.indexOf(c) >= 0 ? '  [有] ' : '  [缺] ') + c));
  const bad = r.body.indexOf('产生方法<b>') >= 0 || r.body.indexOf('�') >= 0;
  console.log(bad ? '  ⚠ 发现标签残留或乱码' : '  ✓ 无标签残留、无 U+FFFD');
})();
