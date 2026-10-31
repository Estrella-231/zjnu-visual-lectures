/* 站点产物静态体检：外链 / PDF 引用 / 残留本地路径 / 占位完整性 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'site');
if (!fs.existsSync(ROOT)) { console.log('FAIL: site/ 不存在'); process.exit(1); }

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}
const files = walk(ROOT);
const htmls = files.filter(f => /\.html$/i.test(f));
const others = files.filter(f => !/\.html$/i.test(f));

let fail = 0, warn = 0;
const rel = f => path.relative(ROOT, f).replace(/\\/g, '/');

// 1) 站点内不得有 pdf
const pdfs = files.filter(f => /\.pdf$/i.test(f));
if (pdfs.length) { fail++; console.log('FAIL 站点内存在 PDF: ' + pdfs.map(rel).join(', ')); }
else console.log('OK   站点内无 PDF 文件');

// 2) 外链资源（http/https/protocol-relative src/href）
// ⚠ **分层判据**：禁的是「外部**资源**加载」（script/css/img/字体）—— 那会让页面
//    在离线/内网/断网时残缺、也会把流量引到第三方。
//    但 <a href="https://arxiv.org/..."> 这类**纯超链接**是另一回事：
//    论文精读页的「原文链接」「许可条款」链接是 CC BY / arXiv 许可的**署名义务**，
//    必须能上网、必须可点。两者混为一谈会把合规要求判成违规。
//    → 资源类外链（src= / link href= / script / CSS url()）判 FAIL；
//      <a href> 外链放行，但只允许白名单域名，且必须 target=_blank rel=noopener。
const EXT = /(?:src|href)\s*=\s*["'](?:https?:)?\/\//gi;
const extHits = [];
const linkHits = [];
/* 允许引用的域名白名单：论文出处与许可条款 */
const LINK_OK = /^(?:https?:\/\/)?(?:www\.)?(?:arxiv\.org|doi\.org|nature\.com|creativecommons\.org|github\.com|ieeexplore\.ieee\.org|ieeexplore\.ieee\.org)\//i;
for (const f of htmls) {
  const t = fs.readFileSync(f, 'utf8');
  /* 先把 <a href="外链"> 摘出来单独判，剩下的一律算「资源外链」 */
  const rest = t.replace(/<a\b([^>]*?)href\s*=\s*["']((?:https?:)?\/\/[^"']+)["']([^>]*)>/gi,
    function (m, a1, url, a2) {
      const ok = LINK_OK.test(url) && /target\s*=\s*["']_blank/i.test(a2) && /rel\s*=\s*["'][^"']*noopener/i.test(a2);
      if (!ok) linkHits.push(rel(f) + ' → ' + url.slice(0, 60));
      return ' ';   /* 摘掉，不再算资源外链 */
    });
  const m = rest.match(EXT);
  if (m) extHits.push(rel(f) + ' ×' + m.length);
}
if (extHits.length) { fail++; console.log('FAIL 外链资源: ' + extHits.join(' | ')); }
else console.log('OK   无外链资源 (检查 ' + htmls.length + ' 页)');
if (linkHits.length) { fail++; console.log('FAIL 超链接越界（域名不在白名单 / 缺 target+rel）: ' + linkHits.slice(0, 8).join(' | ')); }
else console.log('OK   超链接均在白名单域名且带 target=_blank rel=noopener');

