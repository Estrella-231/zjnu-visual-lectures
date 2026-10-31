/* 普查站点内所有本地引用（不限扩展名），按「解析状态」归类 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', 'site');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}
const rel = f => path.relative(ROOT, f).replace(/\\/g, '/');
const htmls = walk(ROOT).filter(f => /\.html$/i.test(f));

const bad = [], ok = [];
for (const f of htmls) {
  const t = fs.readFileSync(f, 'utf8');
  const refs = new Set();
  let m;
  const re = /(?:src|href)\s*=\s*["']([^"']+)["']/gi;
  while ((m = re.exec(t))) refs.add(m[1]);
  const re2 = /url\(\s*["']?([^"')]+)["']?\s*\)/gi;
  while ((m = re2.exec(t))) refs.add(m[1]);
  for (const r of refs) {
    if (/^(?:https?:|data:|mailto:|javascript:|#|\/\/)/i.test(r)) continue;
    const clean = r.split('#')[0].split('?')[0];
    if (!clean) continue;
    const target = path.resolve(path.dirname(f), clean);
    const e = fs.existsSync(target) ? ok : bad;
    e.push(rel(f) + ' → ' + r);
  }
}
console.log('=== 解析不到 (' + bad.length + ') ===');
bad.forEach(x => console.log('  ' + x));
console.log('=== 能解析 (' + ok.length + ') ===');
const kinds = {};
ok.forEach(x => { const ext = path.extname(x.split('→ ')[1]).toLowerCase() || '(无扩展名)'; kinds[ext] = (kinds[ext] || 0) + 1; });
console.log('  ' + JSON.stringify(kinds));
