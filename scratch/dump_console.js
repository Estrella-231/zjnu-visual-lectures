/* dump_console.js —— 用无头 Chrome 跑一个页面并把控制台输出 / 报错打出来。
 *
 * 用法（两种）：
 *   node scratch/dump_console.js <页面文件名（在 viz 下）>
 *   $env:DUMP_PAGE='习题解法_5_振幅调制电路章末习题.html'; node scratch/dump_console.js
 *
 * ⚠️ **中文文件名不要走命令行 argv**：PowerShell 按系统 ANSI 码页（GBK）编码命令行，
 *    Node 按 UTF-8 解码 argv → 乱码 → 找不到页面。
 *    走 **环境变量 DUMP_PAGE**（Windows 环境块是 UTF-16，Node 正确解码）或写进脚本里。
 *
 * 本模块同时导出 dumpConsole()，供其它 scratch 脚本复用 —— **不要复制这份实现**。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const VIZ = path.resolve(__dirname, '..', 'viz');
const PORT = 18077;

/* 需要看控制台哪几类行 */
const KEEP = /CONSOLE|ERROR|Uncaught|SyntaxError|ReferenceError|TypeError|=====|PASS|FAIL|自检/;

function dumpConsole(file, opts) {
  opts = opts || {};
  const budget = opts.budget || 6000;
  const url = 'http://127.0.0.1:' + PORT + '/viz/' + encodeURIComponent(file);
  const profile = path.join(os.tmpdir(), 'mavis-console-' + process.pid + '-' + Date.now());
  const args = ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-extensions',
    '--user-data-dir=' + profile, '--virtual-time-budget=' + budget,
    '--enable-logging=stderr', '--v=0', '--dump-dom', url];
  return new Promise(resolve => {
    const p = spawn(CHROME, args, { cwd: VIZ });
    let out = '';
    p.stdout.on('data', d => out += d);
    p.stderr.on('data', d => out += d);
    p.on('close', () => {
      const lines = out.split(/\r?\n/);
      console.log('--- 控制台 / stderr：' + file + ' ---');
      let hits = 0;
      lines.forEach(l => {
        const s = l.trim();
        if (!s) return;
        if (KEEP.test(s)) { console.log(s); hits++; }
      });
      const m = out.match(/<title>([\s\S]*?)<\/title>/i);
      console.log('--- 命中行数：' + hits + ' ---');
      console.log('--- title: ' + (m ? m[1].trim() : '(无)') + ' ---');
      try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* 忽略 */ }
      resolve({ out, hits, title: m ? m[1].trim() : '' });
    });
  });
}

module.exports = { dumpConsole, VIZ, PORT, CHROME };

if (require.main === module) {
  const file = process.argv[2] || process.env.DUMP_PAGE || '';
  if (!file) {
    console.error('用法: node scratch/dump_console.js <页面名>   或   $env:DUMP_PAGE=...; node scratch/dump_console.js');
    process.exit(2);
  }
  dumpConsole(file, { budget: Number(process.env.DUMP_BUDGET) || 6000 });
}
