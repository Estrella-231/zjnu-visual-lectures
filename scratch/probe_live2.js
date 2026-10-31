/* 临时探针：验收更新后的线上站点（多课程） */
'use strict';
const https = require('https');
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');

const BASE = 'https://qggpmfqcjeedw.space.mcode.cn';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

function get(p) {
  return new Promise(res => {
    https.get(BASE + p, r => {
      const chunks = [];
      r.on('data', d => chunks.push(d));
      r.on('end', () => res({ code: r.statusCode, buf: Buffer.concat(chunks) }));
    }).on('error', e => res({ code: 0, buf: Buffer.from('ERR ' + e.message) }));
  });
}

const CHECKS = [
  ['门户首页', '/index.html'],
  ['通信电路入口', '/tongxin-dianlu/index.html'],
  ['通信电路讲义', '/tongxin-dianlu/' + encodeURIComponent('原理讲解_2.4_晶体管谐振放大器_可视化.html')],
  ['通信原理入口', '/tongxin-yuanli/index.html'],
  ['通信原理分节页', '/tongxin-yuanli/' + encodeURIComponent('原理讲解_4.0_信道的定义与分类_可视化.html')],
  ['PWA 清单', '/manifest.webmanifest'],
  ['service worker', '/sw.js'],
  ['图标', '/icon-192.png']
];

(async function () {
  console.log('=== 线上 HTTP 自检 ===');
  for (const [label, p] of CHECKS) {
    const r = await get(p);
    console.log('  ' + label.padEnd(14) + ' HTTP ' + r.code + '  ' + r.buf.length + ' B');
  }

  console.log('\n=== 线上浏览器实跑 ===');
  const profile = path.join(os.tmpdir(), 'mavis-live2-' + process.pid);
  for (const [label, p] of CHECKS.slice(0, 5)) {
    const pr = spawn(CHROME, [
      '--headless=new', '--disable-gpu', '--no-sandbox',
      '--user-data-dir=' + profile, '--virtual-time-budget=12000',
      '--enable-logging=stderr', '--v=0', '--dump-dom', BASE + p
    ]);
    let out = '';
    pr.stdout.on('data', d => out += d);
    pr.stderr.on('data', d => out += d);
    await new Promise(r => pr.on('close', r));
    const title = (out.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || '(无标题)';
    const errs = out.split(/\r?\n/).filter(l => /^\[ERROR:/i.test(l) || /Uncaught/i.test(l));
    const svg = (out.match(/<svg[\s>]/gi) || []).length;
    console.log('  ' + label.padEnd(14) + ' title=' + JSON.stringify(title.trim().slice(0, 40)) +
      '  svg=' + svg + '  错误=' + (errs.length ? errs.length + ' 条' : '无'));
  }
  console.log('\n完成');
})();
