/* build_paper_license_meta.js —— 生成论文许可元数据表（build/paper_license_meta.json）
 *
 * 用途：论文讲解页要在页面上标注「图片来源与许可」，这份表是唯一事实来源。
 * 数据来源（全部为官方页面，非推断）：
 *   ① arXiv 论文 → https://arxiv.org/abs/<id> 的 <div class="abs-license"> 里 <a href> 指向的许可
 *   ② Nature Communications 论文 → https://www.nature.com/articles/<doi> 的版权元数据
 *
 * 用法：node build/build_paper_license_meta.js
 * 输出：build/paper_license_meta.json
 */
'use strict';
const fs = require('fs');
const path = require('path');

const PAPER_ROOT = 'E:/Fuzhaodu/论文讲解/papers';
const OUT = path.join(__dirname, 'paper_license_meta.json');

/* arXiv 的许可 href → 规范化标签（用于页面展示 + 判定能否公开原页图） */
const ARXIV_LIC = [
  { re: /creativecommons\.org\/licenses\/by\/4\.0/i, key: 'CC BY 4.0', name: 'CC BY 4.0（署名）', url: 'https://creativecommons.org/licenses/by/4.0/' },
  { re: /creativecommons\.org\/licenses\/by-nc\/4\.0/i, key: 'CC BY-NC 4.0', name: 'CC BY-NC 4.0（非商业 + 署名）', url: 'https://creativecommons.org/licenses/by-nc/4.0/' },
  { re: /creativecommons\.org\/licenses\/by-nd\/4\.0/i, key: 'CC BY-ND 4.0', name: 'CC BY-ND 4.0（禁改 + 署名）', url: 'https://creativecommons.org/licenses/by-nd/4.0/' },
  { re: /creativecommons\.org\/licenses\/by-nc-nd\/4\.0/i, key: 'CC BY-NC-ND 4.0', name: 'CC BY-NC-ND 4.0（非商业 + 禁改 + 署名）', url: 'https://creativecommons.org/licenses/by-nc-nd/4.0/' },
  { re: /creativecommons\.org\/licenses\/by-nc-sa\/4\.0/i, key: 'CC BY-NC-SA 4.0', name: 'CC BY-NC-SA 4.0（非商业 + 相同方式共享 + 署名）', url: 'https://creativecommons.org/licenses/by-nc-sa/4.0/' },
  { re: /creativecommons\.org\/licenses\/by-sa\/4\.0/i, key: 'CC BY-SA 4.0', name: 'CC BY-SA 4.0（相同方式共享 + 署名）', url: 'https://creativecommons.org/licenses/by-sa/4.0/' },
  { re: /arxiv\.org\/licenses\/nonexclusive-distrib/i, key: 'arXiv nonexclusive-distrib', name: 'arXiv 永久非独占许可（允许再分发）', url: 'http://arxiv.org/licenses/nonexclusive-distrib/1.0/' },
  { re: /arxiv\.org\/licenses\/assumed-cc-by/i, key: 'arXiv assumed-cc-by', name: 'arXiv 默认 CC BY 4.0 许可', url: 'http://arxiv.org/licenses/assumed-cc-by/' },
  { re: /arxiv\.org\/licenses\/permanent/i, key: 'arXiv perpetual', name: 'arXiv 永久许可（允许再分发）', url: 'http://arxiv.org/licenses/permanent/' },
];

/* 论文目录名 → 非 arXiv 论文的额外信息（DOI / 期刊） */
const EXTRA = {
  '17_NatComm_CloudCover_Nowcast': {
    source: 'https://www.nature.com/articles/s41467-023-44666-1',
    key: 'CC BY 4.0',
    name: 'CC BY 4.0（署名）',
    url: 'https://creativecommons.org/licenses/by/4.0/'
  }
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function stripTags(s) { return s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(); }

(async () => {
  const dirs = fs.readdirSync(PAPER_ROOT, { withFileTypes: true })
    .filter(e => e.isDirectory()).map(e => e.name).sort();

  const out = {};
  for (const d of dirs) {
    const t = path.join(PAPER_ROOT, d, 'text.txt');
    if (!fs.existsSync(t)) continue;
    const c = fs.readFileSync(t, 'utf8');
    const m = c.match(/arXiv[:\s]*(\d{4}\.\d{4,5})/);

    if (!m) {
      const ex = EXTRA[d];
      if (!ex) { console.log('⚠ 跳过（无 arXiv 编号且无手工元数据）：' + d); continue; }
      out[d] = {
        arxivId: null, title: null, authors: null, licenseKey: ex.key,
        licenseName: ex.name, licenseUrl: ex.url, sourceUrl: ex.source
      };
      console.log('手工元数据  ' + d + '  ' + ex.key);
      continue;
    }

    const id = m[1];
    let rec = null;
    try {
      const res = await fetch('https://arxiv.org/abs/' + id, {
        headers: { 'User-Agent': 'Mozilla/5.0 (license-meta/1.0)' }
      });
      const html = await res.text();
      const titleM = html.match(/<h1 class="title[^"]*">[\s\S]*?Title:([\s\S]*?)<\/h1>/i);
      const authM = html.match(/<div class="authors"[^>]*>([\s\S]*?)<\/div>/i);
      const licM = html.match(/<div class="abs-license[^"]*">([\s\S]*?)<\/div>/i);
      const href = licM ? ((licM[1].match(/href="([^"]+)"/i) || [])[1] || '') : '';
      const hit = ARXIV_LIC.find(x => x.re.test(href));
      const ver = (c.match(/arXiv:\d{4}\.\d{4,5}v(\d+)/i) || [])[1] || null;

      rec = {
        arxivId: id,
        arxivVersion: ver ? 'v' + ver : null,
        title: titleM ? stripTags(titleM[1]) : null,
        authors: authM ? stripTags(authM[1]).replace(/^Authors:\s*/, '') : null,
        licenseKey: hit ? hit.key : 'UNKNOWN',
        licenseName: hit ? hit.name : ('未识别：' + href),
        licenseUrl: hit ? hit.url : href,
        sourceUrl: 'https://arxiv.org/abs/' + id
      };
    } catch (e) {
      rec = { arxivId: id, licenseKey: 'FETCH_FAILED', licenseName: '取回失败：' + e.message, licenseUrl: '', sourceUrl: 'https://arxiv.org/abs/' + id };
    }
    out[d] = rec;
    console.log('已核对  ' + d.padEnd(32) + (rec.licenseKey || ''));
    await sleep(3500);
  }

  fs.writeFileSync(OUT, JSON.stringify(out, null, 2), 'utf8');

  console.log('\n---- 汇总 ----');
  const cnt = {};
  Object.entries(out).forEach(([k, v]) => { cnt[v.licenseKey] = (cnt[v.licenseKey] || 0) + 1; });
  Object.entries(cnt).forEach(([k, v]) => console.log('  ' + v + ' 篇  ' + k));
  const bad = Object.entries(out).filter(([, v]) => /UNKNOWN|FETCH_FAILED/.test(v.licenseKey));
  if (bad.length) { console.log('\n⚠ 仍有未识别许可：' + bad.map(b => b[0]).join(', ')); process.exit(1); }
  console.log('\n✓ 全部 ' + Object.keys(out).length + ' 篇许可已核对，写入 ' + OUT);
})();
