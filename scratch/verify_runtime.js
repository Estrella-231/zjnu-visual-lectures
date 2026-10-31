/* verify_runtime.js —— 无头 Chrome 批量运行已构建页面，检查：
 *   1) 页末自检脚本是否执行（document.title 是否带 ✓）
 *   2) 控制台是否有 error / 未捕获异常
 *   3) 页面是否渲染出 SVG 图形与公式块
 * 用法：node scratch/verify_runtime.js [前缀过滤]
 * ⚠ 中文页面名**不要**从 PowerShell 命令行传给 node（GBK → 乱码 → 过滤失效）。
 *   改用环境变量：$env:VERIFY_FILTER='习题解法_2'; node scratch/verify_runtime.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const os = require('os');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = path.resolve(__dirname, '..');
const VIZ = path.join(ROOT, 'viz');
const PORT = +(process.env.VERIFY_PORT || 18076);
const BASE = (process.env.VERIFY_BASE || ('http://127.0.0.1:' + PORT + '/viz/'));
const filter = process.argv[2] || process.env.VERIFY_FILTER || '';

const files = fs.readdirSync(VIZ)
  .filter(f => f.endsWith('.html'))
  /* 入口页与专题目录页是纯文字页，既无 SVG/Canvas 也不带 ✓ 自检标记 —— 按课程约定不参与本项检查 */
  .filter(f => !f.startsWith('00_') && !f.startsWith('index') && !f.startsWith('专题目录_'))
  .filter(f => f.indexOf(filter) >= 0)
  .sort();

if (!files.length) {
  console.error('没有匹配的页面：filter=' + filter);
  process.exit(2);
}

const profile = path.join(os.tmpdir(), 'mavis-verify-' + process.pid);

function sh(cmd, args, opts) {
  return new Promise(resolve => {
    const p = spawn(cmd, args, opts);
    let out = '';
    p.stdout.on('data', d => out += d);
    p.stderr.on('data', d => out += d);
    p.on('close', code => resolve({ code, out }));
  });
}

// 页面脚本里注入探针：读取 title / console / 渲染统计
const PROBE = `
(function(){
  var t = document.title || '';
  var svgs = document.querySelectorAll('svg');
  var paths = 0, texts = 0;
  for (var i=0;i<svgs.length;i++){
    paths += svgs[i].querySelectorAll('path,line,rect,circle,polyline').length;
    texts += svgs[i].querySelectorAll('text').length;
  }
  var fr = document.querySelectorAll('.frac').length;
  var canv = document.querySelectorAll('canvas').length;
  var cap = document.querySelectorAll('.cap').length;
  var no  = document.querySelectorAll('.formula .no').length;
  return JSON.stringify({title:t, svg:svgs.length, paths:paths, texts:texts, frac:fr, canvas:canv, cap:cap, no:no,
    bodyLen: document.body ? document.body.innerText.length : 0});
})()
`;

/* 自带静态服务器：原来硬编码 127.0.0.1:18077，而该端口上跑的是**另一门课**
   （通信电路 D:\课程文档\通信电路\scratch\serve.js）的服务器 →
   根目录不对 → 全部 404 → 页面被误判「无✓ / 无SVG」。
   现在本脚本自己起一个以本工程为根的服务器，跑完自动收摊。
   指定 VERIFY_BASE 时不起服务（外部已有服务器）。

   ⚠ 端口占用要能自己消化（本机常开着 serve.js 供手机访问）：
     端口已被占用时先探测「是不是本工程的服务」——
       是 → 直接复用；不是 → 换下一个端口再试。
     否则会 EADDRINUSE 直接崩掉整个闸门。 */
let serverProc = null;
let activePort = PORT;
let base = BASE;

