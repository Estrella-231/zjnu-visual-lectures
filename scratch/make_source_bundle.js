'use strict';
/* 造部署用的源码包目录：只放 git 跟踪 + 未忽略的新文件，排除
   docs/(教材PDF) build/pages/(扫描页图) site/(产物) viz/ 等大件。
   依据：git ls-files -co --exclude-standard */
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, '.deploy-src');

const list = execFileSync('git', ['ls-files', '-co', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8' })
  .split(/\r?\n/).map(s => s.trim()).filter(Boolean);

/* 体积最大的那些不进源码包 */
const EXCLUDE_DIRS = ['docs/', 'build/pages/', 'build/examples/', 'site/', 'viz/'];
const EXCLUDE_FILES = ['index.html'];

let n = 0, skip = 0, bytes = 0;
const skipped = [];
for (const rel of list) {
  const norm = rel.split(path.sep).join('/');
  if (EXCLUDE_DIRS.some(d => norm.startsWith(d))) { skip++; skipped.push(norm); continue; }
  if (EXCLUDE_FILES.includes(norm)) { skip++; skipped.push(norm); continue; }
  const src = path.join(ROOT, rel);
  if (!fs.existsSync(src) || !fs.statSync(src).isFile()) { skip++; continue; }
  const dst = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  bytes += fs.statSync(src).size;
  n++;
}
console.log('源码包目录: ' + OUT);
console.log('复制 ' + n + ' 个文件 / ' + (bytes / 1024 / 1024).toFixed(2) + ' MB');
console.log('排除 ' + skip + ' 个（docs/ build/pages/ site/ viz/ 等）');
if (skipped.length) console.log('  排除清单前 20: ' + skipped.slice(0, 20).join(', '));
