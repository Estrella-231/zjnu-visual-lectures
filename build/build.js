/* =======================================================================
   通信原理 第7版（樊昌信）可视化页面构建器（**多章通用**）
   用法： node build.js                 构建 manifest.json 里的全部页面
          node build.js ch4             只构建第 4 章
   输入： build/parts/<章>/<id>.html   （纯 body 片段）
         build/parts/<章>/_style.css  （本章样式，追加在共享 CSS 之后 → 覆盖同名规则）
         build/parts/<章>/_script.js  （本章页级脚本，注入 <head> 后、片段之前）
         build/parts/<章>/_foot.html   （本章页脚，可选，拼在片段之后）
   输出： D:\课程文档\通信原理\viz\*.html （独立单文件页面）
   ======================================================================= */
const fs = require('fs');
const path = require('path');

const ROOT = 'D:/课程文档/通信原理';
const TMP = path.join(ROOT, 'build');
const PARTS = path.join(TMP, 'parts');
const OUT = path.join(ROOT, 'viz');

/* ============================ 共享 CSS ============================ */
const CSS = `
:root{
  --ink:#1a1a1a; --mut:#6b6b6b; --line:#1f1f1f; --soft:#e9ecef;
  --blue:#1a46b5; --red:#c02020; --green:#0d7a3c; --amber:#c07a00; --violet:#7a3fb0;
  --bg:#fbfbf9; --card:#fff; --bd:#d8d8d2;
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);
  font-family:"Microsoft YaHei","PingFang SC","Noto Sans CJK SC","Source Han Sans SC",sans-serif;
  line-height:1.75;}
.wrap{max-width:1180px;margin:0 auto;padding:0 24px 90px}
header{background:linear-gradient(135deg,#12233f,#2a4a7d);color:#fff;padding:52px 0 44px;margin-bottom:36px}
header .wrap{padding-bottom:0}
.kicker{font-size:13px;letter-spacing:.22em;opacity:.72;margin:0 0 10px}
h1{font-size:34px;margin:0 0 12px;line-height:1.3;font-weight:700}
.sub{font-size:16px;opacity:.85;max-width:860px;margin:0}
.meta{margin-top:22px;font-size:13px;opacity:.7;display:flex;gap:22px;flex-wrap:wrap}
h2{font-size:23px;margin:52px 0 6px;padding-bottom:10px;border-bottom:2px solid var(--ink);font-weight:700}
h2 .num{color:var(--blue);margin-right:10px}
h3{font-size:17px;margin:28px 0 10px;color:#234}
h4{font-size:15px;margin:18px 0 8px;color:#333}
p{margin:10px 0}
.card{background:var(--card);border:1px solid var(--bd);border-radius:10px;padding:22px 24px;margin:18px 0;
  box-shadow:0 1px 3px rgba(0,0,0,.04)}
.card.pad0{padding:14px 18px}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:20px}
.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.grid21{display:grid;grid-template-columns:2fr 1fr;gap:20px}
.grid12{display:grid;grid-template-columns:1fr 2fr;gap:20px}
@media(max-width:900px){.grid2,.grid3,.grid21,.grid12{grid-template-columns:1fr}}
svg{width:100%;height:auto;display:block;background:#fff;border-radius:6px}
.cap{font-size:13px;color:var(--mut);text-align:center;margin-top:8px}
svg text{font-family:"Microsoft YaHei",sans-serif}
.badge{display:inline-block;font-size:12px;padding:2px 9px;border-radius:20px;background:#eef2f8;color:#234;margin-right:6px}
.formula{background:#f6f7f5;border-left:3px solid var(--blue);padding:12px 18px;margin:14px 0;
  font-family:"Cambria Math","Times New Roman",serif;font-size:17px;overflow-x:auto}
.formula .no{float:right;color:var(--mut);font-size:14px;font-family:"Microsoft YaHei",sans-serif}
.ctrls{display:flex;flex-wrap:wrap;gap:22px;background:#f2f4f7;border:1px solid var(--bd);
  border-radius:8px;padding:16px 20px;margin:16px 0}
.ctrl{flex:1 1 200px}
.ctrl label{display:block;font-size:13.5px;font-weight:700;margin-bottom:6px}
.ctrl .row{display:flex;align-items:center;gap:10px}
.ctrl input[type=range]{flex:1;accent-color:var(--blue);height:20px}
.ctrl .val{font-family:Consolas,monospace;font-size:14px;font-weight:700;color:var(--blue);min-width:70px;text-align:right}
.readout{display:grid;grid-template-columns:repeat(auto-fit,minmax(148px,1fr));gap:12px;margin:16px 0}
.ro{background:#fff;border:1px solid var(--bd);border-left:3px solid var(--blue);border-radius:6px;padding:10px 14px}
.ro .k{font-size:12px;color:var(--mut)}
.ro .v{font-family:Consolas,monospace;font-size:19px;font-weight:700;color:var(--ink)}
.ro.g{border-left-color:var(--green)} .ro.g .v{color:var(--green)}
.ro.r{border-left-color:var(--red)} .ro.r .v{color:var(--red)}
.ro.a{border-left-color:var(--amber)} .ro.a .v{color:var(--amber)}
.ro.v{border-left-color:var(--violet)} .ro.v .v{color:var(--violet)}
canvas{width:100%;height:auto;display:block;background:#fff;border:1px solid var(--bd);border-radius:8px}
table{width:100%;border-collapse:collapse;font-size:14px;margin:12px 0}
th,td{border:1px solid var(--bd);padding:8px 11px;text-align:left;vertical-align:top}
th{background:#f2f4f7;font-weight:700}
td.n{font-family:Consolas,monospace;white-space:nowrap}
ul,ol{padding-left:24px}li{margin:7px 0}
.hl{background:#fff6d8;padding:1px 4px;border-radius:3px;font-weight:600}
.warn{background:#fff4f4;border-left:3px solid var(--red);padding:12px 18px;margin:14px 0;font-size:14.5px}
.steps{display:grid;gap:9px;margin:14px 0}
.st{background:#f7f9fc;border-left:3px solid var(--blue);padding:10px 15px;border-radius:0 6px 6px 0;font-size:14.5px}
.st b{color:var(--blue);margin-right:6px}
.mono{font-family:Consolas,"Microsoft YaHei",monospace;background:#eef2f8;color:#12306e;
      padding:2px 8px;border-radius:4px;display:inline-block;margin-top:4px;font-size:14px}
.note{background:#f4f8ff;border-left:3px solid var(--blue);padding:12px 18px;margin:14px 0;font-size:14.5px}
.sym{font-size:14px;margin:12px 0}
.sym td:first-child{width:130px}
.why{display:block;margin-top:8px;font-size:13.5px;color:#444;line-height:1.72}
.why::before{content:"↳ ";color:var(--amber);font-weight:700}
.live{background:#fffaf0;border:1px dashed var(--amber);border-radius:8px;padding:13px 18px;margin:16px 0;font-size:14.5px}
.live b{color:#9a5c00}
.kv{font-family:Consolas,monospace;background:#eef2f8;color:#12306e;padding:1px 7px;border-radius:4px;font-size:14px}
.eqno{color:var(--mut);font-size:12.5px;margin-left:6px;white-space:nowrap}
.foot{margin-top:60px;padding-top:20px;border-top:1px solid var(--bd);font-size:13px;color:var(--mut)}
.legend{display:flex;gap:18px;flex-wrap:wrap;font-size:13px;margin:8px 0 2px;align-items:center}
.legend i{display:inline-block;width:22px;height:3px;vertical-align:middle;margin-right:6px}
button{font-family:inherit;font-size:14px;padding:7px 16px;border:1px solid var(--bd);background:#fff;
  border-radius:6px;cursor:pointer;margin-right:8px}
button:hover{border-color:var(--blue);color:var(--blue)}
button.on{background:var(--blue);color:#fff;border-color:var(--blue)}
.btns{margin:12px 0 4px}
.ex{background:#fffdf2;border:1px solid #e3d9a8;border-left:4px solid var(--amber);border-radius:8px;
  padding:16px 20px;margin:18px 0}
.ex .ttl{font-weight:700;color:#8a5c00;margin-bottom:6px}
.ex .ans{background:#fff;border:1px solid #e8e2c8;border-radius:6px;padding:10px 14px;margin-top:10px;font-size:14.5px}
.figno{font-size:12.5px;color:var(--mut);float:right;font-family:"Microsoft YaHei",sans-serif}
.tag{display:inline-block;font-size:11.5px;padding:1px 8px;border-radius:4px;background:#eef2f8;color:#234;
  border:1px solid #d5dcea;font-family:"Microsoft YaHei",sans-serif}
.subh{font-size:15.5px;font-weight:700;color:#234;margin:20px 0 8px;padding-left:9px;border-left:4px solid var(--blue)}
.small{font-size:13.5px;color:#555}
.center{text-align:center}
.irow{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:10px 0}
.irow .tag{margin-right:2px}

/* ==================== 数学排版：堆叠分式 / 根号 ====================
   教材的分式、根号都是竖排写法，这里用纯 CSS 还原（不引外部字体/库）。
   .frac  > .fn 分子 / .fd 分母（.fd 上边框即分式横线）
   .sqrt > .sgn 根号 / .rad 被开方数（.rad 上边框即根号横线）
   .fb 是视觉隐藏的 "/"：复制粘贴得到线性写法，静态抄写检查也靠它还原 */
.mt{font-family:"Cambria Math","STIX Two Math","Times New Roman",serif}
td.n.mt{font-family:"Cambria Math","STIX Two Math","Times New Roman",serif;white-space:normal}
.frac,.sqrt{font-family:"Cambria Math","STIX Two Math","Times New Roman",serif}
.frac{display:inline-flex;flex-direction:column;align-items:stretch;position:relative;
  margin:0 .2em;padding:0 .03em;text-align:center;line-height:1.15;vertical-align:middle}
.frac>.fn{padding:0 .24em .04em}
.frac>.fd{padding:.04em .24em 0;border-top:1px solid currentColor}
.frac>.fb{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.sqrt{display:inline-block;white-space:nowrap}
.sqrt>.sgn{display:inline-block}
.sqrt>.rad{display:inline-block;border-top:1px solid currentColor;
  padding:0 .18em 0 .34em;margin-left:-.2em}
/* 被开方数里含堆叠分式时，根号要罩住整个分式（照教材的写法）：
   字形 "√" 罩不住两行高的分式，改用 mask 画一个**可任意拉伸**的钩，
   SVG 直接写在 data URI 里 —— 页面仍然完全自包含，不引用任何外部资源。
   横线（根号顶上的那一条）仍由 .rad 的上边框给出；
   钩的笔画用普通 stroke（不加 non-scaling-stroke），随字号一起缩放。 */
.sqrt.tall{display:inline-flex;align-items:stretch;vertical-align:middle}
.sqrt.tall>.sgn{flex:0 0 auto;position:relative;width:.42em;background:currentColor;
  -webkit-mask:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 100' preserveAspectRatio='none'><path d='M1 99 L6.5 82 L11 2' fill='none' stroke='black' stroke-width='4.5'/></svg>") no-repeat center/100% 100%;
  mask:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 100' preserveAspectRatio='none'><path d='M1 99 L6.5 82 L11 2' fill='none' stroke='black' stroke-width='4.5'/></svg>") no-repeat center/100% 100%}
.sqrt.tall>.sgn>.sg{position:absolute;left:0;top:0;font-size:0;line-height:0}
.sqrt.tall>.rad{flex:0 0 auto;border-top:1px solid currentColor;padding:0 .18em 0 .06em}
/* 大算符：∑ / ∏ 用**上下限**（教材式 (5-16)：+∞ 在 ∑ 正上、n=1 在正下）；
   ∫ 用**右侧限位**（教材式 (5-28)：π 在右上、−π 在右下）。
   两者排法不同，所以 .bigop（grid 上下）与 .opint（inline 右侧）分开做。 */
.bigop{display:inline-grid;justify-items:center;vertical-align:middle;line-height:1;margin:0 .16em}
.bigop>.op{grid-row:2;font-size:1.5em}
.bigop>.lim{font-size:.6em;line-height:1.12}
.bigop>.up{grid-row:1}
.bigop>.dn{grid-row:3}
.opint{font-size:1.3em;font-style:italic;vertical-align:-.14em}
`;