function startServer(port) {
  return new Promise((resolve, reject) => {
    const srv = spawn(process.execPath, [path.join(__dirname, 'serve.js'), String(port)],
      { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    srv.stdout.on('data', d => out += d);
    srv.stderr.on('data', d => out += d);
    srv.on('error', reject);
    srv.on('close', code => {
      if (!/serving .* on http/.test(out)) {
        reject(new Error('服务器启动失败(code=' + code + '): ' + (out.split('\n').filter(l => /EADDRINUSE|Error/.test(l))[0] || out).trim()));
      }
    });
    const t0 = Date.now();
    const tick = () => {
      if (/serving .* on http/.test(out)) {
        serverProc = srv;
        return resolve();
      }
      if (srv.exitCode !== null) return;         /* close 事件里已 reject */
      if (Date.now() - t0 > 15000) { try { srv.kill(); } catch (e) { } return reject(new Error('服务器未就绪')); }
      setTimeout(tick, 150);
    };
    tick();
  });
}

/* 探测端口上已有的服务是不是「本工程」（用 build/manifest.json 里的 ch 标记做指纹） */
function probeProject(port) {
  return new Promise(resolve => {
    const req = http.get('http://127.0.0.1:' + port + '/build/manifest.json', res => {
      let b = '';
      res.on('data', d => b += d);
      res.on('end', () => resolve(/"ch"\s*:/.test(b) ? 'ours' : 'other'));
    });
    req.on('error', () => resolve('free'));
    req.setTimeout(3000, () => { req.destroy(); resolve('other'); });
  });
}

async function ensureServer() {
  for (let p = PORT; p < PORT + 8; p++) {
    const st = await probeProject(p);
    if (st === 'ours') {
      activePort = p;
      base = (process.env.VERIFY_BASE || ('http://127.0.0.1:' + p + '/viz/'));
      console.log('复用已在运行的本工程服务器 http://127.0.0.1:' + p + '/');
      return;
    }
    if (st === 'other') continue;              /* 别人的服务 → 换端口 */
    try {
      await startServer(p);
      activePort = p;
      base = (process.env.VERIFY_BASE || ('http://127.0.0.1:' + p + '/viz/'));
      console.log('已启动本工程静态服务器 http://127.0.0.1:' + p + '/');
      return;
    } catch (e) {
      /* 端口起不来 → 试下一个 */
    }
  }
  throw new Error('无法在本机启动静态服务器（端口 ' + PORT + '~' + (PORT + 7) + ' 均不可用）');
}

async function main() {
  let pass = 0, fail = 0;
  const problems = [];

  if (!process.env.VERIFY_BASE) {
    try {
      await ensureServer();
    } catch (e) {
      console.error('静态服务器启动失败：' + e.message);
      process.exit(3);
    }
  }

  for (const f of files) {
    const url = base + encodeURIComponent(f);
    const dump = path.join(profile, 'dump.txt');
    const cmd = [
      '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-extensions',
      '--user-data-dir=' + profile,
      '--virtual-time-budget=6000',
      '--enable-logging=stderr', '--v=0',
      '--dump-dom', url
    ];
    const r = await sh(CHROME, cmd, { cwd: VIZ });
    const dom = r.out;

    // 从 DOM 里找 title 与渲染统计 —— 用标记注入更可靠：改用 evaluate 不行，改从 dump 的 <html> 提取
    const titleM = dom.match(/<title>([\s\S]*?)<\/title>/i);
    const title = titleM ? titleM[1].trim() : '';

    // 控制台错误：Chrome stderr 里 [ERROR:...] 行
    const errLines = r.out.split(/\r?\n/).filter(l => /^\[ERROR:/i.test(l) || /Uncaught/i.test(l));

    /* 页末自检的逐条结论（页面 console.log 出来）：
       Chrome 把 console 消息打成 [..:INFO:CONSOLE:2558] "PASS  ...\nPASS  ...", source: ...
       → 首行带前缀、后续行原样、末尾带 source 后缀，这里统一剥干净再收。 */
    const selfLines = r.out
      .replace(/\[.*?INFO:CONSOLE:\d+\]\s*"/g, '')
      .replace(/",\s*source:.*$/gm, '')
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(l => /^(PASS|FAIL)\s{1,}\S/.test(l));
    const selfFail = selfLines.filter(l => /^FAIL/.test(l));

    const svgCount = (dom.match(/<svg[\s>]/gi) || []).length;
    const fracCount = (dom.match(/class="[^"]*\bfrac\b/gi) || []).length;

    const okTitle = /✓/.test(title);
    const okSvg = svgCount > 0;
    const okNoErr = errLines.length === 0;
    /* 页末自检里出现 FAIL → 标题必然是 ✗ 而非 ✓；这里再显式判一次，
       避免「标题被别处改过 / 自检没跑」时漏判 */
    const okSelf = selfFail.length === 0;

    if (okTitle && okSvg && okNoErr && okSelf) {
      pass++;
      console.log('PASS  ' + f + '  [✓标题|svg ' + svgCount + '|frac ' + fracCount +
        '|自检 ' + selfLines.length + ' 条全过]');
    } else {
      fail++;
      const why = [];
      if (!okTitle) why.push('无✓(' + title.slice(0, 40) + ')');
      if (!okSvg) why.push('无SVG');
      if (!okSelf) why.push('自检 FAIL ' + selfFail.length + ' 条：' + selfFail.slice(0, 3).join(' / ').slice(0, 200));
      if (!okNoErr) why.push('控制台' + errLines.length + '条:' + errLines.slice(0, 3).join(' | ').slice(0, 300));
      console.log('FAIL  ' + f + '  → ' + why.join('；'));
      problems.push(f + ' :: ' + why.join('；'));
    }
  }

  console.log('\n--------------------------------------------');
  console.log('检查页面数：' + files.length + '，PASS ' + pass + '，FAIL ' + fail);
  if (problems.length) {
    console.log('\n问题清单：');
    problems.forEach(p => console.log('  - ' + p));
  }
  if (serverProc) { try { serverProc.kill(); } catch (e) { } }
  process.exit(fail ? 1 : 0);
}

main().catch(e => {
  if (serverProc) { try { serverProc.kill(); } catch (e2) { } }
  console.error(e); process.exit(3);
});
