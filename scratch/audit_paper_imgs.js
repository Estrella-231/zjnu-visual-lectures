'use strict';
const fs = require('fs'), path = require('path');
const ROOT = 'E:/Fuzhaodu/论文讲解/papers';
const dirs = fs.readdirSync(ROOT, { withFileTypes: true }).filter(d => d.isDirectory());
let tot = 0; const missingAll = [];
for (const d of dirs) {
  const h = path.join(ROOT, d.name, '讲解.html');
  if (!fs.existsSync(h)) { console.log('NO HTML', d.name); continue; }
  const t = fs.readFileSync(h, 'utf8');
  const refs = new Set();
  const re = /<img\b[^>]*src\s*=\s*["']pages\/([^"']+)["']/gi;
  let m;
  while ((m = re.exec(t)) !== null) refs.add(m[1]);
  const exist = [...refs].filter(f => fs.existsSync(path.join(ROOT, d.name, 'pages', f)));
  const miss = [...refs].filter(f => !fs.existsSync(path.join(ROOT, d.name, 'pages', f)));
  console.log(d.name, 'refs=' + refs.size, 'exist=' + exist.length, 'missing=' + miss.length,
    miss.length ? JSON.stringify(miss) : '');
  tot += exist.length;
  missingAll.push(...miss.map(f => d.name + '/' + f));
}
console.log('TOTAL existing referenced images:', tot);
console.log('MISSING:', missingAll.length);