/* ============================ 共享 JS 库 ============================ */
const LIB = fs.readFileSync(path.join(TMP, 'lib.js'), 'utf8');

/* ============================ 数学宏渲染 ============================ */
const MATH = require(path.join(TMP, 'math.js'));

/* ============================ 移动端适配 ============================ */
const MOBILE_CSS = fs.readFileSync(path.join(TMP, 'mobile.css'), 'utf8');
const MOBILE_JS = fs.readFileSync(path.join(TMP, 'mobile.js'), 'utf8');
const ICONS = require(path.join(TMP, 'make_icons.js'));

/* ======================= 章节样式 / 章节脚本 ======================= */
const _styleCache = {};
function chapterCSS(ch) {
  if (_styleCache[ch] !== undefined) return _styleCache[ch];
  const p = path.join(PARTS, ch, '_style.css');
  let css = '';
  if (fs.existsSync(p)) css = fs.readFileSync(p, 'utf8');
  else console.warn('  !! 缺少章节样式 ' + p + '（页面会退回共享样式）');
  _styleCache[ch] = css;
  return css;
}
function chapterScript(ch) {
  const p = path.join(PARTS, ch, '_script.js');
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
}
function chapterFoot(ch) {
  const p = path.join(PARTS, ch, '_foot.html');
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
}


