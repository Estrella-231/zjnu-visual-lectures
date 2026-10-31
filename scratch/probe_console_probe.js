/* 临时探针：看 Chrome --dump-dom 模式下 console 输出长什么样（[INFO:CONSOLE(...)]） */
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const http = require('http');

const ROOT = path.resolve(__dirname, '..');
const PORT = 18075;
const name = '原理讲解_4.0_信道的定义与分类_可视化.html';

const srv = spawn(process.execPath, [path.join(__dirname, 'serve.js'), String(PORT)], { cwd: ROOT });
srv.stdout.on('data', () => { });

function waitReady(cb, n) {
  if (n > 60) return cb();
  http.get('http://127.0.0.1:' + PORT + '/', r => { r.resume(); cb(); })
    .on('error', () => setTimeout(() => waitReady(cb, n + 1), 150));
}

waitReady(() => {
  const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const url = 'http://127.0.0.1:' + PORT + '/viz/' + encodeURIComponent(name);
  const profile = path.join(os.tmpdir(), 'mavis-probe2-' + process.pid);
  const p = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-extensions',
    '--user-data-dir=' + profile, '--virtual-time-budget=6000',
    '--enable-logging=stderr', '--v=0', '--dump-dom', url
  ]);
  let out = '';
  p.stdout.on('data', d => out += d);
  p.stderr.on('data', d => out += d);
  p.on('close', () => {
    const lines = out.split(/\r?\n/);
    console.log('=== 含 CONSOLE 的行 ===');
    lines.filter(l => /CONSOLE/i.test(l)).forEach(l => console.log(l));
    console.log('=== title ===');
    console.log((out.match(/<title>([\s\S]*?)<\/title>/i) || [])[1]);
    console.log('=== 含 PASS/FAIL 的行 ===');
    lines.filter(l => /^\s*(PASS|FAIL)\s/.test(l)).forEach(l => console.log(l));
    try { srv.kill(); } catch (e) { }
    process.exit(0);
  });
}, 0);
