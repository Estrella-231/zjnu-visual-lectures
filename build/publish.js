/* ============================================================================
   公网发布目录组装（build/publish.js）—— 多课程
   ----------------------------------------------------------------------------
   把各课程已完成的可视化页面平铺成 site/，作为**可公开部署**的站点根：

     site/
       index.html              课程门户（多课程卡片）
       manifest.webmanifest    PWA 清单
       sw.js                   离线缓存
       icon-192.png icon-512.png
       tongxin-yuanli/         通信原理：分节页 + 旧章节整页
       tongxin-dianlu/         通信电路：原理讲解 + 工具页 + 专题目录

   ⚖ 版权与完整性口径（两道硬断言）：
     ① 站点目录里**不得出现任何 PDF**（教材/课件扫描件不上网）；
     ② 发布后的每个页面，其**本地资源引用必须都能在站点里找到**——
        教材正文页图（build/pages/hi-p-*.png）、答案册页图
        （build/answer_guide/pages/ans-*.png）、由教材图派生的图
        （build/examples/book-p*.png）都指向工程目录，上线即 404，
        属于受版权保护的扫描件 → **这类页面整页不上网**。

   判定用的是「引用目标在站点里是否存在」，而不是关键词黑名单 ——
   黑名单会漏（book-p66.png 就藏在 build/examples/ 里），也会误伤
   （随页面一起发布的 icon-192.png）。

   策略开关：
     'exclude'（默认）—— 引用了工程目录资源的页面整页不上网
     'strip'           —— 页面上网，但把那些引用换成占位说明
     'all'             —— 连扫描页图一起上网（需显式加 --include-textbook-images）

   用法：node build/publish.js [--include-textbook-images]
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const COURSES_ROOT = path.resolve(ROOT, '..');
const SITE = path.join(ROOT, 'site');

/* 随每个课程目录一起发布的小资源（页面里的 <link rel=apple-touch-icon> 会引用它们） */
const SHIPPED = ['icon-192.png', 'icon-512.png'];

const POLICY = process.argv.includes('--include-textbook-images') ? 'all' : 'exclude';

