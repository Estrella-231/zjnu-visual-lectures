# 通信原理课程工程说明

> 教材：《通信原理》第 7 版，樊昌信 / 曹丽娜 编著，国防工业出版社（2012）。
> 工程范式：**完全照搬《通信电子线路》（`D:\课程文档\通信电路`）的分节构建架构**
> （片段源 `build/parts/` → `build.js` 构建 → `viz/` 产物 + 五件套检查闸门）。
> 本文件是本课程所有 worker 的必读规范；进度与清单在 `制作总目录.md`。

## 0. 总体进度与阶段规划（做完一条就划掉）

| 阶段 | 内容 | 状态 |
|---|---|---|
| 阶段 0 | 工程落地：目录（`docs/` `viz/` `build/` `scratch/`）、素材归位、教材 493 页页图渲染、页码偏移复核、`AGENTS.md` + `制作总目录.md` | ✅ | 2026-10-28 完成：13 PDF 归 `docs/`；`build/pages/p-001..493.png` 全部生成（140 dpi，64.7 MB）；抽查 `p-016`=书页 001、`p-294`=书页 279，偏移 −15 复核通过；`index.html` 链接已改 |
| 阶段 1 | 工具链移植与课程化改造：`build.js` / `lib.js` / `math.js` / `check_*` / `verify_runtime` 从通信电路复制改造，空跑自证 | ✅ | 2026-10-31 完成：`build/`（build·lib·math·check_geom·check_gap·check_text·scan_svg·fracify·merge_meta）+ `scratch/`（check_all_syntax·verify_runtime·audit_product）全部就位；试点页 `viz/原理讲解_4.0_信道的定义与分类_可视化.html` 八闸门全绿（③ 几何 FAIL 0/WARN 0、④ 断头 FAIL 0、⑦ 真实 Chrome 标题 ✓ + 8 SVG + 5 条自检全过） |
| 阶段 2 | 旧 4 章（第 4/5/6/7 章，共 37 节）拆节迁移到 `build/parts/`，补页末自检，外链字体治理，重建到 `viz/` | 🔄 | 2026-10-31 起：1 / 37 节完成（第 4 章 §4.0 试点，节源 `build/parts/ch4/s4_1.html`）；余 36 节 |
| 阶段 3 | 补齐有课件章节：第 1 章绪论 → 第 3 章随机过程 → 第 10 章信源编码 | ⬜ |
| 阶段 4 | 例题解法 / 习题解法页（另开一轮，原理页全部完成后启动） | ⬜ |

- **本阶段交付标准见第 5 节；每轮固定验收闸门见第 6 节。**
- 尚未开始的阶段对应的命令/文件**不可用**（如阶段 1 完成前没有 `build/`），
  worker 开工前先看本文件的状态表，不要假定工具已存在。

## 1. 素材与页码映射（三套页码，别混）

| 素材 | 说明 |
|---|---|
| 教材 `docs/樊昌信_ 曹丽娜 - 通信原理-国防工业出版社 (2012).pdf` | **493 页扫描版、无文本层** —— 公式/图号/数值必须看渲染页图肉眼核对 |
| 课件 `docs/*PPT*.pdf`（第 1/3/4/5/6/7/10 章） | WPS 导出、**有文本层**，可 `pdftotext` |
| 教材页图 | `build/pages/p-<PDF页>.png`（阶段 0 渲染；**书页 = PDF 页 − 15**，例：正文 222 = PDF 237） |

- **换章时不要沿用 −15 偏移**：先渲染该章目录/首页确认（阶段 0 已统一复核的除外）。
- 课件与教材口径冲突时**以教材为准**，并在正文注明"课件写法"。
- `pdftotext` 读中文路径会失败：**先复制到纯 ASCII 临时路径**再抽取
  （临时目录建在工作区内，用完删；`rm` 必须 `-- "路径"` 独占一条命令）。
- `pdftotext` 会丢 `√`：**含根号的公式一律以渲染页图为准**，不许按抽取文本抄。

## 2. 多章构建约定（阶段 1 起生效）

