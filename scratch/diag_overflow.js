/* diag_overflow.js —— 定位某个页面的**页面级**横向溢出源
 * 用法：node scratch/diag_overflow.js <站点相对路径> [宽度]
 * 列出所有 right > clientWidth 的元素（含滚动容器内的），并给出祖先链摘要。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = path.resolve(__dirname, '..');
const W = +(process.argv[3] || 360);
const PORT = +(process.env.VERIFY_PORT || 18091);
const rel = process.argv[2];

function sh(cmd, args) {
  return new Promise(resolve => {
    const p = spawn(cmd, args);
    let o = ''; p.stdout.on('data', d => o += d); p.stderr.on('data', d => o += d);
    p.on('close', c => resolve({ code: c, out: o }));
  });
}
(async () => {
  const profile = path.join(os.tmpdir(), 'mavis-ov-' + process.pid);
  fs.mkdirSync(profile, { recursive: true });
  const harness = path.join(__dirname, '_ov_' + process.pid + '.html');
  const target = 'http://127.0.0.1:' + PORT + '/site/' + rel.split('/').map(encodeURIComponent).join('/');
  fs.writeFileSync(harness, `<!doctype html><html><head><meta charset="utf-8"><title>PENDING</title>
<style>html,body{margin:0;padding:0}#f{width:${W}px;height:900px;border:0}</style></head><body>
<iframe id="f"></iframe><script>
var f=document.getElementById('f');var t=0,iv=setInterval(function(){
  t++;var ok=false;try{var d=f.contentDocument;ok=d&&d.readyState==='complete'&&d.body&&d.body.querySelectorAll('*').length>3;}catch(e){}
  if(ok||t>50){clearInterval(iv);
    var lines=[];
    try{
      var d=f.contentDocument, w=f.contentWindow, de=d.documentElement;
      var cw=de.clientWidth;
      lines.push('clientWidth='+cw+' scrollWidth='+de.scrollWidth+' bodyScrollW='+d.body.scrollWidth);
      var all=d.querySelectorAll('body *');
      var n=0;
      for(var i=0;i<all.length;i++){
        var el=all[i], tag=el.tagName.toLowerCase();
        if(tag==='html'||tag==='body'||tag==='script'||tag==='style'||tag==='head') continue;
        var r=el.getBoundingClientRect();
        /* 只看「轻微越界」：页面 scrollWidth 只比 clientWidth 多一点，
           真正的元凶只超出几像素；宽表格那种几百像素的先排除掉。 */
        if(r.right>cw+1 && r.right<cw+60){
          var cs=w.getComputedStyle(el);
          lines.push('  ~'+tag+(el.className?'.'+String(el.className).trim().split(/\\s+/).join('.'):'')+
            ' | w='+Math.round(r.width)+' right='+Math.round(r.right)+' left='+Math.round(r.left)+
            ' | ovX='+cs.overflowX+' ws='+cs.whiteSpace+' pos='+cs.position+' disp='+cs.display+
            ' | txt='+JSON.stringify((el.textContent||'').trim().slice(0,50)));
          n++; if(n>20) break;
        }
      }
      if(n===0){
        /* 没有元素越界 → 可能是伪元素或空白文本节点 */
        var probe=w.getComputedStyle(de,'::after');
        lines.push('  (无轻微越界元素) html::after content='+JSON.stringify(probe.content)+' w='+probe.width);
        var pb=w.getComputedStyle(d.body,'::after');
        lines.push('  body::after content='+JSON.stringify(pb.content)+' w='+pb.width);
        /* 找 scrollWidth 最大的前 8 个元素 */
        var arr=[];
        for(var i2=0;i2<all.length;i2++){
          var e2=all[i2];
          if(e2.scrollWidth>e2.clientWidth+1) arr.push(e2);
        }
        arr.sort(function(a,b){return (b.scrollWidth-b.clientWidth)-(a.scrollWidth-a.clientWidth);});
        arr.slice(0,8).forEach(function(e3){
          var c3=w.getComputedStyle(e3);
          lines.push('  !'+e3.tagName.toLowerCase()+(e3.className?'.'+String(e3.className).trim().split(/\\s+/)[0]:'')+
            ' scrollW='+e3.scrollWidth+' clientW='+e3.clientWidth+' ovX='+c3.overflowX);
        });
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
  if (m) { JSON.parse(m[1]).forEach(l => console.log(l)); }
  else console.log('未取到结果');
  try { srv.kill(); } catch (e) { }
  try { fs.unlinkSync(harness); } catch (e) { }
})();
