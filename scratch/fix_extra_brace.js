/* fix_extra_brace.js —— 回修源文件里「宏后面多写了一个右花括号」的笔误
 *
 * 背景：\frac{X}{Y}} 这种多写的一个 }，原本会被原样输出到页面上（肉眼可见的乱字符）。
 *      math.js 渲染时已自动消费掉它（页面不会再显示），但源文件必须修掉。
 *
 * 用法：node scratch/fix_extra_brace.js            干跑，只报告
 *       node scratch/fix_extra_brace.js --apply    回写源文件
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { renderMath } = require('D:/课程文档/通信电路/build/math.js');

const PARTS = 'D:/课程文档/通信电路/build/parts';
const APPLY = process.argv.indexOf('--apply') >= 0;

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.html')) out.push(p);
  }
  return out;
}

const files = walk(PARTS, []);
let totalExtra = 0, totalUnknown = 0, touched = 0;

for (const f of files) {
  const raw = fs.readFileSync(f, 'utf8');
  const warnings = [];
  renderMath(raw, warnings);          /* 只为拿 warnings，渲染结果丢弃 */

  const extras = warnings.filter(w => w.type === 'extra-brace').map(w => w.index).sort((a, b) => b - a);
  const unknown = warnings.filter(w => w.type === 'unknown-command');

  if (!extras.length && !unknown.length) continue;

  const lines = raw.split(/\r?\n/);
  const rel = f.replace(/^.*?parts[\\/]/, 'parts/');

  extras.forEach(idx => {
    const line = raw.slice(0, idx).split(/\r?\n/).length;
    const src = (lines[line - 1] || '').trim();
    console.log('[多余}] ' + rel + '  第 ' + line + ' 行');
    console.log('        ' + src.slice(0, 150));
  });

  unknown.forEach(w => {
    const line = raw.slice(0, w.index).split(/\r?\n/).length;
    console.log('[未知宏] ' + rel + '  第 ' + line + ' 行  \\' + w.cmd);
    console.log('        ' + (lines[line - 1] || '').trim().slice(0, 150));
  });

  totalExtra += extras.length;
  totalUnknown += unknown.length;

  if (extras.length && APPLY) {
    let s = raw;
    for (const idx of extras) {
      if (s[idx] !== '}') {
        console.log('  !! 位置不符，跳过（源文件可能已被改动）：' + rel + ' @' + idx);
        continue;
      }
      s = s.slice(0, idx) + s.slice(idx + 1);
    }
    fs.writeFileSync(f, s, 'utf8');
    touched++;
  }
}

console.log('\n--------------------------------------------');
console.log('扫描片段 ' + files.length + ' 个；多余右花括号 ' + totalExtra + ' 处，未知反斜杠命令 ' + totalUnknown + ' 处');
if (APPLY) console.log('已回写 ' + touched + ' 个文件');
else console.log('（干跑，未写文件；加 --apply 回写）');