- 构建器：`build/`（多章通用，从通信电路移植）。
  - 片段源：`build/parts/<章>/s<章>_<节>.html`（**唯一可编辑源**）；构建 `node build.js ch4`。
  - 各章元信息写在 `build/parts/<章>/_meta.json`，由 `build/merge_meta.js --apply` 合并进
    `build/manifest.json`；**`manifest.json` 与 `build/*.js` 由父会话统一维护，worker 不要碰**。
  - 入口页（根 `index.html`、`viz/00_学习入口.html`）由父会话统一追加，只做窄范围修改，
    保留并行会话改动。
- 并行制作时：**worker 之间文件范围互不重叠**；各写各章的 `parts/chN/` 与 `digest/N.md`。
- **产物在 `viz/`，命名 `原理讲解_N.M_标题_可视化.html`**（阶段 2 起，旧的
  `第N章-…-可视化讲解.html` 整页形态退役）。
- 页面体例沿用旧 4 章的 DOM 骨架（`hero / toc / section / .eq / .widget / .callout`），
  共享 CSS 由构建器注入，片段里**不要重复写全站 CSS**。
- **移动端适配已内建**：`build/mobile.css` + `build/mobile.js` 由 `build.js` **内联**进每页 ——
  宽图自动包横滑容器并按 1:1 渲染、表格自动包 `.tbl-wrap`、点图开全屏灯箱（双指缩放）。
  **写片段时不用管窄屏**；唯一要留意：图上标了 `data-*` 热区的会被判定为交互图、
  不劫持点击（仍可用提示条上的「全屏放大」按钮进灯箱）。
- **发布**（可选轮次，由父会话执行）：`node build/publish.js` 把 `viz/` 平铺成 `site/`，
  再部署到公网。`site/` **只含讲义页面与 PWA 三件套，绝不含教材 PDF**（脚本内置断言拦截）。

## 3. 公式排版约定（阶段 1 起生效）

教材的分式、根号是**竖排**写法，页面一律照教材版式：

- 用 `build/math.js` 的宏 `\frac{分子}{分母}` 和 `\sqrt{被开方数}`，构建期渲染成堆叠分式和带横线根号。
- **不要在展示公式里手写斜杠线性分式**（`1/(2π√(LC))` 这类）；正文段落、紧凑 UI 小标签除外。
- 宏表沿用通信电路：`\frac \sqrt ^{…} _{…}`、希腊字母、`\times \pm \approx`、正体函数名
  `sin cos tan lg ln log lim`、`\sum \prod` 走**上下限**、`\int` 走**右侧限位**、
  源文件写 `\sum<sub>n=1</sub><sup>+∞</sup>` 由渲染器重排。
- **宏的花括号必须配平**，否则构建直接中断整批；多写一个 `}` 页面会原样显示 `}`，
  `math.js` 会报「文件+行号」告警。
- 把线性分式改成宏时用 `build/fracify.js`（`--apply` 才写文件），改完**必须**跑
  内容守恒校验（原子序列比对），不靠肉眼逐行看。

## 4. 页面形态速查（照抄旧 4 章体例）

```
<header class="hero">      章节号 + 标题 + 导语 + meta
<nav class="toc">          目录卡片，锚点跳转
<section id="sN">          每节一个 <section>
   .sec-head               节号徽章 + h2
   h3 + 卡片 / .eq 公式块（.lbl 标签） / .derivation 推导
   .widget                 交互图（内联 SVG 或 Canvas）+ 滑块 + .cap 说明
   .callout                结论 / 易错点 / 工程应用
<footer>                   本章小结 + 思考题 + 习题 + 下一章导航
```

- **绘图优先内联 SVG**（可缩放、可标注）；曲线密集图用共享 Canvas 库 `P.curve()`。
- **曲线配色跨章保持一致**（同体制在第 5/6/7 章已定的配色不要改）。
- 交互图下方必须有 `.cap` 说明「**当前参数下说明了什么**」，不能只画不解释。
- 滑块 `step` 必须能整除目标值，否则预设值取不到、与教材对不上。
- **可见标签必须自带点击热区的数据属性**：SVG 交互常写 `ev.target.getAttribute('data-XXX')`，
  文字在矩形之上时点文字会静默失效 —— 把 `data-XXX` 同时挂到 `<text>` 上（加 `cursor:pointer`），
  并在页末自检里加计数守卫。
