/* shot_mobile.js —— 截「手机视角」实图（390px 宽的 iframe 包住页面）
 * 用法：node scratch/shot_mobile.js <站点相对路径> <输出png> [滚动位置]
 * ⚠ headless Chrome 的 --window-size 在 Windows 有最小窗口宽 → 用 iframe 精确控宽。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = path.resolve(__dirname, '..');
const W = 390;
const PORT = +(process.env.VERIFY_PORT || 18087);

const rel = process.argv[2];
const out = process.argv[3] || path.join(__dirname, '_shot.png');
const scrollTo = +(process.argv[4] || 0);
const FH = +(process.argv[5] || 844);
if (!rel) { console.error('用法: node scratch/shot_mobile.js <相对路径> <输出png> [scrollY] [iframe高]'); process.exit(2); }

function sh(cmd, args) {
  return new Promise(resolve => {
    const p = spawn(cmd, args);
    let o = ''; p.stdout.on('data', d => o += d); p.stderr.on('data', d => o += d);
    p.on('close', c => resolve({ code: c, out: o }));
  });
}
(async () => {
  const profile = path.join(os.tmpdir(), 'mavis-shot-' + process.pid);
  fs.mkdirSync(profile, { recursive: true });
  const harness = path.join(__dirname, '_shot_harness_' + process.pid + '.html');
  const target = 'http://127.0.0.1:' + PORT + '/site/' + rel.split('/').map(encodeURIComponent).join('/');
  fs.writeFileSync(harness, `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;padding:0;background:#fff}
#f{width:${W}px;height:${FH}px;border:0;display:block}
</style></head><body><iframe id="f"></iframe>
<script>
var f=document.getElementById('f');
var t=0, iv=setInterval(function(){
  t++;
  var ok=false;
  try{ var d=f.contentDocument; ok=d&&d.readyState==='complete'&&d.body&&d.body.querySelectorAll('*').length>3; }catch(e){}
  if(ok||t>60){ clearInterval(iv);
    setTimeout(function(){
      try{ f.contentWindow.scrollTo(0, ${scrollTo});
           f.contentDocument.documentElement.scrollTop=${scrollTo};
           f.contentDocument.body.scrollTop=${scrollTo};
           var w=f.contentWindow, d=f.contentDocument;
           /* 把页面里的滚动容器也定位到指定位置 */
           var els=d.querySelectorAll('*');
           for(var i=0;i<els.length;i++){
             var e=els[i];
             if(e.scrollHeight>e.clientHeight+50 && e.getBoundingClientRect().top<200){ e.scrollTop=${scrollTo}; }
           }
      }catch(e){}
    },400);
  }
},120);
f.src=${JSON.stringify(target)};
</script></body></html>`, 'utf8');

  const srv = spawn(process.execPath, [path.join(__dirname, 'serve.js'), String(PORT)],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise(r => setTimeout(r, 1500));

  const shot = path.join(profile, 'shot.png');
  const r = await sh(CHROME, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    '--user-data-dir=' + profile + '/p', '--virtual-time-budget=15000',
    '--window-size=' + W + ',' + FH, '--screenshot=' + shot,
    'http://127.0.0.1:' + PORT + '/scratch/' + path.basename(harness)
  ]);
  try { fs.copyFileSync(shot, out); } catch (e) { console.error('截图未生成:', r.out.slice(-500)); }
  try { srv.kill(); } catch (e) { }
  try { fs.unlinkSync(harness); } catch (e) { }
  console.log('已保存: ' + out + '  (' + (fs.existsSync(out) ? fs.statSync(out).size : 0) + ' B)');
  process.exit(fs.existsSync(out) ? 0 : 1);
})();
