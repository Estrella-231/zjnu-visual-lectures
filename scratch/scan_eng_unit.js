// 扫描所有产物页面的渲染 DOM，找出工程计数法单位渲染错误（"10^0" / "e0"）等可见文字缺陷
// 用法：node scratch/scan_eng_unit.js [前缀过滤]
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const VIZ = path.join(path.resolve(__dirname, '..'), 'viz');
const PORT = 18077;
const filter = process.argv[2] || '';
const profile = path.join(os.tmpdir(), 'mavis-eng-' + process.pid);

const files = fs.readdirSync(VIZ)
  .filter(f => f.endsWith('.html'))
  .filter(f => !f.startsWith('00_'))
  .filter(f => f.indexOf(filter) >= 0)
  .sort();

function sh(args) {
  return new Promise(resolve => {
    const p = spawn(CHROME, args);
    let out = '';
    p.stdout.on('data', d => out += d);
    p.stderr.on('data', d => out += d);
    p.on('close', () => resolve(out));
  });
}

// 可疑文字：工程计数法单位回退串
const BAD = [/\d\s*10\^0/, /\d\s*e0\b/, /\d\s*10\^-3\b/];

(async function () {
  let bad = 0;
  for (const f of files) {
    const url = 'http://127.0.0.1:' + PORT + '/viz/' + encodeURIComponent(f);
    const dom = await sh([
      '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-extensions',
      '--user-data-dir=' + profile,
      '--virtual-time-budget=6000',
      '--dump-dom', url
    ]);
    // 只看可见文本（剥掉 script/style）
    const text = dom.replace(/<script[\s\S]*?<\/script>/g, ' ')
      .replace(/<style[\s\S]*?<\/style>/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ');
    const hits = [];
    for (const re of BAD) {
      const m = text.match(re);
      if (m) hits.push(m[0].trim());
    }
    if (hits.length) {
      bad++;
      console.log('FAIL  ' + f + '  → ' + hits.slice(0, 5).join(' | '));
    }
  }
  console.log('\n--------------------------------------------');
  console.log('扫描页面数：' + files.length + '，含单位渲染缺陷的页面：' + bad);
  process.exit(bad ? 1 : 0);
})();
