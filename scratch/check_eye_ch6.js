/* 专项核对：第 6 章整页的交互眼图在改用 LCG 后是否仍正确渲染
 * 查：眼图 SVG 的轨迹条数、眼高/眼宽读数、抽样时刻线、零控制台错误
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = path.resolve(__dirname, '..');
const URL = 'http://127.0.0.1:' + (process.env.EYE_PORT || 18083) + '/';

function sh(cmd, args) {
  return new Promise(resolve => {
    const p = spawn(cmd, args);
    let out = '';
    p.stdout.on('data', d => out += d);
    p.stderr.on('data', d => out += d);
    p.on('close', c => resolve({ code: c, out }));
  });
}
async function main() {
  const profile = path.join(os.tmpdir(), 'mavis-eye-' + process.pid);
  const url = URL + encodeURIComponent('第6章-数字基带传输系统-可视化讲解.html');
  const r = await sh(CHROME, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-extensions',
    '--user-data-dir=' + profile, '--virtual-time-budget=8000',
    '--enable-logging=stderr', '--v=0', '--dump-dom', url
  ]);
  const dom = r.out;
  const errs = dom.split(/\r?\n/).filter(l => /^\[ERROR:/i.test(l) || /Uncaught/i.test(l));

  /* 所有 <svg>：逐个统计 path 数 */
  const svgs = dom.match(/<svg[\s\S]*?<\/svg>/gi) || [];
  const stats = svgs.map(s => ({
    paths: (s.match(/<path\b/gi) || []).length,
    texts: (s.match(/<text\b/gi) || []).length,
    lines: (s.match(/<line\b/gi) || []).length,
    hasEyeTitle: /接收滤波器输出眼图/.test(s)
  }));
  const eye = stats.filter(s => s.hasEyeTitle);
  const maxPaths = stats.reduce((m, s) => Math.max(m, s.paths), 0);

  /* 读数回读：**按 readout 元素的 id 取值**，不要用「眼高/眼宽 + 数字」的正则 ——
     页面里 SVG 标注文字也有「眼高」「眼宽」二字，正则会先撞上标注、
     捕到别的数字（曾把 1.99 误读成 0）。 */
  function readout(id) {
    const m = dom.match(new RegExp('id="' + id + '"[^>]*>([\\s\\S]{0,300}?)<'));
    return m ? m[1].replace(/\s+/g, ' ').trim() : '';
  }
  const eyeH = readout('eyeH');
  const eyeW = readout('eyeW');
  const pe = readout('peVd') || readout('peVd2');

  console.log('SVG 总数: ' + svgs.length + '，单图最大 path 数: ' + maxPaths);
  console.log('眼图 SVG: ' + eye.length + ' 个 → ' + JSON.stringify(eye));
  console.log('眼高读数: ' + (eyeH || '(未找到)') + '   眼宽读数: ' + (eyeW || '(未找到)'));
  console.log('误码率读数: ' + (pe || '(未找到)'));
  console.log('控制台错误: ' + errs.length + (errs.length ? ' → ' + errs.slice(0, 3).join(' | ').slice(0, 300) : ''));

  const bad = [];
  if (errs.length) bad.push('控制台报错');
  if (!eye.length) bad.push('眼图 SVG 未渲染');
  else if (eye[0].paths < 200) bad.push('眼图轨迹过少(' + eye[0].paths + '，应≈240)');
  if (!eyeH || eyeH === '—') bad.push('眼高读数缺失');
  if (!eyeW || eyeW === '—') bad.push('眼宽读数缺失');
  if (eyeH && parseFloat(eyeH) < 1.5) bad.push('眼高异常小(' + eyeH + '，理想无噪应≈2.0)');
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { }
  console.log(bad.length ? '\nFAIL: ' + bad.join('；') : '\nPASS: 眼图渲染正常、读数在位、零控制台错误');
  process.exit(bad.length ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(3); });