function readJSON(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* --------------------------------------------------------- 本地资源引用抽取 */
/* 覆盖三种写法：src= / href= / CSS 的 url(...) */
function localRefs(html) {
  const out = [];
  let m;
  const re1 = /(?:src|href)\s*=\s*["'](?!https?:|\/\/|#|data:|mailto:)([^"']+)["']/gi;
  while ((m = re1.exec(html))) {
    const v = m[1];
    if (/\.(png|jpe?g|svg|gif|webp|css|js|woff2?|mp4|webm)$/i.test(v)) out.push(v);
  }
  const re2 = /url\(\s*["']?([^"')]+)["']?\s*\)/gi;
  while ((m = re2.exec(html))) {
    const v = m[1];
    if (/^(https?:|data:|\/\/|#)/i.test(v)) continue;
    out.push(v);
  }
  return out;
}
function isShipped(ref) { return SHIPPED.indexOf(path.basename(ref)) >= 0; }

/* 验收用的「全量本地引用」抽取：**不限扩展名**。
   ⚠ localRefs() 只收图片/css/js/字体/媒体类扩展名，用来判断「页面是否引用了
   工程目录资源」；但 .html / .pdf / .md / .webmanifest 这类引用它收不到，
   于是线上会出现「PDF 404 / .md 死链 / manifest 404」而验收照样全绿。
   验收断言必须用这一份全量清单。 */
function allLocalRefs(html) {
  const out = [];
  let m;
  const re1 = /(?:src|href)\s*=\s*["'](?!https?:|\/\/|#|data:|mailto:)([^"']+)["']/gi;
  while ((m = re1.exec(html))) out.push(m[1]);
  const re2 = /url\(\s*["']?([^"')]+)["']?\s*\)/gi;
  while ((m = re2.exec(html))) {
    const v = m[1];
    if (/^(https?:|data:|\/\/|#)/i.test(v)) continue;
    out.push(v);
  }
  return out;
}

/* --------------------------------------------------------- 页面处理工具 */
function stripGoogleFonts(html) {
  /* 发布副本去掉 Google Fonts 外链 → 全站零外链、离线可用 */
  return html.replace(/<link[^>]+fonts\.googleapis\.com[^>]*>\s*/gi, '')
    .replace(/<link[^>]+fonts\.gstatic\.com[^>]*>\s*/gi, '');
}
function stripLocalRefs(html, note) {
  /* 把引用工程目录资源的标签换成占位说明 */
  const txt = note || '〔教材原图：本地版可看，公网版不提供教材扫描页图〕';
  return html.replace(/<(img|a)\b([^>]*?)(?:src|href)\s*=\s*["']([^"']+)["']([^>]*)>/gi,
    function (m, tag, a1, ref, a2) {
      if (isShipped(ref)) return m;
      if (!/\.(png|jpe?g|svg|gif|webp)$/i.test(ref)) return m;
      return '<span class="img-ph" style="display:block;padding:14px 16px;border:1px dashed #c9c9c0;' +
        'border-radius:8px;background:#f6f6f3;color:#6b6b6b;font-size:13.5px;text-align:center">' +
        txt + '</span>';
    });
}
/* 把指向「本课程未上网页面」的链接降级成纯文字（否则线上出现死链 404） */
function pruneMissingLinks(html, published) {
  return html.replace(/<a\b([^>]*?)href\s*=\s*["']([^"']+\.html)["']([^>]*)>([\s\S]*?)<\/a>/gi,
    function (m, a1, href, a2, inner) {
      const name = path.basename(href.split('#')[0]);
      if (published.has(name)) return m;
      return '<span class="offline-only" title="该页引用教材扫描页图，仅本地版提供">' +
        inner.replace(/<[^>]+>/g, '') + '（本地版）</span>';
    });
}
/* 上级目录的相对链接（../X.html）→ 发布目录是平铺的，改成同目录 */
function rewriteParentLinks(html, published) {
  return html.replace(/href\s*=\s*["'](\.\.\/)+([^"'#?]+\.html)(#[^"']*)?["']/gi,
    function (m, up, name, hash) {
      const base = path.basename(name);
      return 'href="' + (published.has(base) ? base : name) + (hash || '') + '"';
    });
}
/* 指向 PDF 的链接 → 论文 PDF 不上线，降级成纯文字说明 */
function prunePdfLinks(html, note) {
  return html.replace(/<a\b([^>]*?)href\s*=\s*["']([^"']+\.pdf)["']([^>]*)>([\s\S]*?)<\/a>/gi,
    function (m, a1, href, a2, inner) {
      return '<span class="offline-only" title="' + (note || '仅本地版提供') + '">' +
        inner.replace(/<[^>]+>/g, '') + '（PDF 仅本地版）</span>';
    });
}
/* 指向工程内部 .md 文档的链接（制作总目录 / 可视化讲解总览）→ 降级成纯文字。
   这些文档只在工程仓库里，公网没有对应文件，留着就是死链。 */
function pruneDocLinks(html, note) {
  return html.replace(/<a\b([^>]*?)href\s*=\s*["']([^"']+\.md(?:#[^"']*)?)["']([^>]*)>([\s\S]*?)<\/a>/gi,
    function (m, a1, href, a2, inner) {
      return '<span class="offline-only" title="' + (note || '仅本地版提供') + '">' +
        inner.replace(/<[^>]+>/g, '') + '（工程文档仅本地版）</span>';
    });
}
/* 子目录页面的根路径资源要加一级 ../：
     manifest.webmanifest → ../manifest.webmanifest
     serviceWorker.register('sw.js') → register('../sw.js')
   站点根目录才有这两个文件；不改会在子目录下解析成 <子目录>/sw.js → 404，
   且 serviceWorker.register 的失败会变成未捕获 Promise 拒绝（控制台报错）。 */
function fixupSubdirPaths(html) {
  return html
    .replace(/(href\s*=\s*["'])manifest\.webmanifest(["'])/gi,
      function (m, a, b) { return a + '../manifest.webmanifest' + b; })
    .replace(/serviceWorker\.register\(\s*(["'])sw\.js\1\s*\)/gi,
      function (m, q) { return 'serviceWorker.register(' + q + '../sw.js' + q + ')'; });
}

/* --------------------------------------------------------- 发布期窄屏加固 */
/* 通信原理分节页由 build.js 内联了 build/mobile.css + mobile.js
   （宽表格在**运行时**被包进 .tbl-wrap）→ 不重复处理。
   其余页面（通信电路 64 页、论文精读 21 页、通信原理旧整页 4 页）是**别的工程**
   的产物，没有这套处理 → 宽表格会把整页顶出横向滚动条：
   390px 实测 31 页 scrollW 超出，最宽的论文页达到 1142px（表格 1124px 宽）。
   这里在**发布副本**上统一加固：表格包进 .pub-tw 横滑容器 + 注入自适应 CSS。
   源工程一律不动。 */
function hardenMobile(html) {
  if (html.indexOf('figwrap') >= 0) return html;   /* 已内建移动适配 */
  /* ① 宽表格 → 横滑容器 */
  html = html.replace(/<table\b([^>]*)>([\s\S]*?)<\/table>/gi,
    function (m, attrs, inner) {
      return '<div class="pub-tw"><table' + attrs + '>' + inner + '</table></div>';
    });
  /* ② 注入自适应 CSS（发布期自有 + 共享的 build/mobile.css） */
  let mobCss = '';
  try { mobCss = fs.readFileSync(path.join(ROOT, 'build', 'mobile.css'), 'utf8'); } catch (e) { }
  const css = '<style id="pub-mobile">'
    + '.pub-tw{overflow-x:auto;-webkit-overflow-scrolling:touch;max-width:100%;min-width:0;margin:14px 0}'
    + '.pub-tw table{width:auto;max-width:none}'
    + '.pub-tw::-webkit-scrollbar{height:8px}'
    + '.pub-tw::-webkit-scrollbar-thumb{background:#c9c9c0;border-radius:4px}'
    + '@media (max-width:760px){.pub-tw>table{width:max-content;min-width:100%}}'
    + 'img{max-width:100%;height:auto}'
    /* canvas 用 width/height 属性定死像素尺寸，窄屏上不肯收缩 → 撑破整页 */
    + 'canvas{max-width:100%;height:auto}'
    + 'pre{overflow-x:auto;max-width:100%}'
    /* ⚠ overflow-wrap 是**继承属性** → 在 body 上设一次，全文生效：
       行内的长不可断词（snake_case 标识符、URL、模型名）在窄屏上顶破整页。
       实测某论文页 <b>forecast_observation_irradiance_gap</b> 宽 315px、
       右边缘 357px > 视口 345px → 页面 scrollW 多出 24px。
       anywhere 只在「这个词自己都放不下」时才断行，正常排版不受影响；
       同时它会把 min-content 贡献降到最小字符宽 → 顺带压住 grid 项撑破。 */
    + 'body{overflow-wrap:anywhere;}'
    /* 行内 <code> 是不换行的 inline 盒子：整段代码比视口宽时会顶破整页
       （实测某论文页 <code> 宽 375px、右边缘 393px，页面 scrollW 多出 18px）。
       overflow-wrap:anywhere 让它在行内断行。 */
    + 'code{overflow-wrap:anywhere;word-break:break-word}'
    + '</style>'
    + '<style id="pub-mobile-css">' + mobCss + '</style>';
  html = /<\/head>/i.test(html) ? html.replace(/<\/head>/i, css + '</head>') : (css + html);
  /* ③ 注入共享运行时（build/mobile.js）：宽图按 1:1 渲染 + 横滑 + 灯箱 + SW 注册。
     旧章节整页与通信电路页是**别的工程**的产物，没有这套处理 →
     宽图在手机上被等比缩放，图内标注只剩 3~5px，完全看不清。 */
  let mobJs = '';
  try { mobJs = fs.readFileSync(path.join(ROOT, 'build', 'mobile.js'), 'utf8'); } catch (e) { }
  if (mobJs) {
    const js = '<script id="pub-mobile-js">' + mobJs + '</script>';
    html = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, js + '</body>') : (html + js);
  }
  return html;
}

/* --------------------------------------------------------- 收集课程与页面 */
const registry = readJSON(path.join(COURSES_ROOT, 'courses.json'));
const courses = registry.courses.filter(c => c.id !== 'shuzi-xinhao');   /* 数字信号尚无讲义 */

/* 站点的第三个分类：论文精读系列（源在 E 盘，独立工程，不在 courses.json 里） */
const PAPER_ROOT = 'E:/Fuzhaodu/论文讲解';
const PAPER_DIRS = [path.join(PAPER_ROOT, 'zotero_explainers'), PAPER_ROOT];
const PAPERS = {
  id: 'lunwen',
  title: '论文精读系列',
  subtitle: '辐照度 / 太阳能预报 · 19 篇核心论文中文精读',
  accent: '#0f7a8a',
  tags: ['论文精读', '光伏预测', 'RNN / Transformer'],
  status: '已上线',
  summary: '按「信息源与技术路线」组织的论文精读：每篇一份深度中文解读（方法拆解、公式推导、实验复盘与可借鉴点），配套论文原文出处。',
  policy: 'strip',
  note: '〔论文原页截图：本地版可见；公网版不提供论文 PDF 与原页渲染〕',
  /* 门户「论文精读」区右侧的四条技术路线（与源总目录的分组一致） */
  groups: [
    { k: '卫星外推 / 网格场', v: 'SolarSeer · NatComm 云覆盖 · Baguan-solar' },
    { k: '站点 / 传感器融合', v: 'SolarCrossFormer · Meteo+SkyImages · StepAdaptive' },
    { k: '光伏功率与系统侧', v: 'SolarBoost · SolarTformer · CEEMDAN · AQ-RNN · 集合后处理 · CAPE · Solar-VLM' },
    { k: '方法学与物理先验', v: 'NICEk 指标 · Barrier MOO · PISSM · PhysicsGuided' }
  ]
};

/* 论文许可元数据（build/paper_license_meta.json，由 build/build_paper_license_meta.js 生成，
   数据源为 arXiv / Nature 官方页面）。缺表 → 论文原页图**不上网**（保守回退）。 */
const LICENSE_META_FILE = path.join(__dirname, 'paper_license_meta.json');
let LICENSE_META = {};
let licenseMetaOK = false;
try {
  LICENSE_META = readJSON(LICENSE_META_FILE);
  licenseMetaOK = Object.keys(LICENSE_META).length > 0;
} catch (e) {
  console.error('  ⚠ 读不到论文许可元数据 ' + LICENSE_META_FILE + ' → 原页图不上网');
}
if (!licenseMetaOK) LICENSE_META = {};
let paperImageBytes = 0;

function groupOf(name) {  if (name.startsWith('原理讲解_')) return '原理讲解';
  if (name.startsWith('例题解法_')) return '例题解法';
  if (name.startsWith('习题解法_')) return '习题解法';
  if (name.startsWith('工具演示')) return '工具';
  if (/^第\d+章-/.test(name)) return '章节整页';
  if (name === '00_学习入口.html') return '';
  return '其他';
}

const coursePages = {};
courses.forEach(function (c) {
  const srcDir = path.join(COURSES_ROOT, c.dir);
  const list = [];
  if (fs.existsSync(path.join(srcDir, 'viz'))) {
    fs.readdirSync(path.join(srcDir, 'viz')).filter(f => f.endsWith('.html')).forEach(function (f) {
      if (f === 'index.html') return;                 /* 课程目录页（链 PDF）不上网 */
      list.push({ file: f, from: path.join(srcDir, 'viz') });
    });
  }
  /* 通信原理：根目录的旧章节整页（拆节迁移前的成品） */
  if (c.id === 'tongxin-yuanli') {
    fs.readdirSync(srcDir).filter(f => /^第\d+章-.*\.html$/.test(f)).forEach(function (f) {
      list.push({ file: f, from: srcDir });
    });
  }
  coursePages[c.id] = list;
});

/* --------------------------------------------------------- 生成站点目录 */
/* site/ 是本脚本**自己拥有**的产物目录：重建前先清空，
   否则上一轮残留会混进线上（构建脚本的常规 clean 步骤）。
   ⚠ 这里用 unlinkSync + rmdirSync 逐个删，**不用 fs.rmSync**：
   实测本机（Windows + 中文路径）fs.rmSync(dir,{recursive:true}) 会
   静默返回成功却什么都没删 —— 残留的旧页面会混进线上。 */
function cleanDir(dir) {
  if (!fs.existsSync(dir)) return 0;
  let n = 0;
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (e) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      n += cleanDir(p);
      try { fs.rmdirSync(p); } catch (err) { }
    } else {
      try { fs.unlinkSync(p); n++; } catch (err) { }
    }
  });
  return n;
}
const cleaned = cleanDir(SITE);
if (cleaned) console.log('  （已清空上一轮产物目录 site/：' + cleaned + ' 个文件）');
fs.mkdirSync(SITE, { recursive: true });

/* 图标要先于课程目录生成 —— 课程页里的 <link rel="apple-touch-icon">
   指向的是同目录的 icon-192.png，生成晚一步就会变成线上 404。 */
require(path.join(ROOT, 'build', 'make_icons.js')).makeIcons(SITE);

const copied = [];      /* {course, file, bytes} */
const skipped = [];     /* 因引用工程目录资源而未上网的页面 */
const stripped = [];

courses.forEach(function (c) {
  const outDir = path.join(SITE, c.id);
  fs.mkdirSync(outDir, { recursive: true });
  const kept = [], pending = [];

  coursePages[c.id].forEach(function (item) {
    const src = path.join(item.from, item.file);
    let html = fs.readFileSync(src, 'utf8');
    const bad = localRefs(html).filter(r => !isShipped(r));

    if (bad.length) {
      if (POLICY === 'exclude') { skipped.push({ course: c.id, file: item.file, why: bad[0] }); return; }
      if (POLICY === 'strip') { html = stripLocalRefs(html); stripped.push({ course: c.id, file: item.file }); }
    }
    html = stripGoogleFonts(html);
    html = prunePdfLinks(html, '教材与答案册扫描件属受版权保护的材料，仅本地版提供');
    html = pruneDocLinks(html, '工程内部文档，仅本地版提供');
    html = hardenMobile(html);
    html = fixupSubdirPaths(html);       /* ⚠ 必须在 hardenMobile 之后：
                                          注入的 mobile.js 里也有 register('sw.js') */
    pending.push({ file: item.file, html: html });
    kept.push(item.file);
  });

  /* 先算出本课程实际会发布的页面集合，再统一剪死链 */
  const published = new Set(kept);
  pending.forEach(function (p) {
    const out = pruneMissingLinks(p.html, published);
    fs.writeFileSync(path.join(outDir, p.file), out, 'utf8');
    copied.push({ course: c.id, file: p.file, bytes: Buffer.byteLength(out) });
  });

  /* 课程入口页：优先用课程自带的 00_学习入口.html */
  const entrySrc = path.join(COURSES_ROOT, c.dir, 'viz', '00_学习入口.html');
  let entry = fs.existsSync(entrySrc) ? fs.readFileSync(entrySrc, 'utf8')
    : '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>' + esc(c.title) +
    ' · 学习入口</title><body><p>' + esc(kept.join('、')) + '</p></body></html>';
  entry = stripGoogleFonts(entry);
  entry = prunePdfLinks(entry, '教材与答案册扫描件属受版权保护的材料，仅本地版提供');
  entry = pruneDocLinks(entry, '工程内部文档，仅本地版提供');
  entry = hardenMobile(entry);
  entry = fixupSubdirPaths(entry);
  entry = pruneMissingLinks(entry, published);
  fs.writeFileSync(path.join(outDir, '00_学习入口.html'), entry, 'utf8');
  fs.writeFileSync(path.join(outDir, 'index.html'), entry, 'utf8');

  /* 小资源随课程目录一起发布（页面里的 icon 引用才能解析） */
  SHIPPED.forEach(function (f) {
    const src = path.join(SITE, f);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(outDir, f));
  });
});

/* --------------------------------------------- 第三个分类：论文精读系列 */
let paperItems = 0;
if (fs.existsSync(PAPER_ROOT)) {
  const outDir = path.join(SITE, PAPERS.id);
  fs.mkdirSync(outDir, { recursive: true });

  /* ⚠ 源目录布局在 2026-11-01 变过一次：
   旧： zotero_explainers/<NN_名称>_讲解.html（平铺） + 上级目录 2 篇
   新： papers/<NN_名称>/讲解.html（每篇一个文件夹，内含 pages/ 原页图 + paper.pdf）
   两种都支持：优先用新的 papers/ 布局，否则退回旧布局。
   发布目录里一律**平铺**成 <NN_名称>_讲解.html（URL 更短、更好记）。 */
  const items = [];       /* {src, name} —— name 是发布后的文件名 */
  const newLayout = path.join(PAPER_ROOT, 'papers');
  if (fs.existsSync(newLayout)) {
    fs.readdirSync(newLayout).sort().forEach(function (d) {
      const dir = path.join(newLayout, d);
      if (!fs.statSync(dir).isDirectory()) return;
      fs.readdirSync(dir).filter(f => f.endsWith('.html')).forEach(function (f) {
        items.push({ src: path.join(dir, f), name: d + '_' + f });
      });
    });
  }
  if (!items.length) {
    PAPER_DIRS.forEach(function (d) {
      if (!fs.existsSync(d)) return;
      fs.readdirSync(d).filter(f => f.endsWith('.html') && f !== 'index.html')
        .forEach(function (f) { items.push({ src: path.join(d, f), name: f }); });
    });
  }
  const names = new Set(items.map(x => x.name));

  /* 源目录里的 papers/<NN_名称>/讲解.html → 发布后的 <NN_名称>_讲解.html
     两种写法都要覆盖：
       ① 总目录里指向论文的： papers/01_SolarSeer/讲解.html
       ② 论文之间互链（兄弟目录）： ../00_SolarCrossFormer/讲解.html
     只有映射结果**确实在发布集合里**才改写，否则原样保留（由最终断言兜底）。 */
  function rewritePaperLinks(html) {
    return html.replace(/href\s*=\s*["']((?:(?:\.\.\/)+)?(?:papers\/)?)([^"'#\/]+)\/([^"'#\/]+\.html)(#[^"']*)?["']/gi,
      function (m, pre, dir, file, hash) {
        const flat = dir + '_' + file;
        if (!names.has(flat)) return m;
        return 'href="' + flat + (hash || '') + '"';
      });
  }

  items.forEach(function (it) {
    let html = fs.readFileSync(it.src, 'utf8');
    html = rewritePaperLinks(html);

    /* 论文原页图：改为**随讲义公开**（19 篇许可全部允许再分发，见下方注释）。
       流程：先把 <img src="pages/x.png"> 改写并记账，再把用到的图原样复制到
       <发布名>_pages/，最后插入「图片来源与许可」标注块。 */
    const dirName = path.basename(path.dirname(it.src));   /* 如 01_SolarSeer */
    const imgFiles = [];
    if (licenseMetaOK) {
      html = rewritePaperImages(html, it.name.replace(/\.html$/i, ''), imgFiles);
    } else {
      html = stripLocalRefs(html, PAPERS.note);   /* 无许可表 → 保守降级为占位 */
    }
    if (imgFiles.length) {
      const srcPages = path.join(path.dirname(it.src), 'pages');
      const dstPages = path.join(outDir, it.name.replace(/\.html$/i, '') + '_pages');
      if (!fs.existsSync(dstPages)) fs.mkdirSync(dstPages, { recursive: true });
      imgFiles.forEach(function (f) {
        const src = path.join(srcPages, f);
        if (fs.existsSync(src)) {
          /* 原样复制（ND 类许可要求「不可修改」） */
          fs.copyFileSync(src, path.join(dstPages, f));
          paperImageBytes += fs.statSync(src).size;
        }
      });
    }
    html = insertLicenseBlock(html, LICENSE_META[dirName]);

    /* 源页写的是「见 pages/ 目录」（本地版的目录名）；发布后原页图已内嵌在同目录的
       <发布名>_pages/ 下，指向本地的说法在公网站上不成立 → 发布期统一改写。
       另有两种写法：列出文件名范围的「页面截图见 <code>pages/page_001.png … page_012.png</code>」
       与「原 PDF：<code>xxx.pdf</code>」——PDF 文件名在公网版本不存在，同样要改写。 */
    html = html.replace(/见 <code>pages\/<\/code> 目录/g, '见本页各节的原页插图');
    html = html.replace(/见 <code>pages<\/code>\s*目录/g, '见本页各节的原页插图');
    html = html.replace(/见 <code>pages\/<\/code>/g, '见本页各节的原页插图');
    html = html.replace(/页面截图见 <code>pages\/[^<]*<\/code>/g, '页面截图见本页各节的原页插图');
    html = html.replace(/原 PDF：<code>[^<]*<\/code>/g,
      (LICENSE_META[dirName] && LICENSE_META[dirName].sourceUrl)
        ? '原 PDF：<a href="' + LICENSE_META[dirName].sourceUrl + '" target="_blank" rel="noopener">arXiv 原文</a>'
        : '原 PDF：论文出版原文（本站不提供扫描件）');

    html = stripGoogleFonts(html);
    html = rewriteParentLinks(html, names);
    html = prunePdfLinks(html, PAPERS.note);
    html = pruneDocLinks(html, '工程内部文档，仅本地版提供');
    html = hardenMobile(html);
    html = fixupSubdirPaths(html);
    fs.writeFileSync(path.join(outDir, it.name), html, 'utf8');
    copied.push({ course: PAPERS.id, file: it.name, bytes: Buffer.byteLength(html) });
  });

  /* 分类入口页：自带的总目录（新布局在根目录，旧布局在 zotero_explainers/） */
  const entrySrc = fs.existsSync(path.join(PAPER_ROOT, 'index.html'))
    ? path.join(PAPER_ROOT, 'index.html')
    : path.join(PAPER_ROOT, 'zotero_explainers', 'index.html');
  let entry = fs.existsSync(entrySrc) ? fs.readFileSync(entrySrc, 'utf8') : '';
  entry = rewritePaperLinks(entry);
  entry = stripLocalRefs(entry, PAPERS.note);
  entry = stripGoogleFonts(entry);
  entry = rewriteParentLinks(entry, names);
  entry = prunePdfLinks(entry, PAPERS.note);
  entry = pruneDocLinks(entry, '工程内部文档，仅本地版提供');
  entry = hardenMobile(entry);
  entry = fixupSubdirPaths(entry);
  fs.writeFileSync(path.join(outDir, 'index.html'), entry, 'utf8');
  fs.writeFileSync(path.join(outDir, '00_学习入口.html'), entry, 'utf8');

  SHIPPED.forEach(function (f) {
    const src = path.join(SITE, f);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(outDir, f));
  });
  console.log('  论文精读系列：' + items.length + ' 篇讲解 + 1 个分类入口' +
    (items.length ? '' : '   ⚠ 未找到讲解页 —— 源目录布局可能又变了，请检查 ' + PAPER_ROOT));
  paperItems = items.length;
}

/* --------------------------------------------------------- 论文原页图：随讲义公开 */
/* 19 篇论文的许可已逐篇核对（build/paper_license_meta.json，数据源为 arXiv / Nature
   官方页面）：**全部 19 篇都属允许再分发的开放许可**（arXiv 永久非独占许可 8 篇、
   CC BY 4.0 3 篇、CC BY-NC-ND 4.0 6 篇、CC BY-NC-SA 4.0 1 篇、Nature Comm CC BY 1 篇），
   没有一篇是「保留所有权利」→ 论文原页截图**可以**公网发布。
   但 CC 系列要求**署名 + 标注许可 + 声明未作修改**，所以：
     ① 原页 PNG **原样复制**（不裁剪、不改色、不重编码）—— ND 类许可要求「不可修改」；
     ② 每篇页面插入「图片来源与许可」标注块（作者/标题/arXiv 编号/许可类型/原文链接）；
     ③ 论文 PDF **仍不上网**（那是完整出版原文，与整页截图不是一回事）。
   只复制**讲义实际引用**的图，不复制 pages/ 目录里未被引用的冗余页。 */

/* 论文讲解页里 <img src="pages/xxx.png"> → 发布目录里的相对路径。
   pages/ 目录随讲义平铺为 <发布名>_pages/，src 相应改写。 */
function rewritePaperImages(html, outName, copiedFiles) {
  return html.replace(/<img\b([^>]*?)src\s*=\s*["']pages\/([^"']+)["']([^>]*)>/gi,
    function (m, a1, file, a2) {
      copiedFiles.push(file);
      return '<img' + a1 + 'src="' + outName + '_pages/' + file + '"' + a2 + '>';
    });
}

/* 插入「图片来源与许可」标注块。放在 header 之后、首个 section 之前。 */
function insertLicenseBlock(html, meta) {
  if (!meta) return html;
  const esc = function (s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };
  const srcLink = meta.sourceUrl
    ? '<a href="' + esc(meta.sourceUrl) + '" target="_blank" rel="noopener">' + esc(meta.sourceUrl) + '</a>'
    : '';
  const licLink = meta.licenseUrl
    ? ' · <a href="' + esc(meta.licenseUrl) + '" target="_blank" rel="noopener">许可条款</a>'
    : '';

  const block =
    '<aside class="lic-note" style="margin:18px 0 6px;padding:14px 18px;border:1px solid #d8d4c8;' +
    'border-left:3px solid #0f7a8a;border-radius:8px;background:#f7f7f3;font-size:13.5px;line-height:1.75;color:#4a4843">' +
    '<b style="color:#1f1e1d">图片来源与许可</b>：本页内嵌的论文原页截图来自该论文的公开预印本版本，' +
    '<b>原样复制、未作任何修改</b>（未裁剪、未重绘、未重编码）。' +
    (meta.title ? '<br>论文标题：<i>' + esc(meta.title) + '</i>' : '') +
    (meta.authors ? '<br>作者：' + esc(meta.authors) + '' : '') +
    (meta.arxivId ? '<br>出处：arXiv:' + esc(meta.arxivId) + (meta.arxivVersion ? esc(meta.arxivVersion) : '') : '') +
    '<br>许可：<b>' + esc(meta.licenseName) + '</b>' + licLink +
    (srcLink ? '<br>原文链接：' + srcLink : '') +
    '</aside>';

  /* 插在 <header>…</header> 之后；没有 header 就插在 <body> 之后 */
  if (/<header\b[\s\S]*?<\/header>/i.test(html)) {
    return html.replace(/(<\/header>)/i, '$1\n' + block);
  }
  return html.replace(/(<body[^>]*>)/i, '$1\n' + block);
}

/* --------------------------------------------------------- 站点分区清单 */
/* 门户卡片与 SW 预缓存都要用它，必须在两者之前算出来。 */
const SECTIONS = courses.map(function (c) {
  return Object.assign({}, c, { count: copied.filter(x => x.course === c.id).length });
});
if (fs.existsSync(PAPER_ROOT)) {
  SECTIONS.push(Object.assign({}, PAPERS, {
    count: copied.filter(x => x.course === PAPERS.id).length
  }));
}

/* --------------------------------------------------------- PWA 三件套 */
const mf = {
  name: '课程讲义 · 论文精读',
  short_name: '讲义 · 精读',
  description: '通信原理 / 通信电路 可视化讲义 + 19 篇光伏预报论文中文精读',
  start_url: './index.html',
  scope: './',
  display: 'standalone',
  orientation: 'any',
  background_color: '#FAF9F5',
  theme_color: '#FAF9F5',
  icons: [
    { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
  ]
};
fs.writeFileSync(path.join(SITE, 'manifest.webmanifest'), JSON.stringify(mf, null, 2), 'utf8');

/* sw.js：缓存范围扩到整个站点根（各课程子目录都在 scope 内）
   CACHE 版本号在**站点结构变化时必须 +1** —— 否则老客户端的旧缓存不会清。 */
const sw = fs.readFileSync(path.join(ROOT, 'build', 'sw.js'), 'utf8')
  .replace(/const CACHE = '[^']*';/, "const CACHE = 'txyl-site-v4';")
  .replace(/const CORE = \[[\s\S]*?\];/,
    "const CORE = [\n  './index.html',\n  './manifest.webmanifest',\n  './icon-192.png',\n  './icon-512.png'" +
    SECTIONS.map(c => ",\n  './" + c.id + "/index.html'").join('') + "\n];")
  .replace(/caches\.match\('\.\/00_学习入口\.html'\)/, "caches.match('./index.html')");
fs.writeFileSync(path.join(SITE, 'sw.js'), sw, 'utf8');

/* --------------------------------------------------------- 门户首页
 * 视觉参考 claude.ai：暖白底 + 大号衬线标题 + 细发丝线 + 克制的陶土色点缀，
 * 不做重投影与花哨渐变；内容上**课程与论文分成两个独立区块**，不再混在一个筐里。
 */
const COURSE_CARDS = SECTIONS.filter(c => c.id !== PAPERS.id).map(function (c) {
  return '<a class="card" href="' + c.id + '/index.html">' +
    '<div class="card-top">' +
      '<h3 class="serif">' + esc(c.title) + '</h3>' +
      '<span class="arrow" aria-hidden="true">→</span>' +
    '</div>' +
    '<p class="kicker-sm">' + esc(c.subtitle || '') + '</p>' +
    '<p class="summary">' + esc(c.summary || '') + '</p>' +
    '<div class="tags">' + (c.tags || []).map(t => '<span class="tag">' + esc(t) + '</span>').join('') +
      '<span class="tag strong">' + c.count + ' 页讲义</span>' +
    '</div>' +
  '</a>';
}).join('\n');

const paperGroups = (PAPERS.groups || []).map(g =>
  '<li><span class="gk">' + esc(g.k) + '</span><span class="gv">' + esc(g.v) + '</span></li>'
).join('\n');

const portal = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>课程讲义 · 论文精读</title>
<meta name="theme-color" content="#FAF9F5">
<meta name="description" content="通信原理 / 通信电路 可视化讲义，与 19 篇光伏预报论文中文精读（可交互、可离线）">
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="icon-192.png">
<style>
:root{
  --bg:#FAF9F5; --panel:#F3F1E9; --card:#FFFFFF;
  --ink:#1F1E1D; --ink2:#4A4843; --mut:#77746C;
  --line:#E6E2D6; --line2:#D2CCBB; --accent:#C96442; --accent2:#E8A87C;
}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{
  margin:0;background:var(--bg);color:var(--ink);line-height:1.7;
  font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;
  font-size:16px;-webkit-font-smoothing:antialiased;
}
.serif{font-family:Georgia,"Songti SC","Noto Serif CJK SC","Source Han Serif SC","Times New Roman",serif}
a{color:inherit;text-decoration:none}
.wrap{max-width:1120px;margin:0 auto;padding:0 28px}

/* ---------- 顶栏 ---------- */
.top{border-bottom:1px solid var(--line)}
.top .wrap{display:flex;align-items:center;gap:28px;height:66px}
.mark{font-size:17px;letter-spacing:.01em}
.top nav{margin-left:auto;display:flex;align-items:center;gap:26px;font-size:14.5px;color:var(--ink2)}
.top nav a{padding:4px 0;border-bottom:1px solid transparent;transition:border-color .15s,color .15s}
.top nav a:hover{color:var(--ink);border-bottom-color:var(--accent)}
.top .offline{font-size:13px;color:var(--mut)}

/* ---------- Hero ---------- */
.hero{padding:84px 0 66px}
.eyebrow{font-size:12.5px;letter-spacing:.20em;text-transform:uppercase;color:var(--accent);margin:0 0 20px;font-weight:600}
h1{font-size:clamp(38px,6.2vw,64px);line-height:1.12;margin:0 0 22px;font-weight:400;letter-spacing:-.015em}
.lede{font-size:clamp(16px,2vw,19px);line-height:1.75;color:var(--ink2);max-width:760px;margin:0 0 34px}
.stats{display:flex;flex-wrap:wrap;gap:10px}
.stat{border:1px solid var(--line2);border-radius:999px;padding:7px 15px;font-size:13.5px;color:var(--ink2);background:var(--card)}
.stat b{font-weight:600;color:var(--ink)}

/* ---------- 区块 ---------- */
section{padding:26px 0 58px}
.sec-head{display:flex;align-items:baseline;gap:18px;margin:0 0 26px;padding-bottom:14px;border-bottom:1px solid var(--line)}
.sec-head h2{font-size:26px;margin:0;font-weight:400;letter-spacing:-.01em}
.sec-head .cnt{font-size:13.5px;color:var(--mut);margin-left:auto;white-space:nowrap}
.sec-note{font-size:14.5px;color:var(--mut);margin:-14px 0 26px}

/* ---------- 课程卡 ---------- */
/* ⚠ minmax(320px,1fr) 在窄屏下轨道最小宽被硬撑到 320px → 360px 视口溢出 3px。
   用 min(320px,100%) 让轨道在容器窄时收缩到容器宽。 */
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(320px,100%),1fr));gap:20px}
.card{
  display:block;background:var(--card);border:1px solid var(--line);border-radius:14px;
  padding:28px 30px 26px;transition:border-color .18s,box-shadow .18s,transform .18s;
}
.card:hover{border-color:var(--line2);box-shadow:0 10px 30px rgba(31,30,29,.07);transform:translateY(-2px)}
.card-top{display:flex;align-items:flex-start;gap:14px}
.card h3{font-size:23px;margin:0;font-weight:400;line-height:1.3;flex:1}
.arrow{color:var(--accent);font-size:19px;line-height:1.4;opacity:0;transform:translateX(-4px);transition:opacity .18s,transform .18s}
.card:hover .arrow{opacity:1;transform:translateX(0)}
.kicker-sm{color:var(--mut);font-size:13.5px;margin:6px 0 12px}
.summary{font-size:15px;color:var(--ink2);margin:0 0 20px}
.tags{display:flex;flex-wrap:wrap;gap:8px}
.tag{font-size:12.5px;color:var(--mut);border:1px solid var(--line);border-radius:999px;padding:4px 11px;background:var(--bg)}
.tag.strong{color:var(--ink);border-color:var(--line2);background:var(--panel)}

/* ---------- 论文区 ---------- */
.paper{
  display:grid;grid-template-columns:1.05fr .95fr;gap:40px;align-items:start;
  background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:36px 38px;
}
.paper h3{font-size:28px;margin:0 0 10px;font-weight:400}
.paper .sub{color:var(--mut);font-size:14px;margin:0 0 16px}
.paper .summary{font-size:15.5px;margin:0 0 22px}
.paper .cta{display:inline-flex;align-items:center;gap:8px;color:var(--accent);font-size:15px;border-bottom:1px solid transparent;transition:border-color .15s}
.paper .cta:hover{border-bottom-color:var(--accent)}
.groups{list-style:none;margin:0;padding:0;border-top:1px solid var(--line)}
.groups li{padding:13px 0;border-bottom:1px solid var(--line);font-size:14px;line-height:1.6}
.gk{display:block;color:var(--ink);font-weight:600}
.gv{display:block;color:var(--mut);font-size:13.5px}

/* ---------- 说明条 ---------- */
.note{
  border:1px solid var(--line);border-left:3px solid var(--accent2);border-radius:10px;
  padding:18px 22px;color:var(--mut);font-size:14px;background:var(--card);margin:0 0 10px;
}
.note b{color:var(--ink2);font-weight:600}
footer{border-top:1px solid var(--line);margin-top:46px;padding:26px 0 60px;color:var(--mut);font-size:13.5px}
footer .wrap{display:flex;flex-wrap:wrap;gap:10px 26px;align-items:center}
footer .grow{margin-left:auto}

@media (max-width:760px){
  .top .wrap{height:auto;padding-top:14px;padding-bottom:14px;flex-wrap:wrap;gap:12px}
  .top nav{margin-left:0;gap:18px}
  .top .offline{display:none}
  .hero{padding:52px 0 40px}
  .paper{grid-template-columns:1fr;gap:26px;padding:28px 24px}
  .card{padding:24px 22px}
  section{padding-bottom:44px}
}
</style>
</head>
<body>

<div class="top"><div class="wrap">
  <div class="mark serif"><span>课程讲义 · 论文精读</span></div>
  <nav>
    <a href="#courses">课程讲义</a>
    <a href="#papers">论文精读</a>
  </nav>
  <span class="offline">可离线阅读</span>
</div></div>

<div class="wrap">
  <div class="hero">
    <p class="eyebrow">Tutorials &amp; Paper Readings</p>
    <h1 class="serif">把公式讲清楚，<br>把论文读到底。</h1>
    <p class="lede">《通信原理》与《通信电子线路》的可交互讲义 —— 公式逐条对撞教材、图表可调可放大；
    以及 19 篇辐照度 / 太阳能预报论文的中文精读。两块内容各自独立，随时挑一边看。</p>
    <div class="stats">
      <span class="stat"><b>${COURSE_CARDS ? SECTIONS.filter(c => c.id !== PAPERS.id).reduce((n, c) => n + c.count, 0) : 0}</b> 页课程讲义</span>
      <span class="stat"><b>${paperItems}</b> 篇论文精读</span>
      <span class="stat">公式<b>对撞教材</b></span>
      <span class="stat">宽图<b> 1:1 可读</b></span>
      <span class="stat">支持<b>离线</b></span>
    </div>
  </div>
</div>

<section id="courses"><div class="wrap">
  <div class="sec-head">
    <h2 class="serif">课程讲义</h2>
    <span class="cnt">${SECTIONS.filter(c => c.id !== PAPERS.id).length} 门课 · ${SECTIONS.filter(c => c.id !== PAPERS.id).reduce((n, c) => n + c.count, 0)} 页</span>
  </div>
  <p class="sec-note">按教材章节组织，每页可交互、可缩放，公式与数值逐条与教材核对。</p>
  <div class="grid">
${COURSE_CARDS}
  </div>
</div></section>

<section id="papers"><div class="wrap">
  <div class="sec-head">
    <h2 class="serif">论文精读</h2>
    <span class="cnt">${paperItems} 篇 · 按技术路线分组</span>
  </div>
  <div class="paper">
    <div>
      <h3 class="serif">辐照度 / 太阳能预报</h3>
      <p class="sub">19 篇核心论文的中文深度精读</p>
      <p class="summary">每篇一份完整拆解：问题动机、方法设计、公式推导、实验复盘与可借鉴点，
      按「信息源与技术路线」分组，串起来就是一条完整的技术脉络。</p>
      <a class="cta" href="${PAPERS.id}/index.html">打开论文总目录 <span aria-hidden="true">→</span></a>
    </div>
    <ul class="groups">
${paperGroups}
    </ul>
  </div>
</div></section>

<div class="wrap">
  <p class="note"><b>关于材料：</b>教材、课件与论文 PDF（扫描件 / 出版原文）属受版权保护的材料，本站不提供；
  本站只有自写的讲义页面与讲解文字。论文原页截图已按各论文的开放许可（arXiv / CC BY 系列）随讲解公开，
  并在每篇页面标注出处与许可条款。窄屏上宽图可左右滑动，点图可全屏放大（双指缩放）。</p>
  <p class="note"><b>离线阅读：</b>用系统浏览器打开本站 →「添加到主屏幕」，之后断网也能翻。</p>
</div>

<footer><div class="wrap">
  <span>通信原理（第 7 版 · 樊昌信 / 曹丽娜）· 通信电子线路（第 3 版 · 陈启兴）· 辐照度 / 太阳能预报论文精读</span>
  <span class="grow">共 ${copied.length} 页讲义 · ${paperItems} 篇论文</span>
</div></footer>

<script>
/* Service Worker（network-first）：断网回落缓存 → 手机「添加到主屏幕」后可离线读。
   必须 catch 掉失败，否则注册失败会变成未捕获 Promise 拒绝（控制台报错）。 */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('./sw.js').catch(function (e) {
      console.warn('SW 注册失败：', e && e.message);
    });
  });
}
</script>
</body>
</html>
`;
fs.writeFileSync(path.join(SITE, 'index.html'), portal, 'utf8');

/* --------------------------------------------------------- 验收断言 */
let bad = false;
function walk(dir, out) {
  fs.readdirSync(dir).forEach(function (f) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p, out); else out.push(p);
  });
  return out;
}
const allFiles = walk(SITE, []);
const pdfs = allFiles.filter(f => /\.pdf$/i.test(f));
if (pdfs.length) { console.error('  !! 站点里出现 PDF，已中止'); bad = true; }

/* 关键断言：每个页面的本地资源引用都必须在站点里存在（否则线上 404）
   ⚠ 用 allLocalRefs（全量、不限扩展名），不能用 localRefs ——
     后者只收图片/css/js，收不到 .html/.pdf/.md/.webmanifest，
     「PDF 404 / .md 死链 / manifest 404」会整类漏检。 */
const missing = [];
allFiles.filter(f => f.endsWith('.html')).forEach(function (f) {
  const s = fs.readFileSync(f, 'utf8');
  allLocalRefs(s).forEach(function (ref) {
    const target = path.resolve(path.dirname(f), ref.split('#')[0].split('?')[0]);
    if (!fs.existsSync(target)) missing.push(path.relative(SITE, f) + ' → ' + ref);
  });
  /* 外链断言分层：禁的是外部**资源**加载；<a href> 到论文出处/许可条款是
     CC BY / arXiv 许可的**署名义务**，必须能上网（白名单域名 + target/rel）。 */
  const LINK_OK = /^(?:https?:\/\/)?(?:www\.)?(?:arxiv\.org|doi\.org|nature\.com|creativecommons\.org|github\.com|ieeexplore\.ieee\.org)\//i;
  const noResourceExt = s.replace(/<a\b([^>]*?)href\s*=\s*["']((?:https?:)?\/\/[^"']+)["']([^>]*)>/gi,
    function (m, a1, url, a2) {
      if (LINK_OK.test(url) && /target\s*=\s*["']_blank/i.test(a2) && /rel\s*=\s*["'][^"']*noopener/i.test(a2)) return ' ';
      return m;   /* 不合规的链接保留原样 → 下面的资源外链断言会抓住它 */
    });
  if (/(?:src|href)\s*=\s*["']https?:\/\//i.test(noResourceExt)) missing.push(path.relative(SITE, f) + ' → 含外链资源');
  /* PDF 不上线 → 页面里不该还留着指向 .pdf 的链接（必须已降级成纯文字） */
  if (/(?:src|href)\s*=\s*["'][^"']+\.pdf["']/i.test(s)) missing.push(path.relative(SITE, f) + ' → 仍指向 PDF');
});
if (missing.length) {
  console.error('  !! 发布页面存在解析不到的引用，已中止：');
  missing.slice(0, 12).forEach(x => console.error('     ' + x));
  bad = true;
}

/* 论文分类空目录 = 源目录布局又变了（实测 2026-11-01 发生过一次：
   zotero_explainers/ → papers/<NN_名称>/）→ 静默发一个空分区比报错更糟，中止。 */
if (fs.existsSync(PAPER_ROOT) && paperItems === 0) {
  console.error('  !! 论文精读系列一篇讲解都没找到（源目录布局可能又变了）→ 已中止');
  bad = true;
}

/* --------------------------------------------------------- 报告 */
console.log('发布目录 → ' + SITE);
console.log('  策略 POLICY = ' + POLICY);
courses.forEach(function (c) {
  const n = copied.filter(x => x.course === c.id).length;
  const kb = copied.filter(x => x.course === c.id).reduce((a, x) => a + x.bytes, 0) / 1024;
  console.log('  ' + c.id.padEnd(16) + ' ' + String(n).padStart(3) + ' 页  ' + kb.toFixed(1) + ' KB');
});
if (skipped.length) {
  console.log('  引用了工程目录资源（教材/答案册扫描页图）→ **未上网**（' + skipped.length + ' 页）：');
  skipped.forEach(s => console.log('     - ' + s.course + '/' + s.file + '   [' + s.why + ']'));
}
if (stripped.length) {
  console.log('  已剥掉扫描页图、页面上网（' + stripped.length + ' 页）：');
  stripped.forEach(s => console.log('     - ' + s.course + '/' + s.file));
}
if (paperImageBytes) {
  console.log('  论文原页截图已随讲义公开：' + (paperImageBytes / 1024 / 1024).toFixed(1) +
    ' MB（19 篇许可均允许再分发，已逐篇标注出处与许可）');
}
const total = allFiles.reduce((n, f) => n + fs.statSync(f).size, 0);
console.log('  合计 ' + allFiles.length + ' 个文件 / ' + (total / 1024 / 1024).toFixed(2) + ' MB');
console.log(bad ? '  ✗ 验收断言未通过' : '  ✓ 无 PDF；每个页面的本地引用都能在站点里解析到；无外链');
if (bad) process.exit(2);
