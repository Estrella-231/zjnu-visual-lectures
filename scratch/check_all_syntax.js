'use strict';
// 全量片段脚本语法体检
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const dirs = [];
for (const d of fs.readdirSync(path.join(ROOT, 'build', 'parts'))) {
  const p = path.join(ROOT, 'build', 'parts', d);
  if (fs.statSync(p).isDirectory()) dirs.push(p);
}
const exDir = path.join(ROOT, 'build', 'examples', 'pages');
if (fs.existsSync(exDir)) dirs.push(exDir);
// 习题解法专题页（build/answer_guide/q25.html 等）也是独立整页，同样要体检
const agDir = path.join(ROOT, 'build', 'answer_guide');
if (fs.existsSync(agDir)) dirs.push(agDir);
/* ④ 第四轮新增的例题/习题页：worker 可能直接写在 viz/ 下（未同步到 build/examples/pages/），
   这里显式把 viz/ 里的「例题解法_*」「习题解法_*」也纳入体检，避免新页漏检。
   注意只收这两类前缀 —— viz/ 里还有 52 页原理讲解页与跳转桩，不重复扫。 */
const files = [];
const vizDir = path.join(ROOT, 'viz');
if (fs.existsSync(vizDir)) {
  for (const f of fs.readdirSync(vizDir).sort()) {
    if (!/^(例题解法_|习题解法_)/.test(f)) continue;
    if (!f.endsWith('.html')) continue;
    files.push(path.join(vizDir, f));
  }
}
/* 工程根目录的旧章节整页（第N章-*.html）：publish.js **直接**把它们发布到站点，
   不经过 build/parts/ 构建 —— 语法闸门若不扫它们，整页脚本报错要到线上才发现。 */
for (const f of fs.readdirSync(ROOT).sort()) {
  if (!/^第\d+章-.*\.html$/.test(f)) continue;
  files.push(path.join(ROOT, f));
}
/* 临时文件必须**按进程隔离**：本轮有多个 worker 并行跑这个体检，
   共用固定文件名会出现「A 进程刚写好、B 进程覆盖掉」的竞态 → 假 FAIL。
   （2026-10-28 实测：4 worker 并行时误报 7 段失败，单跑则全过。） */
const tmp = path.join(ROOT, 'scratch', '_syntax_all_tmp_' + process.pid + '.js');
let bad = 0, total = 0;
for (const d of dirs) {
  for (const f of fs.readdirSync(d).filter(x => x.endsWith('.html') || x === '_script.js').sort()) {
    files.push(path.join(d, f));
  }
}
for (const fp of files) {
  const s = fs.readFileSync(fp, 'utf8');
  /* 章级共享脚本 _script.js 不是 <script> 包裹的 HTML：整文件就是一段 JS */
  if (fp.endsWith('_script.js')) {
    total++;
    fs.writeFileSync(tmp, s, 'utf8');
    try { execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' }); }
    catch (e) {
      bad++;
      const out = (e.stderr || '').toString();
      const mm = /_syntax_all_tmp[^:]*\.js:(\d+)/.exec(out);
      console.log('  [FAIL] ' + path.relative(ROOT, fp) + '  行 ' + (mm ? mm[1] : '?'));
      const msg = out.split('\n').filter(l => l.trim() && !/_syntax_all_tmp/.test(l))[0];
      console.log('         ' + (msg || '').trim());
    }
    continue;
  }
  const scripts = [];
  const re = /<script\b[^>]*>([\s\S]*?)<\/script>/g; let m;
  while ((m = re.exec(s)) !== null) scripts.push({ code: m[1], at: s.slice(0, m.index).split('\n').length });
  scripts.forEach((sc, i) => {
    total++;
    fs.writeFileSync(tmp, sc.code, 'utf8');
    try { execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' }); }
    catch (e) {
      bad++;
      const out = (e.stderr || '').toString();
      const mm = /_syntax_all_tmp[^:]*\.js:(\d+)/.exec(out);
      const line = mm ? (sc.at + parseInt(mm[1], 10)) : '?';
      console.log('  [FAIL] ' + path.relative(ROOT, fp) + ' script#' + (i + 1) + '  源文件行 ' + line);
      const msg = out.split('\n').filter(l => l.trim() && !/_syntax_all_tmp/.test(l))[0];
      console.log('         ' + (msg || '').trim());
    }
  });
}
try { fs.unlinkSync(tmp); } catch (e) { }
console.log('\n共检查 ' + total + ' 段脚本，失败 ' + bad + ' 段');
process.exit(bad ? 1 : 0);
