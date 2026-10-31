# zjnu-visual-lectures

浙师大《通信原理》（第 7 版 · 樊昌信 / 曹丽娜）与《通信电子线路》（第 3 版 · 陈启兴）的
**可交互可视化讲义工程**，以及 19 篇光伏 / 太阳辐照度预报论文的中文精读。

在线站点：<https://qggpmfqcjeedw.space.mcode.cn>

---

## 这个仓库是什么

不是静态成品，而是一条**可复现的构建流水线**：讲义片段是唯一可编辑源，
构建器把片段渲染成页面，八道闸门逐条验收，发布器组装出公网目录。

```
build/parts/<章>/s<章>_<节>.html   ← 唯一可编辑源（讲义片段）
        │  node build/build.js ch4
        ▼
viz/                               ← 构建产物（页面 + PWA 三件套）
        │  node build/publish.js
        ▼
site/                              ← 公网发布目录（平铺，零 PDF）
```

### 目录结构

| 路径 | 说明 |
|---|---|
| `build/` | 构建器与工具链（`build.js` / `lib.js` / `math.js` / `publish.js` …） |
| `build/parts/` | **讲义片段**（唯一可编辑源），按章分目录 |
| `build/digest/` | 教材存疑与勘误登记 |
| `build/mobile.css` `build/mobile.js` | 共享移动端适配（宽图 1:1 横滑、点图灯箱） |
| `build/paper_license_meta.json` | 论文许可元数据（**唯一事实来源**，由官方页面生成） |
| `scratch/` | 验收闸门与诊断脚本（见下表） |
| `scripts/` | 页内自检脚本 |
| `AGENTS.md` | **工程规范**（交付标准、验收闸门、已知坑位） |
| `制作总目录.md` | 总控台（阶段进度、版权口径、缺陷登记、更新日志） |

## 构建与验收

```powershell
node scratch/check_all_syntax.js     # ① 语法（逐片段逐段查，报源文件行号）
node build/build.js ch4              # ② 构建 → viz/
node build/check_geom.js             # ③ 几何（越界 / 重叠 / 空图）
node build/check_gap.js              # ④ 框图信号线断头
node build/check_text.js             # ⑤ 抄写与排版残留
node build/scan_svg.js               # ⑥ 未被脚本引用的 svg/canvas
node scratch/verify_runtime.js       # ⑦ 真实 Chrome：标题带 ✓ + 无 console error
node scratch/audit_product.js        # ⑧ 产物残留（乱码 / 占位符 / 外链）
node build/publish.js                # ⑨ 组装公网发布目录 site/
```

站点级闸门：

```powershell
node scratch/check_site.js            # 静态体检（零 PDF / 零外链资源 / 引用可解析）
node scratch/verify_site.js           # 真实 Chrome 逐页实测
node scratch/check_mobile_width.js 360  # 窄屏横向溢出（390 与 360 两个宽度都要测）
node scratch/check_online.js          # 线上逐 URL 状态码
```

## 几条硬性约束

- **页面完全自包含**：无外链资源（无 CDN / 外链图片字体）、无 MathJax/KaTeX、
  禁 `Math.random()`（用共享库 `LCG`）、乘方用 `Math.pow`、Canvas 曲线用 `P.curve()`
- **公式用宏**：展示公式一律用 `\frac` `\sqrt` 排版，不手写斜杠线性分式；
  宏的花括号必须配平，否则构建直接中断
- **教材核对**：公式号、原式、图号与教材页图一致；教材没有的取物理合理值并在
  `.note` 声明「教学设定值」
- **教材存疑并列说明**：发现笔误时页面并列给出**原值与复算值 + 判断依据**，
  不擅自改教材结论，并登记进 `build/digest/`
- **窄屏双宽度**：必须同时测 390px 与 360px —— 很多 3px 级溢出只在 360px 暴露

## ⚠ 版权口径

本仓库**不含**任何教材 / 课件 / 答案册的扫描件与页图：

| 材料 | 处置 | 依据 |
|---|---|---|
| 教材 PDF、教材页图、答案册页图 | **一律不入库、不上线** | 商业出版教材，无再分发授权 |
| 论文 PDF 本体 | **不入库、不上线** | 完整出版原文 |
| 论文原页截图 | 按各论文的**开放许可**随讲义公开，并逐篇标注出处与许可 | 19 篇许可均允许再分发 |

论文许可元数据由 `node build/build_paper_license_meta.js` 从 **arXiv / Nature 官方页面**
生成到 `build/paper_license_meta.json`，不手写、不从 PDF 文本推断。

## 许可

仓库内的**自写代码与讲义文字**按 MIT 许可；其中的教材页图与论文原文仍受各自版权保护，
不在授权范围内。
