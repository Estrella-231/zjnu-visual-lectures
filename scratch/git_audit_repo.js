/* scratch/git_audit_repo.js —— 对**已提交**的内容做版权红线审计
 * 用法：node scratch/git_audit_repo.js
 * 查的是 git 对象里的真实内容（不是工作区），确保推到 GitHub 的东西干净。
 */
'use strict';
const { execFileSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const git = args => execFileSync('git', args, {
  cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 128 * 1024 * 1024
});

const files = git(['ls-tree', '-r', '--name-only', 'HEAD']).split(/\r?\n/).filter(Boolean);

console.log('HEAD 中的文件数：' + files.length);

/* ① 路径红线 */
const pathRules = [
  { re: /\.pdf$/i, why: 'PDF' },
  { re: /^docs\//, why: '教材/课件目录' },
  { re: /^build\/pages\//, why: '教材页图' },
  { re: /^build\/examples\//, why: '答案册页图' },
  { re: /^site\//, why: '发布目录（产物）' },
  { re: /^viz\//, why: '构建输出（产物）' },
  { re: /^第\d+章-/, why: '旧章节整页（上游成品）' },
];
const badPaths = files.filter(f => pathRules.some(r => r.re.test(f)));
if (badPaths.length) {
  console.error('❌ 路径红线命中：');
  badPaths.forEach(f => console.error('   ' + f));
} else {
  console.log('✓ 路径红线：无 PDF / 教材页图 / 答案册 / 发布目录 / 构建产物');
}

/* ② 内容红线：文件里有没有引用教材 PDF 的**链接**（不是文件本身） */
const suspectLink = [];
for (const f of files) {
  if (!/\.(md|html|js|json)$/i.test(f)) continue;
  let buf;
  try { buf = git(['show', 'HEAD:' + f]); } catch (e) { continue; }
  const m = buf.match(/(?:href|src)\s*=\s*["'][^"']*\.pdf["']/gi);
  if (m) suspectLink.push(f + '  ×' + m.length);
}
if (suspectLink.length) {
  console.warn('\n⚠ 这些文件里有指向 .pdf 的链接（本地版正常，GitHub 上会是死链）：');
  suspectLink.forEach(s => console.warn('   ' + s));
} else {
  console.log('✓ 内容红线：无指向 .pdf 的死链');
}

/* ③ 体积 */
let bytes = 0;
files.forEach(f => {
  try { bytes += require('fs').statSync(path.join(ROOT, f)).size; } catch (e) { }
});
console.log('\n工作区对应体积：' + (bytes / 1024 / 1024).toFixed(2) + ' MB');

console.log('\n顶层构成：');
const byTop = {};
files.forEach(f => { const t = f.split('/')[0]; byTop[t] = (byTop[t] || 0) + 1; });
Object.entries(byTop).sort((a, b) => b[1] - a[1])
  .forEach(([t, n]) => console.log('   ' + t.padEnd(20) + n));

process.exit(badPaths.length ? 1 : 0);
