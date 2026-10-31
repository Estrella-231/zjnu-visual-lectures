/* 阶段 1 补丁：把复制过来的工具链改成通信原理的路径/规则。
 * 每处替换都断言命中次数，替换后跑 node --check。用法：node patch_toolchain_paths.js */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = 'D:/课程文档/通信原理';

function patch(rel, pairs) {
  const p = path.join(ROOT, rel);
  let s = fs.readFileSync(p, 'utf8');
  const before = s.length;
  for (const [re, to, why] of pairs) {
    /* 字符串模式按字面计数（match 会把字符串转成正则，引入转义歧义） */
    const hits = s.split(re).length - 1;
    if (hits === 0) { console.error('  !! ' + rel + ' 未命中: ' + why); process.exit(1); }
    s = s.split(re).join(typeof re === 'string' ? to : String(to).replace(/\$/g, '$$$$'));
    console.log('  ' + rel + '  ' + why + '  (命中 ' + hits + ')');
  }
  fs.writeFileSync(p, s, 'utf8');
  console.log('  ' + rel + '  字节 ' + before + ' -> ' + s.length);
}

/* 1) 三个脚本里的绝对路径 → 通信原理 */
patch('scratch/verify_runtime.js', [
  [/D:\/课程文档\/通信电路\/viz/g, 'D:/课程文档/通信原理/viz', 'VIZ 路径']
]);
patch('scratch/audit_product.js', [
  [/D:\/课程文档\/通信电路\/viz/g, 'D:/课程文档/通信原理/viz', 'VIZ 路径']
]);
patch('build/scan_svg.js', [
  [/D:\/课程文档\/通信电路\/build\/parts/g, 'D:/课程文档/通信原理/build/parts', 'parts 路径']
]);

/* 2) check_formula_no：路径改相对；公式号模式改教材的 (N.M-K) 形式（纯字符串替换，避免转义坑） */
patch('build/check_formula_no.js', [
  ["path.join('D:/课程文档/通信电路', 'viz')", "path.join(__dirname, '..', 'viz')", 'VIZ 相对化'],
  ['html.match(/\\((\\d{1,2})-(\\d{1,3})\\)/g)', 'html.match(/\\((\\d{1,2})\\.(\\d{1,2})-(\\d{1,3})\\)/g)', '公式号模式 (N.M-K)'],
  ['+/\\((\\d{1,2})-/.exec(s)[1] > ch;', '+/\\((\\d{1,2})\\./.exec(s)[1] > ch;', '章号提取改 (N.']
]);

/* 3) check_text：清空课程抄写规则（通用全站禁项保留，逐章回填） */
{
  const p = path.join(ROOT, 'build/check_text.js');
  let s = fs.readFileSync(p, 'utf8');
  const m = /const RULES = \[[\s\S]*?\n\];/.exec(s);
  if (!m) { console.error('  !! check_text.js 未找到 RULES 定义'); process.exit(1); }
  const note = [
    'const RULES = [',
    '  /* 通信原理：逐章回填「必须出现/不得出现」抄写规则（照通信电路的写法，',
    '     page 用 原理讲解_N.M_ 前缀定位构建页，id 用公式块 id，need/forbid 去空白比对）。',
    '     全站禁项扫描（文件下方）与 RULES 无关，始终生效。 */',
    '];'
  ].join('\n');
  s = s.slice(0, m.index) + note + s.slice(m.index + m[0].length);
  if (!/全站禁项扫描/.test(s)) { console.error('  !! check_text 全站禁项段丢失'); process.exit(1); }
  fs.writeFileSync(p, s, 'utf8');
  console.log('  build/check_text.js  RULES 清空（原规则 ' + m[0].length + ' 字节），全站禁项保留');
}

/* 4) 语法自检 */
const files = ['scratch/verify_runtime.js', 'scratch/audit_product.js', 'build/scan_svg.js',
  'build/check_formula_no.js', 'build/check_text.js'];
for (const f of files) {
  execFileSync(process.execPath, ['--check', path.join(ROOT, f)], { stdio: 'pipe' });
  console.log('  node --check  ' + f + '  OK');
}
console.log('全部补丁完成');
