'use strict';
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = path.resolve(__dirname, '..');
function sh(cmd, args) {
  return new Promise(resolve => {
    const p = spawn(cmd, args);
    let out = '';
    p.stdout.on('data', d => out += d);
    p.stderr.on('data', d => out += d);
    p.on('close', c => resolve({ code: c, out }));
  });
}
(async () => {
  const profile = path.join(os.tmpdir(), 'mavis-eye2-' + process.pid);
  const url = 'http://127.0.0.1:' + (process.env.EYE_PORT || 18083) + '/' +
    encodeURIComponent('第6章-数字基带传输系统-可视化讲解.html');
  const r = await sh(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox',
    '--user-data-dir=' + profile, '--virtual-time-budget=9000', '--dump-dom', url]);
  const dom = r.out;
  /* 抓 eyeH / eyeW 两个 readout 的当前内容 */
  for (const id of ['eyeH', 'eyeW', 'eyeCap']) {
    const m = dom.match(new RegExp('id="' + id + '"[^>]*>([\\s\\S]{0,300}?)<'));
    console.log('#' + id + ' = ' + (m ? JSON.stringify(m[1].replace(/\s+/g, ' ').trim().slice(0, 220)) : '(未找到)'));
  }
  /* 抓「眼高」文字附近的上下文 */
  const txt = dom.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, '\u0001').replace(/[\u0001\s]+/g, ' ');
  let i = txt.indexOf('眼高');
  for (let k = 0; k < 4 && i >= 0; k++) {
    console.log('…' + txt.slice(Math.max(0, i - 60), i + 160) + '…');
    i = txt.indexOf('眼高', i + 1);
  }
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { }
})();
