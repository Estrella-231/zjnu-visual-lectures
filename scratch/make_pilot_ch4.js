/* 阶段 1 试点：从旧第 4 章整页抽取
 *   parts/ch4/_style.css   —— 本章样式（共享 CSS 之后追加，覆盖同名规则）
 *   parts/ch4/_script.js   —— 章级脚本（启动块改为 window.__CH 挂载）
 *   parts/ch4/s4_1.html    —— §4.0 片段 + 启动调用 + 页末自检
 *   parts/ch4/_foot.html   —— 页脚
 *   manifest.json          —— 登记试点页
 * 每步断言命中；内容守恒：section 切片必须与原文件逐字节一致（除尾部追加）。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = 'D:/课程文档/通信原理';
const PARTS = path.join(ROOT, 'build', 'parts', 'ch4');
fs.mkdirSync(PARTS, { recursive: true });

const src = fs.readFileSync(path.join(ROOT, '第4章-信道-可视化讲解.html'), 'utf8');
function assert(cond, msg) { if (!cond) { console.error('FAIL: ' + msg); process.exit(1); } console.log('  ok  ' + msg); }

/* ---------- 1) 样式 ---------- */
const sa = src.indexOf('<style>'), sb = src.indexOf('</style>');
assert(sa > 0 && sb > sa, '定位 <style>');
const css = src.slice(sa + 7, sb);
assert(!/https?:\/\//.test(css.replace(/url\(["']?data:/g, '')), '样式无外链 url');
fs.writeFileSync(path.join(PARTS, '_style.css'), css, 'utf8');
console.log('  _style.css ' + css.length + ' 字节');

/* ---------- 2) section §4.0 ---------- */
const s1 = src.indexOf('<section id="s1">');
const s2 = src.indexOf('<section id="s2">');
assert(s1 > 0 && s2 > s1, '定位 s1/s2');
let sec = src.slice(s1, s2);
sec = sec.replace(/\s*<!--[\s\S]*?-->\s*$/, '\n');           /* 去掉节尾的分隔注释 */
assert(sec.startsWith('<section id="s1">') && sec.trimEnd().endsWith('</section>'), 's1 切片首尾完整');
const secBody = sec.trim();   /* 守恒基线：片段正文 = 原文切片去首尾空白 */

/* ---------- 3) 章级脚本（启动块 → __CH 挂载） ---------- */
const ib = src.lastIndexOf('<script>');
const ie = src.lastIndexOf('</script>');
assert(ib > 0 && ie > ib, '定位页级 <script>');
let script = src.slice(ib + 8, ie);
const startMark = '/* ================= 启动 ================= */';
const si = script.indexOf(startMark);
assert(si > 0, '定位启动块');
const defs = script.slice(0, si);
const names = ['wSysMap', 'wModModel', 'w4Draw', 'w1Init', 'w2Init', 'w3Init', 'w5Init',
  'w6Init', 'w7Init', 'w8Init', 'w9Init', 'w10Init', 'w11Init', 'w12Init'];
for (const n of names) assert(new RegExp('function\\s+' + n + '\\s*\\(').test(defs), '定义 function ' + n);
const mount = [
  '',
  '/* ================= 分节页启动挂载 =================',
  '   整章拆成单节页后，各节片段只启动自己用到的部件（片段尾部调用）。',
  '   这里把启动函数挂到 window.__CH —— 浏览器与桩 DOM 检查器语义一致。 */',
  'window.__CH = {',
  names.map(n => '  ' + n + ':' + n).join(',\n'),
  '};',
  '})();',
  ''
].join('\n');
const scriptOut = defs + mount;
assert(/\}\)\(\);\s*$/.test(scriptOut), '章级脚本以 IIFE 收尾');
fs.writeFileSync(path.join(PARTS, '_script.js'), scriptOut, 'utf8');
console.log('  _script.js ' + scriptOut.length + ' 字节（原 ' + script.length + '，启动块 ' + (script.length - si) + ' 字节改为挂载）');

