/* 临时探针：按「部署后的形态」检查 site/ 目录（首页、manifest、sw、页面自检、SW 注册） */
'use strict';
const http = require('http');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const fs = require('fs');

const PORT = 18076;
const BASE = 'http://127.0.0.1:' + PORT + '/site/';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

function get(p) {
  return new Promise(res => {
    http.get(BASE + p, r => {
      let b = '';
      r.on('data', d => b += d);
      r.on('end', () => res({ code: r.statusCode, type: r.headers['content-type'] || '', body: b }));
    }).on('error', e => res({ code: 0, type: '', body: 'ERR ' + e.message }));
  });
}

(async function () {
  console.log('=== HTTP 自检（站点根 = site/）===');
  for (const p of ['index.html', '00_学习入口.html', 'manifest.webmanifest', 'sw.js', 'icon-192.png']) {
    const r = await get(p);
    console.log('  ' + p.padEnd(26) + ' HTTP ' + r.code + '  ' + r.type.padEnd(34) + ' ' + r.body.length + ' B');
  }

  console.log('\n=== 浏览器实跑（首页 + 一节讲义）===');
  const profile = path.join(os.tmpdir(), 'mavis-site-' + process.pid);
  for (const page of ['index.html', '原理讲解_4.0_信道的定义与分类_可视化.html']) {
    const p = spawn(CHROME, [
      '--headless=new', '--disable-gpu', '--no-sandbox',
      '--user-data-dir=' + profile, '--virtual-time-budget=9000',
      '--enable-logging=stderr', '--v=0', '--dump-dom', BASE + encodeURIComponent(page)
    ]);
    let out = '';
    p.stdout.on('data', d => out += d);
    p.stderr.on('data', d => out += d);
    await new Promise(r => p.on('close', r));
    const title = (out.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || '';
    const errs = out.split(/\r?\n/).filter(l => /^\[ERROR:/i.test(l) || /Uncaught/i.test(l));
    const self = out.split(/\r?\n/).map(l => l.trim()).filter(l => /^(PASS|FAIL)\s{1,}\S/.test(l));
    console.log('  ' + page);
    console.log('     title = ' + JSON.stringify(title.trim()));
    console.log('     控制台错误 = ' + (errs.length ? errs.slice(0, 3).join(' | ') : '无'));
    if (self.length) console.log('     自检 ' + self.length + ' 条：' + self.join(' / '));
  }
  console.log('\n完成');
})();
