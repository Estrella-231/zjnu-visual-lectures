/* 临时探针：线上 PWA 可用性检查（manifest 解析 + SW 注册状态 + 全部 console） */
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');

const BASE = 'https://qggpmfqcjeedw.space.mcode.cn';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PAGE = encodeURIComponent('原理讲解_4.0_信道的定义与分类_可视化.html');

const profile = path.join(os.tmpdir(), 'mavis-pwa-' + process.pid);
const args = [
  '--headless=new', '--disable-gpu', '--no-sandbox',
  '--user-data-dir=' + profile, '--virtual-time-budget=15000',
  '--enable-logging=stderr', '--v=0', '--dump-dom', BASE + '/' + PAGE
];

const pr = spawn(CHROME, args);
let out = '';
pr.stdout.on('data', d => out += d);
pr.stderr.on('data', d => out += d);
pr.on('close', () => {
  console.log('=== 全部 console / 日志行（过滤掉噪声）===');
  const lines = out.split(/\r?\n/).filter(l =>
    /CONSOLE|Manifest|manifest|service ?worker|ServiceWorker|SW/i.test(l) && !/^\s*$/.test(l));
  lines.slice(0, 25).forEach(l => console.log('  ' + l.slice(0, 220)));
  if (!lines.length) console.log('  (无与 manifest / SW 相关的日志)');
  console.log('\n=== 判定 ===');
  const mErr = lines.filter(l => /^\[ERROR/i.test(l.trim()) || /Manifest:.*(Error|error)/i.test(l));
  console.log('  manifest / SW 相关错误：' + (mErr.length ? mErr.join(' | ').slice(0, 300) : '无'));
  console.log('  页面里有 manifest link：' + /rel="manifest"/i.test(out));
  console.log('  页面里有 apple-touch-icon：' + /apple-touch-icon/i.test(out));
});
