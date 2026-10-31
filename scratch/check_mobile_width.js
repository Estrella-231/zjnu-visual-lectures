/* check_mobile_width.js —— 在**精确宽度**的 iframe 里测页面级横向溢出
 * ⚠ headless Chrome 的 --window-size 在 Windows 有最小窗口宽，直接用会误判，
 *    所以用同源 iframe 精确控宽（见 AGENTS.md 已知坑位）。
 * 做法：scratch/ 下放一个 harness 页 → iframe 宽度 = 目标宽度 → 加载目标页 →
 *       父页读 contentDocument 的 scrollWidth / clientWidth → 结果写进 document.title
 *       → --dump-dom 取 title。
 * 用法：node scratch/check_mobile_width.js <宽度> [子串过滤]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = path.resolve(__dirname, '..');
const SITE = path.join(ROOT, 'site');
const W = +(process.argv[2] || 390);
const filter = process.argv[3] || '';
const PORT = +(process.env.VERIFY_PORT || 18085);

function sh(cmd, args) {
  return new Promise(resolve => {
    const p = spawn(cmd, args);
    let out = '';
    p.stdout.on('data', d => out += d);
    p.stderr.on('data', d => out += d);
    p.on('close', c => resolve({ code: c, out }));
  });
}
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}

(async () => {
  const targets = walk(SITE).filter(f => /\.html$/i.test(f))
    .map(f => path.relative(SITE, f).replace(/\\/g, '/'))
    .filter(f => f.indexOf(filter) >= 0).sort();
  if (!targets.length) { console.error('无匹配页面'); process.exit(2); }

  const profile = path.join(os.tmpdir(), 'mavis-mw-' + process.pid);
  fs.mkdirSync(profile, { recursive: true });
  const harness = path.join(__dirname, '_mw_harness_' + process.pid + '.html');
  fs.writeFileSync(harness, `<!doctype html><html><head><meta charset="utf-8"><title>PENDING</title>
<style>html,body{margin:0;padding:0}#f{width:${W}px;height:900px;border:0}</style></head><body>
<iframe id="f"></iframe>
<script>
/* ⚠ iframe 的 onload 对**初始 about:blank** 也会触发 —— 直接在 onload 里测量，
   量到的是空文档（scrollW 恒等于 iframe 宽）→ 「零溢出」假通过。
   正确做法：设好 src 后**轮询**，等子文档 readyState=complete 且 body 真的有子节点。 */
var f=document.getElementById('f');
var tries=0, iv=null;
function measure(){
  try{
    var d=f.contentDocument, de=d.documentElement;
    var over=[];
    var all=d.querySelectorAll('body *');
    for(var i=0;i<all.length;i++){
      var el=all[i], tag=el.tagName.toLowerCase();
      if(tag==='html'||tag==='body'||tag==='script'||tag==='style'||tag==='head') continue;
      var r=el.getBoundingClientRect();
      if(r.width>${W}+1||r.right>${W}+1){
        /* 祖先里有可横滑容器（.pub-tw / .tbl-wrap / overflow-x:auto）→ 这是
           **设计好的横滑区**，不算页面级溢出；只有顶破页面的才要报。 */
        var p=el.parentElement, inScroller=false;
        while(p && p.tagName.toLowerCase()!=='body'){
          var ov='';
          try{ ov=getComputedStyle(p).overflowX; }catch(e){}
          if(ov==='auto'||ov==='scroll'){ inScroller=true; break; }
          p=p.parentElement;
        }
        if(inScroller) continue;
        over.push(tag+(el.className?'.'+String(el.className).split(' ')[0]:'')+
          '(w='+Math.round(r.width)+',right='+Math.round(r.right)+')');
      }
    }
    document.title='R'+JSON.stringify({
      scrollW:de.scrollWidth, clientW:de.clientWidth,
      bodyScrollW:d.body.scrollWidth,
      pageOverflow:de.scrollWidth>de.clientWidth+1,
      n:over.length, over:over.slice(0,5),
      nodes:d.body.querySelectorAll('*').length,
      text:(d.body.innerText||'').length
    });
  }catch(e){ document.title='R'+JSON.stringify({err:String(e&&e.message||e)}); }
}
function poll(){
  tries++;
  var ready=false, d=null;
  try{
    d=f.contentDocument;
    ready = d && d.readyState==='complete' && d.body && d.body.querySelectorAll('*').length>=1;
  }catch(e){}
  if(ready || tries>40){
    if(iv) clearInterval(iv);
    measure();
    return;
  }
}
f.src=decodeURIComponent(location.search.replace(/^[?&]t=/,''));
iv=setInterval(poll,120);
</script></body></html>`, 'utf8');

  const srv = spawn(process.execPath, [path.join(__dirname, 'serve.js'), String(PORT)],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise(r => setTimeout(r, 1500));

  console.log('窄屏宽度 ' + W + 'px，检查 ' + targets.length + ' 页\n');
  let bad = 0;
  for (const t of targets) {
    const target = 'http://127.0.0.1:' + PORT + '/site/' + t.split('/').map(encodeURIComponent).join('/');
    let j = null;
    /* 偶发取不到测量结果（Chrome 启动竞争/虚拟时间不够）→ 重试一次再判定 */
    for (let attempt = 0; attempt < 2 && !j; attempt++) {
      const r = await sh(CHROME, [
        '--headless=new', '--disable-gpu', '--no-sandbox',
        '--user-data-dir=' + profile + '/p' + Math.random().toString(36).slice(2),
        '--virtual-time-budget=20000', '--dump-dom',
        'http://127.0.0.1:' + PORT + '/scratch/' + path.basename(harness) + '?t=' + encodeURIComponent(target)
      ]);
      const m = r.out.match(/<title>R(\{[\s\S]*?\})<\/title>/);
      if (m) { try { j = JSON.parse(m[1]); } catch (e) { j = null; } }
    }
    if (!j) { bad++; console.log('FAIL ' + t + '  → 未能取到测量结果（页面可能未加载）'); continue; }
    if (j.err) { bad++; console.log('FAIL ' + t + '  → ' + j.err); continue; }
    if (j.pageOverflow) {
      bad++;
      console.log('WARN ' + t + '  溢出：scrollW=' + j.scrollW + ' > clientW=' + j.clientW +
        '  越界元素×' + j.n + ' → ' + (j.over || []).join(' '));
    } else {
      console.log('OK   ' + t + '  [scrollW=' + j.scrollW + ' clientW=' + j.clientW + ']');
    }
  }
  try { srv.kill(); } catch (e) { }
  try { fs.unlinkSync(harness); } catch (e) { }
  console.log('\n--------------------------------------------');
  console.log('页面 ' + targets.length + ' 个：溢出 ' + bad);
  process.exit(bad ? 1 : 0);
})();