/* ============================ 装配 ============================ */
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function build(m){
  const partPath = path.join(PARTS, m.ch || 'ch2', m.id + '.html');
  if(!fs.existsSync(partPath)){
    console.error('  !! 缺少片段: ' + partPath); return false;
  }
  let body;
  const warnings = [];
  try {
    body = MATH.renderMath(fs.readFileSync(partPath, 'utf8'), warnings);
  } catch (e) {
    /* 宏语法错误（花括号不配平 / 缺少 "{"）必须指名文件和行，
       否则报错只给一个偏移量，很难定位。 */
    const raw = fs.readFileSync(partPath, 'utf8');
    const pos = /位置\s*(\d+)/.exec(e.message);
    let where = '';
    if (pos) {
      const at = +pos[1];
      const upto = raw.slice(0, at);
      const line = upto.split(/\r?\n/).length;
      const src = raw.split(/\r?\n/)[line - 1] || '';
      where = '\n     行 ' + line + '：' + src.trim().slice(0, 160);
    }
    console.error('  !! 宏语法错误 ' + path.basename(partPath) + '：' + e.message + where);
    return false;
  }
  /* 宏告警：源文件笔误（多余右花括号）与未知反斜杠命令 —— 必须指名文件+行号 */
  if (warnings.length) {
    const raw = fs.readFileSync(partPath, 'utf8');
    const rlines = raw.split(/\r?\n/);
    warnings.forEach(function (w) {
      const line = raw.slice(0, w.index).split(/\r?\n/).length;
      const src = (rlines[line - 1] || '').trim().slice(0, 150);
      const what = w.type === 'extra-brace'
        ? '源文件多写了一个右花括号 }（已自动消费，页面不会显示，但仍须回源文件修掉）'
        : '未知反斜杠命令 \\' + w.cmd + '（会原样显示到页面上）';
      console.warn('  !! 宏告警 ' + path.basename(partPath) + ' 行 ' + line + '：' + what);
      console.warn('       ' + src);
    });
  }
  /* meta 条目与 toc 条目按**原始 HTML** 写入（旧页 meta-row 里带内联 SVG 图标） */
  const meta = (m.meta || []).join('');
  const toc = (m.toc || []).map(function (t) {
    return '<a href="' + esc(t.href || ('#' + t.id)) + '">' +
      '<span class="toc-n">' + esc(String(t.n)) + '</span>' +
      '<span><b>' + esc(t.t) + '</b>' + (t.s ? '<small>' + esc(t.s) + '</small>' : '') + '</span></a>';
  }).join('');
  const chScript = chapterScript(m.ch || 'ch2');
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(m.title)}</title>
<meta name="theme-color" content="#12233f">
<meta name="description" content="${esc(m.h1 + (m.h1em || ''))} · 通信原理可视化讲解">
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="icon-192.png">
<style>${CSS + chapterCSS(m.ch || 'ch2') + MOBILE_CSS}</style>
${chScript ? '<script>' + chScript + '</script>' : ''}
</head>
<body>
<div class="wrap">