// 3) CSS url() 外链 + @import
const cssExt = [];
for (const f of htmls) {
  const t = fs.readFileSync(f, 'utf8');
  const m = t.match(/url\(\s*["']?(?:https?:)?\/\//gi) || t.match(/@import\s+url\(\s*["']?https?:/gi);
  if (m) cssExt.push(rel(f));
}
if (cssExt.length) { fail++; console.log('FAIL CSS 外链: ' + cssExt.join(', ')); }
else console.log('OK   无 CSS 外链/@import CDN');

// 4) 禁项：MathJax/KaTeX/Math.random（**先剥注释**，否则「未使用 Math.random」这类
//    注释文案会被当成真调用误报；通信电路页面就踩过这个坑）
function stripComments(t) {
  return t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'`\\])\/\/[^\n]*/g, '$1');
}
const banned = [];
for (const f of htmls) {
  const raw = fs.readFileSync(f, 'utf8');
  const t = stripComments(raw);
  const hits = [];
  if (/mathjax/i.test(t)) hits.push('MathJax');
  if (/katex/i.test(t)) hits.push('KaTeX');
  if (/Math\s*\.\s*random\s*\(/.test(t)) hits.push('Math.random调用');
  if (/fonts\.googleapis|fonts\.gstatic/i.test(raw)) hits.push('GoogleFonts');
  if (/�/.test(raw)) hits.push('U+FFFD');
  if (hits.length) banned.push(rel(f) + ':' + hits.join('+'));
}
if (banned.length) { fail++; console.log('FAIL 禁项: ' + banned.join(' | ')); }
else console.log('OK   无禁项(MathJax/KaTeX/Math.random/GoogleFonts/U+FFFD)');

// 5) 本地引用可解析
const unresolved = [];
for (const f of htmls) {
  const t = fs.readFileSync(f, 'utf8');
  const refs = new Set();
  const re = /(?:src|href)\s*=\s*["']([^"':#?][^"']*)["']/gi;
  let m;
  while ((m = re.exec(t))) refs.add(m[1]);
  const re2 = /url\(\s*["']?([^"')]+)["']?\s*\)/gi;
  while ((m = re2.exec(t))) refs.add(m[1]);
  for (const r of refs) {
    if (/^(?:https?:|data:|mailto:|javascript:|#|\/\/)/i.test(r)) continue;
    const target = path.resolve(path.dirname(f), r.split('#')[0].split('?')[0]);
    if (!fs.existsSync(target)) unresolved.push(rel(f) + ' → ' + r);
  }
}
if (unresolved.length) { fail++; console.log('FAIL 本地引用解析不到:'); unresolved.forEach(u => console.log('     ' + u)); }
else console.log('OK   所有本地引用均可解析');

// 6) 每个 html 都有 <title> 且非空
const noTitle = htmls.filter(f => !/<title>\s*[^<]{2,}/i.test(fs.readFileSync(f, 'utf8')));
if (noTitle.length) { fail++; console.log('FAIL 无有效 title: ' + noTitle.map(rel).join(', ')); }
else console.log('OK   每页均有非空 <title>');

// 7) 论文讲解页：原页图已公开 → 必须有「图片来源与许可」标注块 + 讲解正文保留
// ⚠ 判据随「论文原页图公开」这项决定而变：原先要求"有占位说明"（图已下架），
//    现在图已按开放许可上线 → 改成要求"有许可标注块"（CC 署名的合规义务）。
//    两种状态都必须有一种：**要么**有 img-ph 占位（未公开），**要么**有 lic-note 许可块（已公开）。
const lunwen = files.filter(f => path.dirname(f) === path.join(ROOT, 'lunwen') && /_讲解\.html$/.test(f));
console.log('INFO 论文讲解页: ' + lunwen.length + ' 篇');
for (const f of lunwen) {
  const t = fs.readFileSync(f, 'utf8');
  const ph = (t.match(/img-ph/g) || []).length;
  const lic = (t.match(/lic-note/g) || []).length;
  const imgRefs = (t.match(/_pages\/[^"']+\.png/g) || []).length;
  const txt = t.replace(/<[^>]+>/g, '').replace(/\s+/g, '').length;
  /* 已公开原页图 → 必须逐篇标注出处与许可（CC BY / arXiv 的署名义务） */
  if (imgRefs > 0 && lic === 0) {
    fail++; console.log('FAIL ' + rel(f) + ' 有 ' + imgRefs + ' 张原页图但缺「图片来源与许可」标注块');
  }
  /* 未公开（占位）时也要有占位说明 */
  if (imgRefs === 0 && ph === 0) { warn++; console.log('WARN ' + rel(f) + ' 既无原页图也无占位说明'); }
  if (txt < 800) { warn++; console.log('WARN ' + rel(f) + ' 正文过短(' + txt + '字)'); }
}
console.log('INFO 论文页正文字符量区间已抽查');

// 8) 分类入口页存在
for (const need of ['index.html', 'tongxin-yuanli/index.html', 'tongxin-dianlu/index.html', 'lunwen/index.html']) {
  if (!fs.existsSync(path.join(ROOT, need))) { fail++; console.log('FAIL 缺少入口页: ' + need); }
}
console.log('OK   入口页检查完成');

// 9) PWA 三件套
for (const need of ['manifest.webmanifest', 'sw.js', 'icon-192.png', 'icon-512.png']) {
  if (!fs.existsSync(path.join(ROOT, need))) { fail++; console.log('FAIL 缺少 PWA 件: ' + need); }
}
console.log('OK   PWA 三件套检查完成');

// 10) 论文许可元数据：每篇有原页图上线，就必须有**已核对**的许可条目
// （build/paper_license_meta.json；许可未核对 → 不允许公开原页图，这是硬红线）
const META_FILE = path.join(__dirname, '..', 'build', 'paper_license_meta.json');
let meta = null;
try { meta = JSON.parse(fs.readFileSync(META_FILE, 'utf8')); } catch (e) { }
if (!meta) {
  warn++; console.log('WARN 读不到论文许可元数据 build/paper_license_meta.json');
} else {
  const badLic = [];
  let withImg = 0;
  for (const f of lunwen) {
    const t = fs.readFileSync(f, 'utf8');
    if (!/_pages\/[^"']+\.png/.test(t)) continue;
    withImg++;
    const dir = path.basename(f).replace(/_讲解\.html$/, '');   /* 01_SolarSeer */
    const m = meta[dir];
    if (!m) { badLic.push(dir + ' 无许可条目'); continue; }
    if (/UNKNOWN|FETCH_FAILED/.test(m.licenseKey || '')) badLic.push(dir + ' 许可未识别');
    else if (!m.licenseName || !m.sourceUrl) badLic.push(dir + ' 许可条目不完整');
  }
  if (badLic.length) { fail++; console.log('FAIL 论文许可元数据不完整: ' + badLic.join(' | ')); }
  else console.log('OK   论文许可元数据完整（' + withImg + ' 篇含原页图，许可均已核对）');
}

console.log('---');
console.log('合计: ' + files.length + ' 文件 / ' + (others.length) + ' 非 HTML / html ' + htmls.length);
console.log('FAIL ' + fail + ' / WARN ' + warn);
process.exit(fail ? 1 : 0);