- SVG 图的 viewBox **同页内尽量同宽**，跨页不强制统一；压紧 viewBox 时只调高度，
  改完跑 `check_geom` 验「越界」= 0。

## 5. 交付标准（每节页面）

1. **教材核对**：公式号、原式、图号与教材页图一致；数值与教材对齐；
   教材没有的取物理合理值并在 `.note` 声明「教学设定值」。
2. **公式排版**：展示公式用宏；不手写斜杠线性分式。
3. **图**：每图带教材图号；只由教材图能明确证明画错时才改。
4. **自检**：页末脚本**独立复算**关键公式并与教材数值对撞，逐条打印 PASS/FAIL，
   全通过时 `document.title += ' ✓'`；外加**页面读数回读**（把 `.readout` 读数读回来对撞）。
5. **构建检查全绿**：`build` / `check_geom`（FAIL 0 WARN 0）/ `check_gap`（FAIL 0）/
   `check_text` / `scan_svg` / `check_all_syntax` 0 失败。
   - 先跑 `check_all_syntax.js`：`node --check` 逐片段逐段查语法并报源文件行号
     （语法错误让整页脚本不执行，连页末自检都不跑，而几何/文本检查**不会**报这种错）。
   - 看检查器打印的「检查目标数」：**空跑/零命中不等于通过**，必须先自证检测器真扫到了目标。
6. **禁项**：不引外部资源（**无 CDN/外链图片字体**，包括 Google Fonts —— 用系统字体栈或本地字体）、
   不用 MathJax/KaTeX、禁 `Math.random()`（用共享库 `LCG`）、乘方用 `Math.pow`、
   Canvas 曲线用共享库 `P.curve()`。
7. **教材存疑并列说明**：发现教材/课件笔误、缺项时，页面并列给出**原值与复算值 + 判断依据**，
   **不擅自改教材结论**，并写进 `build/digest/<章>.md` 与 `制作总目录.md`。
8. **运行时验收**：`verify_runtime` 页面 **标题带 ✓ + 有 SVG/Canvas + 控制台无 error**
   （纯文字页判 FAIL）。浏览器截图核对版式与读数。

## 6. 每轮固定验收闸门（按序跑）

```powershell
cd D:\课程文档\通信原理          # ← 命令一律在**工程根**执行（scratch/ 在根，不在 build/ 下）
node scratch/check_all_syntax.js     # ① 语法（临时文件必须带 process.pid！）
node build/build.js chN              # ② 构建（→ viz/）
node build/check_geom.js             # ③ 几何+渲染自检（FAIL 0 / WARN 0）
node build/check_gap.js              # ④ 框图/信号线断头（FAIL 0）
node build/check_text.js             # ⑤ 抄写+排版残留
node build/scan_svg.js               # ⑥ 未被脚本引用的 svg/canvas
node scratch/verify_runtime.js       # ⑦ 无头 Chrome：标题 ✓ + 无 console error
node scratch/audit_product.js        # ⑧ 产物级残留（U+FFFD、占位符、外链…）
node build/publish.js                # ⑨（可选）组装公网发布目录 site/（不含教材 PDF）
```

- ①在②之前：语法错会让后续所有"绿"失去意义。
- **⑦ 自带静态服务器**（`scratch/serve.js`，根=工程根，端口 18076）：原先硬编码 `127.0.0.1:18077`，
  而该端口上跑的是**通信电路**那门课的服务器 → 根目录不对 → 全 404 → 页面被误判「无✓ / 无SVG」。
  要连别的工程看，用 `$env:VERIFY_BASE='http://…/'; node scratch/verify_runtime.js`。
- **③ ④ 里出现「[自检·离线桩输出]」是正常的**：桩 DOM 不支持 `querySelector/querySelectorAll`
  与正文读取，依赖真实 DOM 的断言在离线必然显示 FAIL —— 那是**桩的局限、不是页面缺陷**；
  权威判定在 ⑦（真实 Chrome，逐条读回自检结论，FAIL 会让该页判 FAIL）。
