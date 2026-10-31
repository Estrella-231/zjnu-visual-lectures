/* 体检：① 4 个旧章 <style> 是否一致 ② section/script 边界 ③ 外链清单 ④ class 词汇表 */
'use strict';
const fs = require('fs');
const dir = 'D:/课程文档/通信原理/';
const files = ['第4章-信道-可视化讲解.html', '第5章-模拟调制系统-可视化讲解.html',
  '第6章-数字基带传输系统-可视化讲解.html', '第7章-数字带通传输系统-可视化讲解.html'];
const styles = [];
for (const f of files) {
  const s = fs.readFileSync(dir + f, 'utf8');
  const a = s.indexOf('<style>'), b = s.indexOf('</style>');
  const css = s.slice(a + 7, b);
  styles.push(css);
  const secs = [...s.matchAll(/<section[^>]*>/g)].map(m => {
    const line = s.slice(0, m.index).split(/\r?\n/).length;
    return 'L' + line + ' ' + m[0].slice(0, 70);
  });
  const scripts = (s.match(/<script>/g) || []).length;
  const ext = [...new Set(s.match(/https?:\/\/[^"' >]+/g) || [])];
  console.log('==== ' + f + '  css=' + css.length + 'B  section=' + secs.length + '  script=' + scripts);
  console.log(secs.join('\n'));
  console.log('外链: ' + (ext.length ? ext.join(' | ') : '无'));
}
const crypto = require('crypto');
const hashes = styles.map(c => crypto.createHash('md5').update(c).digest('hex').slice(0, 8));
console.log('\nstyle 哈希: ' + hashes.join(' , '));
console.log('ch4==ch5: ' + (styles[0] === styles[1]) + '  ch4==ch6: ' + (styles[0] === styles[2]) + '  ch4==ch7: ' + (styles[0] === styles[3]));
/* class 词汇 */
const cls = new Set();
for (const m of styles[0].matchAll(/\.([a-zA-Z][\w-]*)/g)) cls.add(m[1]);
console.log('\nclass 数: ' + cls.size);
console.log([...cls].sort().join(' '));
