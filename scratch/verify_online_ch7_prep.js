'use strict';
/* verify_online_ch7_prep.js —— 线上第7章「预备概念」区内容核对（UTF-8 正确解码）
 * 规则：must = 必须存在；neg = 必须已消失（阶段一旧措辞）；ext = 禁外部资源 */
const BASE = ('https://qggpmfqcjeedw.space.mcode.cn').replace(/\/+$/, '');
const URL = BASE + '/tongxin-yuanli/' + encodeURIComponent('第7章-数字带通传输系统-可视化讲解.html');
const https = require('https');

/* 用 https 模块 + agent:false 一次性取回，避免 fetch 的 keep-alive socket
 * 在进程退出时触发 libuv 的 UV_HANDLE_CLOSING 断言（Windows 专属噪音）。 */
function get(u) {
  return new Promise((resolve, reject) => {
    https.get(u, { agent: false }, res => {
      const chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end', () => resolve({ status: res.statusCode, buf: Buffer.concat(chunks) }));
      res.on('error', reject);
    }).on('error', reject);
  });
}

const must = [
  ['预备概念区标题', '先别急着往下看'],
  ['预备概念·载波', '载波（carrier）'],
  ['预备概念·基带', '基带（baseband）'],
  ['预备概念·码元', '码元（symbol）'],
  ['预备概念·相干', '相干 / 非相干'],
  ['预备概念·误码率', '误码率（Pe）'],
  ['预备概念·收尾拆词', '现在你可以读懂下面这句话了'],
  ['口语化·三个旋钮卡', '同一串 0/1，三种写法'],
  ['口语化·辨析标题', '其实是三件不同的事'],
  ['口语化·表格表头', '这件事'],
  ['口语化·对照卡1', '数字调制和模拟调制，差在哪'],
  ['口语化·对照卡2', '由 M 说了算'],
  ['折叠区锚点', 'id="prep"'],
  ['折叠区类名', 'class="prep'],
  ['折叠区默认展开', 'class="prep open"'],
  ['五张 SVG 小图', 'class="mini"']
];
const neg = [
  ['旧·三个维度总标题', '这四张卡片，其实分属三个不同的维度'],
  ['旧·维度对照标题', '进制这一维：M 决定每码元带几个比特'],
  ['旧·vs 写法', '数字调制 vs 模拟调制：同与异']
];

(async () => {
  const res = await get(URL);
  const html = res.buf.toString('utf8');
  console.log('status', res.status, ' len', html.length);

  let bad = 0;
  for (const [name, needle] of must) {
    const has = html.includes(needle);
    if (!has) bad++;
    console.log((has ? '  [有] ' : '  [缺] ') + name + (has ? '' : '  ← ' + needle));
  }
  for (const [name, needle] of neg) {
    const gone = !html.includes(needle);
    if (!gone) bad++;
    console.log((gone ? '  [已清除] ' : '  [仍在] ') + name + (gone ? '' : '  ← ' + needle));
  }
  const extBad = /fonts\.googleapis\.com|<link[^>]+href="https?:/.test(html) ||
    /<script[^>]+src="https?:/.test(html) || /<img[^>]+src="https?:/.test(html);
  if (extBad) bad++;
  console.log((extBad ? '  [仍在] ' : '  [有] ') + '无外部资源引用');

  console.log(bad === 0 ? '✓ 阶段二内容全部在线，旧措辞已清除' : '✗ 异常 ' + bad + ' 项');
  process.exit(bad === 0 ? 0 : 1);
})();
