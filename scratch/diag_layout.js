/* diag_layout.js —— 诊断某个溢出元素的祖先链（display / width / min-width / flex）
 * 用法：node scratch/diag_layout.js <站点相对路径> <待查 class 名>
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = path.resolve(__dirname, '..');
const W = 390;
const PORT = +(process.env.VERIFY_PORT || 18089);
const rel = process.argv[2];
const cls = process.argv[3] || 'figwrap';

function sh(cmd, args) {
  return new Promise(resolve => {
    const p = spawn(cmd, args);
    let o = ''; p.stdout.on('data', d => o += d); p.stderr.on('data', d => o += d);
    p.on('close', c => resolve({ code: c, out: o }));
  });
}
(async () => {
  const profile = path.join(os.tmpdir(), 'mavis-diag-' + process.pid);
  fs.mkdirSync(profile, { recursive: true });
  const harness = path.join(__dirname, '_diag_' + process.pid + '.html');
  const target = 'http://127.0.0.1:' + PORT + '/site/' + rel.split('/').map(encodeURIComponent).join('/');
  fs.writeFileSync(harness, `<!doctype html><html><head><meta charset="utf-8"><title>PENDING</title>
<style>html,body{margin:0;padding:0}#f{width:${W}px;height:900px;border:0}</style></head><body>
<iframe id="f"></iframe><script>
var f=document.getElementById('f');var t=0,iv=setInterval(function(){
  t++;var ok=false;try{var d=f.contentDocument;ok=d&&d.readyState==='complete'&&d.body&&d.body.querySelectorAll('*').length>3;}catch(e){}
  if(ok||t>50){clearInterval(iv);
    var lines=[];
    try{
      var d=f.contentDocument;
      var el=d.querySelector('.'+${JSON.stringify(cls)});
      if(!el){ lines.push('未找到 .'+${JSON.stringify(cls)}); }
      else{
        var p=el;
        while(p&&p.tagName.toLowerCase()!=='html'){
          var cs=f.contentWindow.getComputedStyle(p);
          var r=p.getBoundingClientRect();
          lines.push(p.tagName.toLowerCase()+(p.className?'.'+String(p.className).trim().split(/\\s+/).join('.'):'')+
            ' | display='+cs.display+' width='+cs.width+' minW='+cs.minWidth+' maxW='+cs.maxWidth+
            ' flex='+cs.flex+' | rect w='+Math.round(r.width)+' right='+Math.round(r.right)+
            ' ovX='+cs.overflowX);
          p=p.parentElement;
        }
      }
    }catch(e){lines.push('ERR '+e.message);}
    document.title='R'+JSON.stringify(lines);
  }
},120);
f.src=${JSON.stringify(target)};
</script></body></html>`, 'utf8');

  const srv = spawn(process.execPath, [path.join(__dirname, 'serve.js'), String(PORT)],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise(r => setTimeout(r, 1500));
  const r = await sh(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox',
    '--user-data-dir=' + profile + '/p', '--virtual-time-budget=20000', '--dump-dom',
    'http://127.0.0.1:' + PORT + '/scratch/' + path.basename(harness)]);
  const m = r.out.match(/<title>R(\[[\s\S]*?\])<\/title>/);
  if (m) { JSON.parse(m[1]).forEach(l => console.log('  ' + l)); }
  else console.log('未取到结果');
  try { srv.kill(); } catch (e) { }
  try { fs.unlinkSync(harness); } catch (e) { }
})();