- **并行跑体检时，凡把代码片段写到临时文件再 `node --check` 的脚本，
  临时文件名必须带 `process.pid`**（多 worker 并行时固定文件名会互相覆盖 → 假 FAIL）。

## 7. JS 层的五类「静默错误」（静态检查查不出，只有运行时显形）

1. **IIFE 私有函数被内联 `onclick` 调用**：内联事件在**全局作用域**求值，
   `(function(){…})()` 内部的函数不可见 → 点按钮抛 `ReferenceError`。
   凡页面用内联事件属性，必须在 IIFE 内显式 `window.fn = fn;`。
2. **空串被 `||` 当成缺省**：`{…}[String(e)] || ('10^'+e)` —— 表里 `e=0` 对应 `''` 是有效值，
   被判 falsy 落到回退串 → 显示「400.000 10^0」。
   正解：`var u = map[String(e)]; if (u === undefined) u = '10^'+e;`。
3. **滑块往返量化**：对数刻度滑块把值换算成位置再换回会带量化误差（`range` 默认 `step=1`）。
   预设按钮应**直接传值**给更新函数，不经滑块往返；滑块加 `step="0.01"`。
4. **`setText()` 走 textContent，禁止往参数里塞 HTML 标签**（要标签用 `innerHTML`）。
   改这类调用时**注意括号数量**：`setText('id', A + (ok?'X':'Y'))` 有两个右括号，
   改成 `$('id').innerHTML = …` 时**只能删一个**，删多了整页脚本不执行。
5. **写文件后必须扫 U+FFFD 乱码**：中文段落多次编辑后可能悄悄变成替换符，肉眼容易漏
   （`audit_product.js` 已含该项）。

## 8. 两个「写脚本改源码」的通用铁律

1. **`String.replace` 的捕获组数量必须与回调形参对齐**。
   正则**零捕获组**时实际传 `(match, offset, wholeString)`；形参按 `(m,a,b)` 写会让
   `a` 静默变偏移量、`b` 变整串 → **replace 等于把整个文件插回原处**，
   文件呈 2 的幂次自我复制、体积暴涨且不报错。
2. **改完文件立刻验证体积与结构**：字节数、行数、`<script>` 段数、`<svg>` 次数，
   与改动前对不上就说明脚本写坏了 —— 不要等到构建产物爆炸才发现。
   （阶段 2 拆节迁移脚本尤其要守这两条，拆完先做**内容守恒比对**再谈验收。）

## 9. 阶段 2 拆节迁移专项注意

- 旧 4 章：第 4 章 12 节 / 第 5 章 6 节 / 第 6 章 8 节 / 第 7 章 11 节，共 **37 个片段**。
- 按 `<section>` 切分，**拆分前后做原子序列守恒校验**（全文文本 token 比对），不靠肉眼。
- **外链治理**：旧 4 章每章有 2 个外链 URL + 1 处 Google Fonts 字体引用 ——
  违反第 5.6 条禁项，迁移时改系统字体栈 / 本地字体，`audit_product` 判外链 = 0。
- 页末自检：旧章自检脚本在 `scripts/verify_page.js` 有公式对撞段，迁移时**按节拆散**到各片段页末，
  并补「页面读数回读」。
- 旧文件删除前，先确认 `index.html`、`viz/00_学习入口.html`、各页互链全部改到新地址。

## 10. 例题解法 / 习题解法页（阶段 4，另开一轮）

- **与原理讲解页保持独立**：`原理讲解_` / `例题解法_` / `习题解法_` 三前缀，不混排。
- 形态照搬通信电路第四轮：**独立整页 HTML**，源在 `build/examples/pages/`、产物在 `viz/`，
  两者**逐字节相同**（权威副本在 `viz/`，用镜像脚本同步）；模板 + `fill_template.js` 填充，
  不许手工复制模板改（会残留 `{{H1}}` 占位符）。
- **唯一事实来源** `build/exlist/ch<N>.md`：逐题转录（教材题干照抄 + 关键结果 + 书页/PDF 页），
  做页面时先读 exlist 再回页图复核，不要凭印象写数值。
- ⚠️ **本课程没有配套答案册**（通信电路有陈启兴答案书可复核，这里没有）——
  所有解答**独立复算**，一致性只能标「与教材正文/课件对撞」；
  在页面与总目录里**明确标注「未核对答案册」**；若日后找到可靠答案来源再建 `answer_guide/`。
