/* 临时探针：验收线上站点（公网 URL） */
'use strict';
const https = require('https');
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');

const BASE = 'https://qggpmfqcjeedw.space.mcode.cn';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PAGE = '原理讲解_4.0_信道的定义与分类_可视化.html';

function get(p) {
  return new Promise(res => {
    https.get(BASE + p, r => {
      let b = '';
      r.on('data', d => b += d);
      r.on('end', () => res({ code: r.statusCode, type: r.headers['content-type'] || '', body: b }));
    }).on('error', e => res({ code: 0, type: '', body: 'ERR ' + e.message }));
  });
}

(async function () {
  console.log('=== 线上 HTTP 自检 ===');
  for (const p of ['/', '/index.html', '/00_学习入口.html', '/manifest.webmanifest', '/sw.js', '/icon-192.png', '/' + encodeURIComponent(PAGE)]) {
    const r = await get(p);
    console.log('  ' + p.padEnd(52) + ' HTTP ' + r.code + '  ' + String(r.type).padEnd(32) + ' ' + r.body.length + ' B');
  }

  console.log('\n=== 线上浏览器实跑 ===');
  const profile = path.join(os.tmpdir(), 'mavis-live-' + process.pid);
  for (const p of ['/index.html', '/' + encodeURIComponent(PAGE)]) {
    const pr = spawn(CHROME, [
      '--headless=new', '--disable-gpu', '--no-sandbox',
      '--user-data-dir=' + profile, '--virtual-time-budget=12000',
      '--enable-logging=stderr', '--v=0', '--dump-dom', BASE + p
    ]);
    let out = '';
    pr.stdout.on('data', d => out += d);
    pr.stderr.on('data', d => out += d);
    await new Promise(r => pr.on('close', r));
    const title = (out.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || '';
    const errs = out.split(/\r?\n/).filter(l => /^\[ERROR:/i.test(l) || /Uncaught/i.test(l));
    const self = out.split(/\r?\n/).map(l => l.trim()).filter(l => /^(PASS|FAIL)\s{1,}\S/.test(l));
    const svgs = (out.match(/<svg[\s>]/gi) || []).length;
    console.log('  ' + p);
    console.log('     title = ' + JSON.stringify(title.trim()) + '   svg=' + svgs);
    console.log('     控制台错误 = ' + (errs.length ? errs.slice(0, 3).join(' | ').slice(0, 200) : '无'));
    if (self.length) console.log('     自检 ' + self.length + ' 条，FAIL ' + self.filter(x => /^FAIL/.test(x)).length + ' 条');
  }
  console.log('\n完成');
})();
