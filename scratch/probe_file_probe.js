/* 临时探针：用 file:// 直接跑已构建页面，读取 title / svg 数 / 自检 console
   （验证 verify_runtime 的 FAIL 是「服务器没起」还是「页面真失败」） */
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const VIZ = 'D:/课程文档/通信原理/viz';
const file = process.argv[2] || '原理讲解_4.0_信道的定义与分类_可视化.html';
const url = 'file:///' + encodeURI(path.join(VIZ, file)).replace(/\\/g, '/');
const profile = path.join(os.tmpdir(), 'mavis-probe-' + process.pid);

const cmd = [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-extensions',
  '--user-data-dir=' + profile,
  '--virtual-time-budget=8000',
  '--enable-logging=stderr', '--v=0',
  '--dump-dom', url
];

const p = spawn(CHROME, cmd, { cwd: VIZ });
let out = '';
p.stdout.on('data', d => out += d);
p.stderr.on('data', d => out += d);
p.on('close', () => {
  const title = (out.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || '';
  const svg = (out.match(/<svg[\s>]/gi) || []).length;
  const paths = (out.match(/<(path|line|rect|circle|polyline)[\s>]/gi) || []).length;
  const errs = out.split(/\r?\n/).filter(l => /^\[ERROR:/i.test(l) || /Uncaught/i.test(l));
  const selfCheck = out.split(/\r?\n/).filter(l => /^(PASS|FAIL)\s{2}/.test(l.trim()));
  console.log('URL        :', url);
  console.log('title      :', JSON.stringify(title.trim()));
  console.log('svg 元素数 :', svg);
  console.log('图形元素数 :', paths);
  console.log('自检输出   :', selfCheck.length ? selfCheck.join('\n             ') : '(无)');
  console.log('控制台错误 :', errs.length ? errs.slice(0, 5).join('\n             ') : '无');
  console.log('dump 长度  :', out.length);
  console.log('dump 原文  :', out.slice(0, 400).replace(/\r/g, ''));
});
