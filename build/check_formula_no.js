/* =======================================================================
 * check_formula_no.js —— 教材公式号守卫
 *
 * 只判「**有就一定错**」的规则，避免误报：
 *   ① 页面正文里出现的教材公式号 (N-M)，其章号 N **不得大于本页章号**
 *      —— 教材不会引用「后面章节」的公式号；引用前面章节的是允许的。
 *
 * 为什么必须先剥掉 <script> / <style>：
 *   JS 代码里的算术表达式会被误当成公式号。
 *   实测：第 2.8 页的自检脚本里有 `term2=(6-1)/0.8`、`term3=(4-1)/(0.8*0.3)`
 *   （教材例 2-2 的级联噪声系数），不剥 script 就会被判成「引用了第 6 章公式」。
 *
 * **不判**「公式号重复出现」—— 教材公式号在正文里被反复引用是正常的；
 * **不判**「公式块缺公式号」—— `.no` 是通用的右对齐注解槽位
 *   （可以是「近似式」「该式未编号」「图 3-26」），推导中间式本来就没有编号。
 *
 * 纯静态检查，不跑页面脚本。
 * 用法：node check_formula_no.js
 * ======================================================================= */
'use strict';
const fs = require('fs');
const path = require('path');

const VIZ = path.join(__dirname, '..', 'viz');

/* 页面文件名 → 章号：原理讲解_6.2_xxx.html → 6 */
function chapterOf(name) {
  const m = /^原理讲解_(\d+)\./.exec(name);
  return m ? +m[1] : null;
}

const files = fs.readdirSync(VIZ).filter(function (f) {
  return /^原理讲解_\d+\./.test(f) && f.endsWith('.html');
}).sort();

let fail = 0, pass = 0;

for (const f of files) {
  const raw = fs.readFileSync(path.join(VIZ, f), 'utf8');
  const ch = chapterOf(f);

  /* 剥掉 <script> / <style>，避免把 JS 算术与 CSS 里的数字当成公式号 */
  const html = raw.replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
                  .replace(/<style\b[\s\S]*?<\/style>/gi, ' ');

  const all = html.match(/\((\d{1,2})\.(\d{1,2})-(\d{1,3})\)/g) || [];
  const bad = Array.from(new Set(all.filter(function (s) {
    return ch !== null && +/\((\d{1,2})\./.exec(s)[1] > ch;
  })));

  if (bad.length) {
    fail++;
    console.log('  [FAIL] ' + f + '  引用了后续章节的公式号：' + bad.join('、'));
  } else {
    pass++;
    const nos = (html.match(/<span class="no"[^>]*>[\s\S]*?<\/span>/g) || []).length;
    console.log('  [PASS] ' + f + '  公式号 ' + all.length + ' 处（其中 .no 注解 ' + nos + ' 个），无跨章引用 ✓');
  }
}

console.log('\n--------------------------------------------');
console.log('检查页面数：' + files.length + '，PASS ' + pass + '，FAIL ' + fail);
process.exit(fail ? 1 : 0);
