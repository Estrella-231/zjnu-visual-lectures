'use strict';
/* 在真 Chrome 里驱动第7章的 w14 交互：切多进制 → 调 M → 点格子 → 读回读数 */
const path = require('path'), os = require('os'), fs = require('fs');
const { spawn } = require('child_process');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = path.resolve(__dirname, '..');
const PORT = +(process.env.VERIFY_PORT || 18087);

function sh(cmd, args) {
  return new Promise(res => {
    const p = spawn(cmd, args);
    let o = ''; p.stdout.on('data', d => o += d); p.stderr.on('data', d => o += d);
    p.on('close', c => res({ code: c, out: o }));
  });
}
const HARNESS = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
<iframe id="f" src="http://127.0.0.1:${PORT}/site/tongxin-yuanli/%E7%AC%AC7%E7%AB%A0-%E6%95%B0%E5%AD%97%E5%B8%A6%E9%80%9A%E4%BC%A0%E8%BE%93%E7%B3%BB%E7%BB%9F-%E5%8F%AF%E8%A7%86%E5%8C%96%E8%AE%B2%E8%A7%A3.html"
 style="width:1280px;height:2400px;border:0"></iframe>
<script>
window.RESULT=null;
function log(s){ document.title = 'LOG::'+s; }
const f=document.getElementById('f');
f.onload=function(){
  var tries=0;
  function go(){
    tries++;
    var d=f.contentDocument;
    if(!d||!d.getElementById||!d.getElementById('w14')||!d.getElementById('w14M')){
      if(tries<60){ setTimeout(go,300); return; }
      log('ERR timeout readyState='+(d?d.readyState:'null')); return;
    }
    try{
      var w=f.contentWindow;
      var out=[];
      // 1) 切到多进制
      var btn=d.querySelector('[data-b14="mul"]');
      btn.click();
      out.push('after mul: '+d.getElementById('w14Mv').textContent);
      // 2) 读 SVG 里的体制名
      function names(){
        var ts=d.querySelectorAll('#w14 text[data-w14]');
        var arr=[];
        for(var i=0;i<ts.length;i++){ if(ts[i].getAttribute('font-size')==='17') arr.push(ts[i].textContent); }
        return arr.join(',');
      }
      out.push('M=4 names: '+names());
      // 3) 调 M 到 8
      var sl=d.getElementById('w14M');
      sl.value='8';
      sl.dispatchEvent(new w.Event('input',{bubbles:true}));
      out.push('after M=8: '+d.getElementById('w14Mv').textContent+' names: '+names());
      // 4) 点 PSK 格（相位旋钮）
      var cells=d.querySelectorAll('#w14 [data-w14="psk"]');
      out.push('psk hotspots: '+cells.length);
      cells[0].dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
      out.push('after click psk, readout: '+d.getElementById('w14ro').textContent.replace(/\\s+/g,' ').trim());
      out.push('cap: '+d.getElementById('w14cap').textContent.slice(0,120));
      // 5) 数字调制 vs 模拟调制 卡片存在？
      out.push('cards: '+d.querySelectorAll('#s1 .grid2 .card').length);
      out.push('tables: '+d.querySelectorAll('#s1 table').length);
      log(out.join(' || '));
    }catch(e){ log('ERR '+e.message); }
  }
  go();
};
</script></body></html>`;

(async () => {
  const hp = path.join(ROOT, 'site', '_harness_ch7.html');
  fs.writeFileSync(hp, HARNESS, 'utf8');
  const profile = path.join(os.tmpdir(), 'prof_ch7_' + process.pid);
  fs.mkdirSync(profile, { recursive: true });
  const srv = spawn(process.execPath, [path.join(__dirname, 'serve.js'), String(PORT)], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise(r => setTimeout(r, 1500));
  const r = await sh(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=15000',
    '--user-data-dir=' + profile, '--dump-dom', 'http://127.0.0.1:' + PORT + '/site/_harness_ch7.html'], {});
  const m = r.out.match(/LOG::([\s\S]*?)<\/title>/);
  console.log(m ? m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"') : 'NO LOG');
  try { srv.kill(); } catch (e) { }
  try { fs.unlinkSync(hp); } catch (e) { }
})();