- 页末自检要求同第 5 节；`verify_runtime` 要求**至少 1 个 SVG 或 Canvas**，纯文字页 FAIL。
- 答案与教材不一致时**并列说明**，不擅自改教材结论；教材存疑进 `digest/`。

## 11. 已知坑位（两课程合并，踩过的别再踩）

| 坑 | 表现 | 解法 |
|---|---|---|
| `pdftotext` 读中文路径 | `Couldn't open file` | 复制到纯 ASCII 目录再处理 |
| `pdftotext` 丢 `√` | 公式通顺但数值错量级 | 根号公式一律渲染成图核对 |
| 教材扫描版无文本层 | `pdftotext` 只吐几百字节 | `pdftoppm` 渲染后读图 |
| 页码偏移换章沿用 | 定位到错误章节 | 每章先渲染目录/首页确认（本教材 −15） |
| Chromium 合成层 16384px 上限 | 长页 `fullPage` 截图把页首重放、16384 以下空白 | **工具限制不是页面 bug**；验收时复制副本、隐藏已验收 section 压缩后再截图 |
| 浏览器 `click` 注入失效 | `dispatched:true` 但读数不变 | 副本注入 `setTimeout(click)`，单层探针 |
| SVG 文本函数漏花括号 | `missing ) after argument list` 整页白屏 | `txt(svg,x,y,'文字',{'text-anchor':'end'})` 属性对象必须 `{}` |
| `Math.exp()` 不接受复数 | 恒 NaN 图空白无报错 | 复数模手工拆：`√((1+cosθ)² + sin²θ)` |
| 概率密度算总误码率漏先验 | 阴影面积对但 Pe 差一倍 | `Pe = P(1)P(0/1)+P(0)P(1/0)`，等概率各 ½ |
| 滑块 `step` 取不到目标值 | 预设值取不到、与教材对不上 | `step` 能整除目标值 |
| `</b>` 被批量误写成 `b>` | 页面出现「方向：b>」 | 禁用正则批量替换 `</b>` |
| 绝对坐标当相对偏移 | 曲线冲出面板压正文 | 半高用 `bh/2 - margin`，画完核对坐标范围 |
| 教材等效带宽只取正频率侧 | `∫_{-∞}^{∞}/2` 整体少算一半 | 严格按教材右端式；先核对教材原式再写代码 |
| 字体走 Google Fonts CDN | 违反无外链禁项 | 系统字体栈或本地 `@font-face` |
| grid 轨道 `minmax(320px,1fr)` 窄屏溢出 | 360px 下轨道最小宽硬撑到 320px，超出容器 3px；**390px 却不破**（内容区 319px≈320px 差一点） | 写 `minmax(min(320px,100%),1fr)`；**窄屏必须同时测 390 和 360 两个宽度** |
| 窄屏溢出报「越界元素×0」 | `check_mobile_width.js` 按 iframe 宽判断越界，而文档可用宽是 `clientWidth`（扣 15px 滚动条）→ 3px 级溢出扫不到元素 | 用 `node scratch/diag_overflow.js <相对路径> 360` 按 `clientWidth` 定位 |
| `grid/flex` 项 `min-width:auto` 撑破窄屏 | 子元素加 `min-width:0` 压不住父级 | 容器 `contain:inline-size`，或对容器子项显式设 `min-width:0` |
| 多个验收脚本**并发**跑抢静态服务器端口 | `check_mobile_width.js` 等各自 `spawn` 一个 `serve.js`（默认端口固定）→ 后启动的抢不到端口 → 批量报「未能取到测量结果（页面可能未加载）」，**看着像页面坏了其实不是** | 验收脚本**串行**跑；要并行就各给一个 `VERIFY_PORT`；报「页面可能未加载」时先查进程：`Get-CimInstance Win32_Process -Filter "Name='node.exe'"` |
| `VERIFY_PORT` 选的端口**已被别的服务占用** | 症状同上：端口被占 → `serve.js` 起不来 → iframe 加载的是**别人的服务** → 全页「页面可能未加载」 | 选端口前先查：`Get-NetTCPConnection -State Listen \| Where LocalPort -ge 18076`；本机常见占用：18076（本工程预览）、18077（通信电路）、18078、**18098（小红书 MCP 的 `tools/serve.js`）** |
| `check_online.js` 遇到大文件就**静默卡住** | 原实现为了省流量，在响应流超过 400 KB 时 `res.destroy()`，但 `resolve` 只挂在 `'end'` 事件上 → destroy 后 `end` 不触发 → 该请求**永远不返回** → 脚本停在那一个文件上（症状：只输出前几个 URL 就没了，**看起来像"线上只有几个文件"**） | 不要在中途 destroy 响应流；要么读完整个流，要么同时监听 `'close'`/`'error'` 并保证只 resolve 一次（已修）。判据：**输出行数应等于本地文件数**，少于它就是卡住了，不是线上缺文件 |
| PortableGit 的 `helper-selector` 拦在凭据链最前 | 全局 `~/.gitconfig` 里有 `credential.helperselector.selected=manager` → `git push` 弹「CredentialHelperSelector」选择窗口**卡住不返回**；且 `git config --global --get-all credential.helper` **查不到它**（它不是 helper 项） | 本仓库 `.git/config` 里显式写 `credential.helper = <GCM绝对路径>`；若仍被弹窗，用 `GIT_CONFIG_GLOBAL=<临时配置文件>` 隔离全局配置再推（不改全局）。PortableGit 的 GCM 在 `mingw64/bin/git-credential-manager.exe`（2.7.3 可用）；`gh` CLI 本机没装 |
| 部署时源码归档包撞 200 MB 上限 | `website_deploy` 的 `source_path` 传工程根 → 把 `docs/`（教材 PDF 140 MB）+ `build/pages/`（扫描页图 67 MB）一起打包 → 报「Source directory total size exceeds the source archive limit」 | `source_path` 改传 `scratch/make_source_bundle.js` 生成的 `.deploy-src/`（只含 `git ls-files -co --exclude-standard` 的文件，0.6 MB）；`path` 仍传 `site/`。该目录已进 `.gitignore` |
| `txt()` 里塞 `<b>` 标签被当字面显示 | SVG 文本助手 `txt()` 走 `textContent`，HTML 标签原样打印成「产生方法<b>不写进体制名</b>」 | SVG 文本**不放 HTML 标签**；要强调就用两次 `txt()` 分段画，或改 `innerHTML`（但那会引入 XSS 面） |
| `a-b%c` 被解析成 `a-(b%c)` | `(bits-1)%1` 写成 `bits-1%1` → 运算符优先级让 `%` 先于 `-` 绑定 → 条件恒真 → 小数点多显示两位 | 取模一律加括号 `(bits-1)%1`；改完用真 Chrome 点一遍读数回读，别只看代码 |
| 拼 URL 多一个斜杠导致全站 404 | `BASE` 末尾已有 `/`，再拼 `'/'+path` → `//tongxin-yuanli/...` → 线上 404（本地文件其实都在） | 拼 URL 前先确认 BASE 尾部；脚本里统一 `BASE.replace(/\/+$/,'')` 再拼 `'/'+path` |
| PowerShell 把 UTF-8 页面按 GBK 解码 | `Invoke-WebRequest` 取到的中文全是乱码 → 字符串匹配 `indexOf('中文')` 恒为 -1 → 误判「线上没这段内容」 | 核对线上中文内容一律用 Node 按 `Buffer.toString('utf8')` 解码；PowerShell 只用来取状态码 |

## 12. worker 可做 / 不可做

- ✅ 只写自己的 `build/parts/chN/` 片段、`build/digest/<章>.md`、（阶段 4）`build/exlist/` 与
  `build/examples/pages/`；按本文件第 5、6 节标准自检。
- ❌ 不改 `build/*.js`、`manifest.json`、根 `index.html`、`viz/00_学习入口.html`、
  本 `AGENTS.md`、`制作总目录.md`（进度登记由父会话/本人统一收口）；
  不创建最终 HTML 到 `viz/`（由构建器生成，阶段 4 例外：例题页权威副本在 `viz/`）。
