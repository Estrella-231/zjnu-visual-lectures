/* verify_site.js —— 对 site/ 发布目录做真实浏览器（无头 Chrome）验收
 *
 * 查什么：
 *   1) 页面能否正常加载（DOM 非空、title 非空、正文有实质内容）
 *   2) 控制台是否有 error / 未捕获异常（serviceWorker 注册失败也算）
 *   3) 通信原理类页面：标题带 ✓（页末自检全过）+ 渲染出 SVG
 *   4) 论文精读页：原页图已按开放许可公开 → 必须有图、必须有「图片来源与许可」标注块、
 *      讲解正文完整、无残留 <img> 指向未发布的本地路径
 *      （2026-11-01 变更：原先判据是「原页图全被替换成占位」，那是图未公开时的口径）
 *   5) 门户页：三张课程卡片齐全、SW 注册脚本在位
 *
 * 用法：node scratch/verify_site.js [子串过滤]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const os = require('os');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = path.resolve(__dirname, '..');
const SITE = path.join(ROOT, 'site');
const PORT = +(process.env.VERIFY_PORT || 18081);
const CONC = +(process.env.VERIFY_CONC || 4);
const filter = process.argv[2] || process.env.VERIFY_FILTER || '';

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}
const all = walk(SITE).filter(f => /\.html$/i.test(f));
const targets = all
  .map(f => path.relative(SITE, f).replace(/\\/g, '/'))
  .filter(f => f.indexOf(filter) >= 0)
  .sort();

if (!targets.length) { console.error('没有匹配页面：filter=' + filter); process.exit(2); }

/* ---------- 自带静态服务器（根 = 工程根，站点在 /site/ 下） ---------- */
let serverProc = null;
function sh(cmd, args, opts) {
  return new Promise(resolve => {
    const p = spawn(cmd, args, opts);
    let out = '';
    p.stdout.on('data', d => out += d);
    p.stderr.on('data', d => out += d);
    p.on('close', code => resolve({ code, out }));
  });
}
function probe(port) {
  return new Promise(resolve => {
    const req = http.get('http://127.0.0.1:' + port + '/build/manifest.json', res => {
      let b = ''; res.on('data', d => b += d);
      res.on('end', () => resolve(/"ch"\s*:/.test(b) ? 'ours' : 'other'));
    });
    req.on('error', () => resolve('free'));
    req.setTimeout(2500, () => { req.destroy(); resolve('other'); });
  });
}
function startServer(port) {
  return new Promise((resolve, reject) => {
    const srv = spawn(process.execPath, [path.join(__dirname, 'serve.js'), String(port)],
      { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    srv.stdout.on('data', d => out += d);
    srv.stderr.on('data', d => out += d);
    srv.on('error', reject);
    srv.on('close', () => { if (!/serving .* on http/.test(out)) reject(new Error('server died')); });
    const t0 = Date.now();
    const tick = () => {
      if (/serving .* on http/.test(out)) { serverProc = srv; return resolve(); }
      if (srv.exitCode !== null) return;
      if (Date.now() - t0 > 15000) { try { srv.kill(); } catch (e) { } return reject(new Error('服务器未就绪')); }
      setTimeout(tick, 120);
    };
    tick();
  });
}
async function ensureServer() {
  for (let p = PORT; p < PORT + 8; p++) {
    const st = await probe(p);
    if (st === 'ours') { console.log('复用本工程服务器 :' + p); return p; }
    if (st === 'other') continue;
    try { await startServer(p); console.log('已启动服务器 :' + p); return p; } catch (e) { }
  }
  throw new Error('端口 ' + PORT + '~' + (PORT + 7) + ' 不可用');
}

/* ---------- 页面类别判定 ----------
 * legacy = 通信原理根目录的旧章节整页（第N章-*.html）：
 *   它们是阶段 2 拆节迁移**之前**的形态，教材公式对撞跑在**离线脚本**
 *   （scripts/verify_page.js）里，页面内没有页末自检、标题也不会带 ✓。
 *   因此不能套用分节页的「标题带 ✓」标准，否则整类假 FAIL；
 *   但仍必须满足：SVG 渲染出来、正文有实质内容、控制台零错误。 */
function kindOf(rel) {
  if (rel === 'index.html') return 'portal';
  if (/^lunwen\//.test(rel)) return /_讲解\.html$/.test(rel) ? 'paper' : 'entry';
  if (/^tongxin-yuanli\/第\d+章-/.test(rel)) return 'legacy';
  if (/(^|\/)(00_学习入口|专题目录_.*|index)\.html$/.test(rel)) return 'entry';
  return 'course';
}

/* ---------- 单页检查 ---------- */
async function checkOne(rel, base, profile) {
  const url = base + '/site/' + rel.split('/').map(encodeURIComponent).join('/');
  const r = await sh(CHROME, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-extensions',
    '--user-data-dir=' + profile + '/' + rel.replace(/[\\/]/g, '_'),
    '--virtual-time-budget=5000', '--enable-logging=stderr', '--v=0',
    '--dump-dom', url
  ], { cwd: SITE });

  const dom = r.out;
  const titleM = dom.match(/<title>([\s\S]*?)<\/title>/i);
  const title = titleM ? titleM[1].trim() : '';
  const errs = r.out.split(/\r?\n/).filter(l => /^\[ERROR:/i.test(l) || /Uncaught/i.test(l));
  const svg = (dom.match(/<svg[\s>]/gi) || []).length;
  const ph = (dom.match(/img-ph/gi) || []).length;
  const imgTags = (dom.match(/<img\b[^>]*>/gi) || []).length;
  /* 正文可见文本量：粗暴剥标签后按非空白字符计 */
  const body = dom.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '').replace(/\s+/g, '');
  const bodyLen = body.length;
  const selfLines = r.out.replace(/\[.*?INFO:CONSOLE:\d+\]\s*"/g, '')
    .replace(/",\s*source:.*$/gm, '').split(/\r?\n/).map(l => l.trim())
    .filter(l => /^(PASS|FAIL)\s{1,}\S/.test(l));
  const selfFail = selfLines.filter(l => /^FAIL/.test(l));

  const kind = kindOf(rel);
  const why = [];
  if (!title) why.push('无 title');
  if (bodyLen < 200) why.push('正文过少(' + bodyLen + ')');
  if (errs.length) why.push('控制台 ' + errs.length + ' 条: ' + errs.slice(0, 2).join(' | ').slice(0, 220));
  if (selfFail.length) why.push('自检 FAIL ' + selfFail.length + ' 条');

  if (kind === 'course') {
    if (!/✓/.test(title)) why.push('标题无✓(' + title.slice(0, 30) + ')');
    if (svg === 0) why.push('无 SVG');
  }
  if (kind === 'legacy') {
    if (svg === 0) why.push('无 SVG');
    if (bodyLen < 3000) why.push('正文过少(' + bodyLen + ')');
    /* 旧整页没有页内自检是**已知待办**（阶段 2 拆节时补），不判 FAIL */
  }
  if (kind === 'paper') {
    /* 论文原页图已于 2026-11-01 按开放许可公开（原判据是「img 全被替换成占位」，
       那是图未公开时的口径）。现在的判据：
         ① 必须有原页图（<img> 指向 _pages/ 且是站内相对路径）
         ② 必须有「图片来源与许可」标注块（CC 署名的合规义务）
         ③ 讲解正文仍要完整（不能因为图上线就把文字删了） */
    const paperImgs = (dom.match(/<img\b[^>]*src\s*=\s*["'][^"']*_pages\/[^"']+["'][^>]*>/gi) || []).length;
    const localImgs = (dom.match(/<img\b[^>]*src\s*=\s*["'](?:\.\.\/|pages\/)[^"']+["'][^>]*>/gi) || []).length;
    const lic = (dom.match(/lic-note/g) || []).length;
    if (paperImgs === 0 && ph === 0) why.push('既无原页图也无占位说明');
    if (localImgs > 0) why.push(localImgs + ' 个 <img> 仍指向未发布的本地路径');
    if (paperImgs > 0 && lic === 0) why.push('有原页图但缺「图片来源与许可」标注块');
    if (bodyLen < 1500) why.push('讲解正文偏少(' + bodyLen + ')');
  }
  if (kind === 'portal') {
    /* 门户结构（2026-11-01 重做）：顶栏 + Hero + **两个独立区块**
       「课程讲义」（多张 .card）与「论文精读」（.paper 面板），
       顶栏导航分别锚到 #courses / #papers。 */
    const cards = (dom.match(/class="card"/g) || []).length;
    const secs = (dom.match(/<h2 class="serif">/g) || []).length;
    if (cards < 2) why.push('课程卡片 ' + cards + ' 张（应 ≥2）');
    if (secs < 2) why.push('区块标题 ' + secs + ' 个（应 ≥2：课程 / 论文）');
    if (!/id="courses"/.test(dom) || !/id="papers"/.test(dom)) why.push('缺 courses / papers 锚点区块');
    if (!/lunwen\/index\.html/.test(dom)) why.push('缺论文区入口链接');
    if (!/serviceWorker\.register/.test(dom)) why.push('缺 SW 注册');
    if (!/<title>课程讲义 · 论文精读<\/title>/.test(dom)) why.push('标题未改名');
  }
  return { rel, kind, ok: why.length === 0, why, title, svg, ph, bodyLen, self: selfLines.length };
}

async function main() {
  const port = await ensureServer();
  const base = 'http://127.0.0.1:' + port;
  const profile = path.join(os.tmpdir(), 'mavis-verify-site-' + process.pid);
  fs.mkdirSync(profile, { recursive: true });

  const results = [];
  let idx = 0;
  async function worker() {
    while (idx < targets.length) {
      const i = idx++;
      try { results.push(await checkOne(targets[i], base, profile)); }
      catch (e) { results.push({ rel: targets[i], ok: false, why: ['执行异常: ' + e.message] }); }
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker));

  results.sort((a, b) => a.rel.localeCompare(b.rel));
  let pass = 0, fail = 0;
  for (const r of results) {
    if (r.ok) { pass++; console.log('PASS  ' + r.rel + '  [' + r.kind + '|body ' + r.bodyLen + '|svg ' + r.svg + '|占位 ' + r.ph + ']'); }
    else { fail++; console.log('FAIL  ' + r.rel + '  → ' + r.why.join('；')); }
  }
  console.log('\n--------------------------------------------');
  console.log('站点页面 ' + results.length + ' 个：PASS ' + pass + ' / FAIL ' + fail);
  if (serverProc) { try { serverProc.kill(); } catch (e) { } }
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { }
  process.exit(fail ? 1 : 0);
}
main().catch(e => {
  if (serverProc) { try { serverProc.kill(); } catch (e2) { } }
  console.error(e); process.exit(3);
});