<div class="hero">
  <div class="eyebrow">${esc(m.kicker)}</div>
  <h1>${esc(m.h1)}${m.h1em ? '<em>' + esc(m.h1em) + '</em>' : ''}</h1>
  <p class="lede">${m.sub}</p>
  <div class="meta-row">${meta}</div>
  ${toc ? '<nav class="toc">' + toc + '</nav>' : ''}
</div>

<script>${LIB}</script>
<script>${MOBILE_JS}</script>

${body}
${chapterFoot(m.ch || 'ch2')}
</div>
</body>
</html>
`;
  const out = path.join(OUT, m.file);
  fs.writeFileSync(out, html, 'utf8');
  console.log('  OK  ' + m.file + '   (' + (html.length/1024).toFixed(1) + ' KB)');
  return true;
}

const manifest = JSON.parse(fs.readFileSync(path.join(TMP, 'manifest.json'), 'utf8'));
/* 命令行可按章过滤：node build.js ch4 ch5 */
const CH = process.argv.slice(2).filter(function (a) { return /^ch\d+$/.test(a); });
/* 命令行可按片段 id 过滤：node build.js ch2 id=s2_4
 * ⚠ 用途：并行迁移时，多个 worker 各改各的 parts 片段，若都跑整章构建会互相覆盖产物页。
 *    单页过滤让每个 worker 只重建自己那一页。 */
const ONLY = process.argv.slice(2).filter(function (a) { return /^id=/.test(a); })
  .map(function (a) { return a.slice(3); });
let list = CH.length ? manifest.filter(function (m) { return CH.indexOf(m.ch || 'ch2') >= 0; }) : manifest;
if (ONLY.length) {
  list = list.filter(function (m) { return ONLY.indexOf(m.id) >= 0; });
  if (!list.length) { console.error('没有匹配的片段 id：' + ONLY.join(',')); process.exit(3); }
}
console.log('构建 ' + list.length + ' 个页面 → ' + OUT);
let ok = 0;
for(const m of list){ if(build(m)) ok++; }
console.log('完成：' + ok + '/' + list.length);

/* ======================= PWA 三件套 + 学习入口页 ======================= */
/* 手机端：把页面装到主屏（PWA）、离线可看、入口一页罗列全部分节页。 */
function writePWA() {
  ICONS.makeIcons(OUT);
  fs.copyFileSync(path.join(TMP, 'sw.js'), path.join(OUT, 'sw.js'));
  const mf = {
    name: '通信原理 · 可视化讲解',
    short_name: '通信原理',
    description: '《通信原理》第 7 版（樊昌信）可视化讲解',
    start_url: './00_学习入口.html',
    scope: './',
    display: 'standalone',
    orientation: 'any',
    background_color: '#fbfbf9',
    theme_color: '#12233f',
    icons: [
      { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
    ]
  };
  fs.writeFileSync(path.join(OUT, 'manifest.webmanifest'), JSON.stringify(mf, null, 2), 'utf8');
}

function writeHub(all) {
  const byCh = {};
  all.forEach(function (m) {
    const ch = m.ch || 'ch?';
    (byCh[ch] = byCh[ch] || []).push(m);
  });
  const groups = Object.keys(byCh).sort().map(function (ch) {
    const label = (byCh[ch][0].kicker || ch).replace(/^通信原理\s*·\s*/, '');
    const items = byCh[ch].map(function (m) {
      const t = String(m.title || '').replace(/^原理讲解\s*·\s*/, '');
      return '<a class="item" href="' + esc(m.file) + '">' +
        '<span class="t">' + esc(t) + '</span>' +
        '<span class="s">' + esc((m.h1 || '') + (m.h1em || '')) + '</span></a>';
    }).join('');
    return '<section class="ch"><h2>' + esc(label) + '</h2>' + items + '</section>';
  }).join('');

  /* 旧章节整页（拆节迁移前的成品）：工程根下的 第N章-*.html */
  const legacy = fs.readdirSync(ROOT).filter(f => /^第\d+章-.*\.html$/.test(f)).sort();
  const legacyHtml = legacy.length
    ? '<section class="ch"><h2>章节整页（分节迁移前）</h2>' + legacy.map(function (f) {
        return '<a class="item" href="' + esc(f) + '"><span class="t">' +
          esc(f.replace(/\.html$/, '')) + '</span><span class="s">整章讲义（旧形态，待拆节）</span></a>';
      }).join('') + '</section>'
    : '';

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>通信原理 · 可视化讲解（学习入口）</title>
<meta name="theme-color" content="#12233f">
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="icon-192.png">
<style>
:root{--ink:#1a1a1a;--mut:#6b6b6b;--blue:#1a46b5;--bg:#fbfbf9;--card:#fff;--bd:#d8d8d2}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);
  font-family:"Microsoft YaHei","PingFang SC","Noto Sans CJK SC",sans-serif;line-height:1.7}
.wrap{max-width:820px;margin:0 auto;padding:0 18px 60px}
header{background:linear-gradient(135deg,#12233f,#2a4a7d);color:#fff;padding:36px 0 28px;margin-bottom:24px}
header .wrap{padding-bottom:0}
.kicker{font-size:12px;letter-spacing:.2em;opacity:.72;margin:0 0 8px}
h1{font-size:26px;margin:0 0 8px}
header p{margin:0;opacity:.85;font-size:14.5px}
.ch{margin:26px 0}
.ch h2{font-size:17px;margin:0 0 10px;padding-bottom:7px;border-bottom:2px solid var(--ink)}
.item{display:flex;flex-direction:column;gap:2px;background:var(--card);border:1px solid var(--bd);
  border-radius:10px;padding:13px 15px;margin-bottom:9px;text-decoration:none;color:inherit}
.item:hover{border-color:var(--blue)}
.item .t{font-weight:700;font-size:15.5px;color:var(--blue)}
.item .s{font-size:13px;color:var(--mut)}
.tip{background:#fff;border:1px dashed var(--bd);border-radius:10px;padding:12px 15px;
  color:var(--mut);font-size:13px;margin:18px 0}
footer{margin-top:34px;padding-top:16px;border-top:1px solid var(--bd);color:var(--mut);font-size:12.5px}
</style>
</head>
<body>
<header><div class="wrap">
  <p class="kicker">通信原理 · COMMUNICATION PRINCIPLES</p>
  <h1>可视化讲解 · 学习入口</h1>
  <p>《通信原理》第 7 版（樊昌信 / 曹丽娜）分节讲义。手机上可「添加到主屏幕」，装后离线也能翻。</p>
</div></header>
<div class="wrap">
${groups}
${legacyHtml}
<div class="tip">提示：宽图在窄屏上可左右滑动查看，点图还能全屏放大（双指缩放）。</div>
<footer>通信原理 · 可视化讲解 · 共 ${all.length} 节</footer>
</div>
</body>
</html>
`;
  fs.writeFileSync(path.join(OUT, '00_学习入口.html'), html, 'utf8');
  console.log('  OK  PWA 三件套（manifest / sw / 图标）+ 00_学习入口.html');
}

try {
  writePWA();
  writeHub(manifest);
} catch (e) {
  console.error('  !! PWA/入口页生成失败：' + e.message);
}
