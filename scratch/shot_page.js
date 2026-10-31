/* shot_page.js —— 站点页面截图（可指定视口宽高；高窗口 ≈ 全页）
 * 用法：node scratch/shot_page.js <站点相对路径> <输出png> [宽] [高]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = path.resolve(__dirname, '..');
const PORT = +(process.env.VERIFY_PORT || 18093);
const rel = process.argv[2];
const out = process.argv[3] || path.join(__dirname, '_shot.png');
const W = +(process.argv[4] || 1280);
const H = +(process.argv[5] || 2400);

function sh(cmd, args) {
  return new Promise(resolve => {
    const p = spawn(cmd, args);
    let o = ''; p.stdout.on('data', d => o += d); p.stderr.on('data', d => o += d);
    p.on('close', c => resolve({ code: c, out: o }));
  });
}
(async () => {
  const profile = path.join(os.tmpdir(), 'mavis-sp-' + process.pid);
  fs.mkdirSync(profile, { recursive: true });
  const srv = spawn(process.execPath, [path.join(__dirname, 'serve.js'), String(PORT)],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise(r => setTimeout(r, 1500));
  const shot = path.join(profile, 'p.png');
  const url = 'http://127.0.0.1:' + PORT + '/site/' + rel.split('/').map(encodeURIComponent).join('/');
  await sh(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    '--user-data-dir=' + profile + '/p', '--virtual-time-budget=9000',
    '--window-size=' + W + ',' + H, '--screenshot=' + shot, url]);
  try { fs.copyFileSync(shot, out); } catch (e) { console.error('截图未生成'); }
  try { srv.kill(); } catch (e) { }
  console.log('已保存: ' + out + '  (' + (fs.existsSync(out) ? fs.statSync(out).size : 0) + ' B)');
  process.exit(fs.existsSync(out) ? 0 : 1);
})();
