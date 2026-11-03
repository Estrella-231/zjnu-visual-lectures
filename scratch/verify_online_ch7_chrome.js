'use strict';
/* 真 Chrome 打开线上第7章：查标题 / SVG / console error / 交互是否可用 */
const https = require('https');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os'), fs = require('fs');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = 'https://qggpmfqcjeedw.space.mcode.cn/tongxin-yuanli/%E7%AC%AC7%E7%AB%A0-%E6%95%B0%E5%AD%97%E5%B8%A6%E9%80%9A%E4%BC%A0%E8%BE%93%E7%B3%BB%E7%BB%9F-%E5%8F%AF%E8%A7%86%E5%8C%96%E8%AE%B2%E8%A7%A3.html?v=' + Date.now();

function sh(cmd, args) {
  return new Promise(res => {
    const p = spawn(cmd, args);
    let o = ''; p.stdout.on('data', d => o += d); p.stderr.on('data', d => o += d);
    p.on('close', c => res({ code: c, out: o }));
  });
}
(async () => {
  const profile = path.join(os.tmpdir(), 'online-ch7-' + process.pid);
  fs.mkdirSync(profile, { recursive: true });
  const r = await sh(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox',
    '--user-data-dir=' + profile, '--virtual-time-budget=8000', '--enable-logging=stderr', '--v=0',
    '--dump-dom', URL], {});
  const dom = r.out;
  const errs = r.out.split(/\r?\n/).filter(l => /^\[ERROR:/i.test(l) || /Uncaught/i.test(l));
  console.log('SVG 渲染数: ' + (dom.match(/<svg[\s>]/gi) || []).length);
  console.log('w14 体制名文本: ' + (dom.match(/>(2ASK|2FSK|2PSK|MASK|MFSK|MPSK|QPSK)</g) || []).slice(0, 6).join(' '));
  console.log('维度表: ' + (dom.indexOf('信号参量有') >= 0 ? '在' : '缺'));
  console.log('callout: ' + (dom.indexOf('最容易混的一点') >= 0 ? '在' : '缺'));
  console.log('两张对照卡: ' + (dom.match(/class="card"/g) || []).length + ' 个 .card');
  console.log('console 错误: ' + errs.length);
  errs.slice(0, 5).forEach(e => console.log('   ' + e.slice(0, 200)));
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { }
})();
