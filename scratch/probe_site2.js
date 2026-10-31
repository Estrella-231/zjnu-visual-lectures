/* 临时探针：按「部署后的形态」抽查站点里的各类页面 */
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const http = require('http');

const BASE = 'http://127.0.0.1:18076/site/';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const PAGES = [
  ['门户首页', 'index.html'],
  ['通信电路入口', 'tongxin-dianlu/index.html'],
  ['通信电路讲义', 'tongxin-dianlu/' + encodeURIComponent('原理讲解_2.4_晶体管谐振放大器_可视化.html')],
  ['通信电路工具页', 'tongxin-dianlu/' + encodeURIComponent('工具演示_标准电路元件.html')],
  ['通信原理入口', 'tongxin-yuanli/index.html'],
  ['通信原理分节页', 'tongxin-yuanli/' + encodeURIComponent('原理讲解_4.0_信道的定义与分类_可视化.html')],
  ['通信原理旧整页', 'tongxin-yuanli/' + encodeURIComponent('第4章-信道-可视化讲解.html')]
];

function waitServer(cb, n) {
  if (n > 60) return cb();
  http.get(BASE, r => { r.resume(); cb(); })
    .on('error', () => setTimeout(() => waitServer(cb, n + 1), 150));
}

waitServer(() => {
  const profile = path.join(os.tmpdir(), 'mavis-site2-' + process.pid);
  (async function () {
    for (const [label, p] of PAGES) {
      await new Promise(resolve => {
        const pr = spawn(CHROME, [
          '--headless=new', '--disable-gpu', '--no-sandbox',
          '--user-data-dir=' + profile, '--virtual-time-budget=9000',
          '--enable-logging=stderr', '--v=0', '--dump-dom', BASE + p
        ]);
        let out = '';
        pr.stdout.on('data', d => out += d);
        pr.stderr.on('data', d => out += d);
        pr.on('close', () => {
          const title = (out.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || '(无标题)';
          const errs = out.split(/\r?\n/).filter(l => /^\[ERROR:/i.test(l) || /Uncaught/i.test(l));
          const svg = (out.match(/<svg[\s>]/gi) || []).length;
          const bad = /Failed to load resource/.test(out);
          console.log('  ' + label.padEnd(16) + ' 标题=' + JSON.stringify(title.trim().slice(0, 42)));
          console.log('     svg=' + svg + '  错误=' + (errs.length ? errs.length + ' 条: ' + errs[0].slice(0, 120) : '无') +
            (bad ? '  [有资源加载失败]' : ''));
          if (title === '(无标题)') {
            console.log('     URL=' + (BASE + p));
            console.log('     dump长度=' + out.length + '  开头=' + JSON.stringify(out.slice(0, 220)));
          }
          resolve();
        });
      });
    }
  })();
}, 0);
