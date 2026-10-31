/* check_arxiv_license.js —— 核对各论文 arXiv 主页上的许可条款
 * 用法：node scratch/check_arxiv_license.js
 * 输出：arXiv 编号 | 标题前 60 字 | 许可（CC BY 4.0 / CC BY-NC / arXiv perpetual non-exclusive / 其他）
 */
'use strict';
const fs = require('fs');
const path = require('path');

const PAPER_ROOT = 'E:/Fuzhaodu/论文讲解/papers';

const LIC = [
  { re: /licenses\/by\/4\.0/i, tag: 'CC BY 4.0（可商用可改，需署名）' },
  { re: /licenses\/by-nc\/4\.0/i, tag: 'CC BY-NC 4.0（禁商用，需署名）' },
  { re: /licenses\/by-nc-nd\/4\.0/i, tag: 'CC BY-NC-ND 4.0（禁商用禁改，需署名）' },
  { re: /licenses\/by-nc-sa\/4\.0/i, tag: 'CC BY-NC-SA 4.0' },
  { re: /licenses\/by-sa\/4\.0/i, tag: 'CC BY-SA 4.0' },
  { re: /publicdomain\/zero|cc0/i, tag: 'CC0 / 公有领域' },
  { re: /arxiv\.org\/licenses\/(assumed|permanent|nonexclusive)/i, tag: 'arXiv 永久非独占许可（可再分发）' },
];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  const dirs = fs.readdirSync(PAPER_ROOT, { withFileTypes: true })
    .filter(e => e.isDirectory()).map(e => e.name).sort();

  const out = [];
  for (const d of dirs) {
    const t = path.join(PAPER_ROOT, d, 'text.txt');
    if (!fs.existsSync(t)) continue;
    const c = fs.readFileSync(t, 'utf8');
    const m = c.match(/arXiv[:\s]*(\d{4}\.\d{4,5})/);
    if (!m) { out.push({ dir: d, id: null, tag: '非 arXiv（需单独判断）' }); continue; }
    const id = m[1];
    let tag = '未取到';
    let title = '';
    try {
      const res = await fetch('https://arxiv.org/abs/' + id, {
        headers: { 'User-Agent': 'Mozilla/5.0 (license-check)' }
      });
      const html = await res.text();
      const tm = html.match(/<h1 class="title[^"]*">[\s\S]*?Title:([\s\S]*?)<\/h1>/i);
      if (tm) title = tm[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 58);
      const lm = html.match(/<div class="abs-license[^"]*">([\s\S]*?)<\/div>/i);
      if (lm) {
        /* 许可信息在 <a href> 里（图标 + “view license” 文本），不在文本节点里 */
        const href = (lm[1].match(/href="([^"]+)"/i) || [])[1] || '';
        const txt = lm[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        const hit = LIC.find(x => x.re.test(href) || x.re.test(txt));
        tag = hit ? hit.tag : ('未识别：' + (href || txt).slice(0, 70));
      }
    } catch (e) {
      tag = '取回失败：' + e.message.slice(0, 40);
    }
    out.push({ dir: d, id, tag, title });
    console.log('查询中… ' + id);
    await sleep(3500);          /* arXiv 对高频请求会限流，串行 + 间隔 */
  }

  console.log('\n================ arXiv 许可核对结果 ================');
  const counts = {};
  out.forEach(o => {
    counts[o.tag] = (counts[o.tag] || 0) + 1;
    console.log(
      (o.dir + '                              ').slice(0, 34) +
      (o.id || '—').padEnd(13) + ' | ' + o.tag
    );
  });
  console.log('\n---- 汇总 ----');
  Object.entries(counts).forEach(([k, v]) => console.log('  ' + v + ' 篇  ' + k));
  fs.writeFileSync(path.join(__dirname, '_arxiv_license.json'),
    JSON.stringify(out, null, 2), 'utf8');
})();
