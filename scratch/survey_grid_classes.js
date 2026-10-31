/* survey_grid_classes.js —— 统计发布目录里所有声明 display:grid / display:flex 的选择器
 * 用途：为「grid/flex 子项 min-width:auto 撑破窄屏」问题生成精确的 min-width:0 规则。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const SITE = path.join(__dirname, '..', 'site');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}
const files = walk(SITE).filter(f => /\.html$/i.test(f));

const sels = new Map();     /* selector -> 出现次数 */
for (const f of files) {
  const t = fs.readFileSync(f, 'utf8');
  /* 抓 CSS 规则块：选择器 { ... } */
  const re = /([^{}<>]{1,160}?)\{([^{}]{0,4000})\}/g;
  let m;
  while ((m = re.exec(t)) !== null) {
    const sel = m[1].trim();
    const body = m[2];
    if (!/display\s*:\s*(grid|flex|inline-flex|inline-grid)/.test(body)) continue;
    if (sel.startsWith('@') || sel.includes('<')) continue;
    sel.split(',').forEach(s => {
      const k = s.trim();
      if (!k || k.startsWith('@') || k.includes(':')) return;   /* 跳过伪类/媒体查询残留 */
      sels.set(k, (sels.get(k) || 0) + 1);
    });
  }
}
const arr = [...sels.entries()].sort((a, b) => b[1] - a[1]);
console.log('用 display:grid/flex 的选择器共 ' + arr.length + ' 个（按出现次数）：');
arr.forEach(([k, n]) => console.log('  ' + String(n).padStart(4) + '  ' + k));
