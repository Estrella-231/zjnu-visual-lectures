/* audit_product.js —— 对**构建产物**（viz/*.html）做两类排版残留检查
 *
 *  ① 非宏反斜杠命令：\omega \theta \int \left … 渲染后仍以字面形式出现
 *     （math.js 已覆盖希腊字母/大算符/运算符，产物里不该再有反斜杠命令）
 *  ② 多余右花括号：紧跟在 </span> / </sup> / </sub> 之后的孤立 '}'
 *     （宏渲染后紧跟的 '}' 一定是源文件多写的笔误；
 *       而 {…} 分组括号、{·} 省略记号、JSON 属性都不紧跟 </span>，不会误报）
 *  ③ U+FFFD 替换字符：写文件时字符被截断/编码坏掉留下的「�」
 *     （肉眼扫正文很难发现，页面上就是一个黑方块；本轮第 1 章曾漏进一处）
 *  ④ **未替换的模板占位符** `{{XXX}}` —— 第四轮做例题/习题页时，
 *     若直接复制 TEMPLATE_example.html 而没过 fill_template.js，
 *     `{{H1}}` / `{{SOLUTION_H3}}` 这类占位符会**原样显示在页面上**
 *     （2026-10-28 实测：例 3-2 / 3-3 / 4-1 三页的主标题就是 "{{H1}}"）。
 *
 * 用法：node scratch/audit_product.js [前缀过滤]
 */
'use strict';
const fs = require('fs');
const path = require('path');

const VIZ = 'D:/课程文档/通信原理/viz';
const filter = process.argv[2] || '';

const files = fs.readdirSync(VIZ)
  .filter(f => f.endsWith('.html'))
  .filter(f => !f.startsWith('00_') && f !== 'index.html')
  .filter(f => f.indexOf(filter) >= 0)
  .sort();

const CMD = /\\([a-zA-Z]+)/g;
/* 紧跟闭合标签的孤立右花括号 */
const ORPHAN = /<\/(?:span|sup|sub|b|i)>\}/g;
/* U+FFFD 替换字符（乱码） */
const FFFD = /\uFFFD/g;
/* 未替换的模板占位符 */
const PH = /\{\{[A-Z_][A-Z0-9_]*\}\}/g;

let nCmd = 0, nOrphan = 0, nFffd = 0, nPh = 0, badFiles = 0;

for (const f of files) {
  const raw = fs.readFileSync(path.join(VIZ, f), 'utf8');
  const body = raw.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');

  const cmds = [];
  let m;
  CMD.lastIndex = 0;
  while ((m = CMD.exec(body))) cmds.push({ cmd: m[1], line: body.slice(0, m.index).split('\n').length });

  const orphans = [];
  ORPHAN.lastIndex = 0;
  while ((m = ORPHAN.exec(body))) {
    orphans.push({ line: body.slice(0, m.index).split('\n').length,
      ctx: body.slice(Math.max(0, m.index - 46), m.index + 12).replace(/\s+/g, ' ') });
  }

  const fffds = [];
  FFFD.lastIndex = 0;
  while ((m = FFFD.exec(body))) {
    fffds.push({ line: body.slice(0, m.index).split('\n').length,
      ctx: body.slice(Math.max(0, m.index - 46), m.index + 12).replace(/\s+/g, ' ') });
  }

  const phs = [];
  PH.lastIndex = 0;
  while ((m = PH.exec(raw))) {
    phs.push({ line: raw.slice(0, m.index).split('\n').length,
      ctx: raw.slice(Math.max(0, m.index - 40), m.index + 22).replace(/\s+/g, ' ') });
  }

  if (cmds.length || orphans.length || fffds.length || phs.length) {
    badFiles++;
    if (cmds.length) {
      const uniq = {};
      cmds.forEach(c => uniq[c.cmd] = (uniq[c.cmd] || 0) + 1);
      console.log('FAIL  ' + f + '  残留反斜杠命令 ' + cmds.length + ' 处  ' + JSON.stringify(uniq));
      console.log('      首处 第' + cmds[0].line + ' 行: \\' + cmds[0].cmd);
      nCmd += cmds.length;
    }
    if (orphans.length) {
      console.log('FAIL  ' + f + '  多余右花括号 ' + orphans.length + ' 处');
      orphans.slice(0, 4).forEach(o => console.log('      第' + o.line + ' 行: …' + o.ctx + '…'));
      nOrphan += orphans.length;
    }
    if (fffds.length) {
      console.log('FAIL  ' + f + '  乱码字符 U+FFFD ' + fffds.length + ' 处');
      fffds.slice(0, 4).forEach(o => console.log('      第' + o.line + ' 行: …' + o.ctx + '…'));
      nFffd += fffds.length;
    }
    if (phs.length) {
      const uniq = {};
      phs.forEach(p => uniq[p.ctx] = (uniq[p.ctx] || 0) + 1);
      console.log('FAIL  ' + f + '  未替换的模板占位符 ' + phs.length + ' 处  ' + JSON.stringify(Object.keys(uniq)));
      phs.slice(0, 4).forEach(p => console.log('      第' + p.line + ' 行: …' + p.ctx + '…'));
      nPh += phs.length;
    }
  }
}

console.log('\n--------------------------------------------');
console.log('扫描产物 ' + files.length + ' 个；残留反斜杠命令 ' + nCmd + ' 处，多余右花括号 ' + nOrphan
  + ' 处，乱码 U+FFFD ' + nFffd + ' 处，未替换占位符 ' + nPh + ' 处，涉及 ' + badFiles + ' 个文件');
if (!nCmd && !nOrphan && !nFffd && !nPh) console.log('（空跑自证：已实际扫描 ' + files.length + ' 个产物文件）');
process.exit(nCmd || nOrphan || nFffd || nPh ? 1 : 0);