/* ---------- 4) 片段 = section + 启动 + 页末自检 ---------- */
const tail = [
  '<script>',
  '/* §4.0 启动：本节只画通信系统框图 */',
  'if (window.__CH) window.__CH.wSysMap();',
  '',
  '/* ===== 页末自检（§4.0 信道的定义与分类） =====',
  '   本节为定性节，无编号公式；自检 = 结构完整性 + 教材口径对撞 + 页面渲染回读。 */',
  '(function(){',
  '  var out = [], ok = true;',
  '  function t(name, cond, extra){ out.push((cond ? "PASS" : "FAIL") + "  " + name + (extra ? "  " + extra : "")); if(!cond) ok = false; }',
  '  var map = document.getElementById("sysmap");',
  '  t("通信系统框图已渲染", !!map && map.childNodes.length > 0, "children=" + (map ? map.childNodes.length : 0));',
  '  t("分类卡片 4 张（介质/特性/噪声/信号）", document.querySelectorAll(".purpose .card").length === 4);',
  '  var kv = document.querySelector("ul.kv");',
  '  t("调制信道与编码信道定义齐全", !!kv && /调制信道/.test(kv.textContent) && /编码信道/.test(kv.textContent));',
  '  t("狭义/广义信道双卡并列", document.querySelectorAll(".grid2 .card").length >= 2);',
  '  t("教材口径：信道=连接收发端的通信设备", /连接发送端和接收端的通信设备/.test(document.body.textContent));',
  '  console.log(out.join("\\n"));',
  '  document.title += (ok ? " \\u2713" : " \\u2717");',
  '})();',
  '</script>',
  ''
].join('\n');
const frag = secBody + '\n\n' + tail;
fs.writeFileSync(path.join(PARTS, 's4_1.html'), frag, 'utf8');
console.log('  s4_1.html ' + frag.length + ' 字节（section 正文 ' + secBody.length + ' 逐字来自原页）');

/* ---------- 5) 页脚 ---------- */
const foot = [
  '<footer class="foot">',
  '  <p><b>第 4 章 信道 · 可视化讲解</b>　—　依据樊昌信《通信原理》第 7 版（正文 63–85 页 = PDF 78–100）与第 4 章 PPT 制作。</p>',
  '  <p>本章共 12 节，按节拆分迁移中：当前页为 §4.0（第 1 / 12 节）。公式核对记录沿用整页版：',
  '    式 (4.1-1)~(4.1-12)、(4.3-1)~(4.3-4)、(4.4-1)~(4.4-11)、(4.5-1)~(4.5-3)、(4.6-1)~(4.6-13)；',
  '    含根号的式 (4.1-2)、(4.1-3)、(4.5-1) 均以教材渲染图为准。</p>',
  '  <div class="nav">',
  '    <span>← <a href="../制作总目录.md">返回制作总目录</a></span>',
  '    <span><a href="#s1">回到本节开头 ↑</a></span>',
  '  </div>',
  '</footer>',
  ''
].join('\n');
fs.writeFileSync(path.join(PARTS, '_foot.html'), foot, 'utf8');
console.log('  _foot.html ' + foot.length + ' 字节');

/* ---------- 6) manifest ---------- */
const entry = {
  ch: 'ch4',
  id: 's4_1',
  file: '原理讲解_4.0_信道的定义与分类_可视化.html',
  title: '原理讲解 · 4.0 信道的定义与分类',
  kicker: '通信原理 · 第 4 章',
  h1: '信道',
  h1em: '：信号要走的那条路',
  sub: '前三章我们造信号、编信号，本章要回答更现实的问题：<strong>信号真的能到得了对面吗？</strong>' +
    '无线信道的电离层会反射、地面会挡住视线、会有多径衰落；有线信道的电缆会衰减、光纤有色散；' +
    '再加上无处不在的噪声——最后我们还要算一笔账：<strong>这条信道每秒最多能传多少比特？</strong>' +
    '<br><span style="opacity:.75;font-size:14px">分节迁移试点：当前页为 §4.0（第 1 / 12 节），其余小节随后上线。</span>',
  meta: [
    '<span>教材：樊昌信《通信原理》第 7 版 第 4 章（正文 63–85 页 = PDF 78–100）</span>',
    '<span>课件：第 4 章 PPT（zhou 版）</span>',
    '<span>状态：阶段 1 试点 · 待五件套全绿</span>'
  ]
};
const mPath = path.join(ROOT, 'build', 'manifest.json');
const m = fs.existsSync(mPath) ? JSON.parse(fs.readFileSync(mPath, 'utf8')) : [];
const i = m.findIndex(x => x.id === entry.id && x.ch === entry.ch);
if (i >= 0) m[i] = entry; else m.push(entry);
fs.writeFileSync(mPath, JSON.stringify(m, null, 2) + '\n', 'utf8');
console.log('  manifest.json 登记 ' + entry.file + '（共 ' + m.length + ' 页）');
console.log('试点素材全部生成');
