
/* ---------------- 基础 ---------------- */
const SVGNS='http://www.w3.org/2000/svg';
const $=function(id){return document.getElementById(id);};
function S(tag,attrs,parent){
  var e=document.createElementNS(SVGNS,tag);
  if(attrs) for(var k in attrs) e.setAttribute(k,attrs[k]);
  if(parent) parent.appendChild(e);
  return e;
}
/*=== SUBSCRIPT-REGION-BEGIN ===*/
  /* =======================================================================
   * build/subscript.js —— 「真下标」（教材式竖排下标）唯一来源
   *
   * 目标：把标注里的「X_y」渲染成教材式的**真下标**（基线右下方的小字），
   *       而不是字面上的下划线。
   *
   * 关键设计：**textContent 保持逐字不变**
   *   下划线以「零宽」方式保留在文本里（font-size:0 的 tspan / span），
   *   于是：
   *     ① 页末自检里按字面串比对 document.body.textContent 的断言（txtguard）不受影响；
   *     ② build/check_text.js 的线性抄写比对基线不变（PASS 数必须保持）；
   *     ③ build/check_geom.js 用 textContent 估文字宽 → 几何判定结果不变；
   *     ④ 复制粘贴得到的仍是线性写法 "Q_L"，与课程文档的线性记法一致。
   *   若改成「删掉下划线」，textContent 会变 → 上述三处全部要跟着改，
   *   且教材式线性写法在页面上就消失了。
   *
   * 本文件是**唯一来源**：build/lib.js 与 build/circuit/svg_components.js 里
   * 各有一份**逐字节相同**的副本（标记 SUBSCRIPT-REGION），
   * 由 scratch/sync_subscript.js 同步、scratch/test_subscript.js 核对。
   *
   * ⚠ 宿主文件（lib.js / svg_components.js）须在本区域**之后**补一行
   *   `var CourseSubscript = window.CourseSubscript;`
   *   —— 标准库的整段代码包在 IIFE 里，区域内的 var 会被 IIFE 吞掉、拿不到全局。
   * ======================================================================= */
  (function (g) {
    'use strict';

    var NS = 'http://www.w3.org/2000/svg';

    /* 下标字号比例与基线位移（教材式：基线右下方的小字） */
    var RATIO = 0.68;   /* 下标字号 = 基准字号 × RATIO */
    var SHIFT = 0.22;   /* 下标基线相对父基线下移 = 基准字号 × SHIFT（em） */

    /* --- 字符分类 ---------------------------------------------------------
     * isSym：可作「基字符」也可作「下标字符」的符号字符。
     *   字母（A-Z a-z）、拉丁扩展（Ā Ĩ Ũ ī İ / Ȧ Ȱ Ȯ）、希腊字母（Δ Σ Ω ω φ π μ）、
     *   组合记号（◌̇ ◌̅ ◌́）、撇号（’ ′ ″）、数字。
     *   ⚠ 排除 Latin-1 里的 × (U+00D7) 与 ÷ (U+00F7) —— 它们是运算符不是符号。
     *   ⚠ Unicode 下标数字（₁ ₂ …）本身已经是下标，只当基字符、不再拆。
     */
    function isSym(c) {
      if (!c) return false;
      var k = c.charCodeAt(0);
      if (k >= 48 && k <= 57) return true;                         /* 0-9 */
      if (k >= 65 && k <= 90) return true;                         /* A-Z */
      if (k >= 97 && k <= 122) return true;                        /* a-z */
      if (k >= 0x00C0 && k <= 0x00FF && k !== 0x00D7 && k !== 0x00F7) return true; /* Latin-1 字母 */
      if (k >= 0x0100 && k <= 0x017F) return true;                 /* Latin Extended-A */
      if (k >= 0x0180 && k <= 0x024F) return true;                 /* Latin Extended-B */
      if (k >= 0x0300 && k <= 0x036F) return true;                 /* 组合记号 */
      if (k >= 0x0370 && k <= 0x03FF) return true;                 /* 希腊字母 */
      if (k === 0x2019 || k === 0x2032 || k === 0x2033) return true; /* ’ ′ ″ */
      if (k >= 0x2080 && k <= 0x2089) return true;                 /* Unicode 下标数字 */
      return false;
    }
    /* 下标的**首字符**：符号字符，外加单独的 +/−（教材的 F₊ / F₋ / u₊(t)） */
    function isSubStart(c) {
      if (isSym(c)) return true;
      if (!c) return false;
      var k = c.charCodeAt(0);
      return k === 0x2B /* + */ || k === 0x2212 /* − */ || k === 0x2D /* - */;
    }
    /* 下标的**后续字符**：符号字符；小数点仅在「前后都是数字」时并入
     * （教材的 f₀.₇ / K_r0.1 —— 那个点属于下标，不是句点） */
    function isSubCont(c, prev, next) {
      if (isSym(c)) return true;
      if (!c) return false;
      var k = c.charCodeAt(0);
      if (k === 0x2E /* . */) {
        var p = prev ? prev.charCodeAt(0) : 0, nx = next ? next.charCodeAt(0) : 0;
        return p >= 48 && p <= 57 && nx >= 48 && nx <= 57;
      }
      return false;
    }

    /* ======================================================================
     * 覆盖表（教材歧义标注）
     *
     * 「最长下标段」规则会把下面这些标注并成一段下标，但它们在教材里
     * 是**两个（或三个）独立符号的乘积**。
     * 这类写法在语法上**无法用规则区分**（C_jQ 与 feUi 结构完全相同），
     * 唯一可靠的办法是逐条对照教材原式后写死。
     *
     * ⚠ 新增条目必须：① 先看教材页图核对；② 在 ref 里写明书页/式号；
     *   ③ 保证 parts 拼接后与 from **逐字相同**（textContent 守恒）。
     * ==================================================================== */
    var ovTable = [
      { from: 'ω_cCR_L', parts: ['ω_c', 'C', 'R_L'],
        ref: '教材例 3-1（书页 54）：|Z_pn| 分母印作 1+j(nωCR_L−R_L/(nωL))' },    { from: 'U_LmU_Sm', parts: ['U_Lm', 'U_Sm'],
        ref: '教材习题 9.4/9.5（书页 221）：U_Sm（输入幅值）与 U_Lm（本振幅值）是两个独立量' },
      { from: 'U_SmU_Lm', parts: ['U_Sm', 'U_Lm'],
        ref: '教材习题 9.4/9.5（书页 221）：变频跨导 ∝ a₂·U_Sm·U_Lm' },
      { from: 'U_nmU_Lm', parts: ['U_nm', 'U_Lm'],
        ref: '教材习题 9.4/9.5（书页 221）' },
      { from: 'U_cmU_o', parts: ['U_cm', 'U_o'],
        ref: '第 5 章振幅调制：输出功率 ∝ U_cm·U_o' },
      { from: 'y_feU_i', parts: ['y_fe', 'U_i'],
        ref: '教材 §2.3 高频等效电路：受控电流源 y_fe·U̇_i' },
      { from: 'L_qC_q', parts: ['L_q', 'C_q'],
        ref: '教材式 (4-26)（书页 103）：ω_q = 1/√(L_qC_q)' },
      { from: 'C_qC_o', parts: ['C_q', 'C_o'],
        ref: '教材式 (4-27)（书页 103）：ω_p = 1/√(L_q·C_qC_o/(C_q+C_o))' },
      { from: 'K_fU_Ωm', parts: ['K_f', 'U_Ωm'],
        ref: '教材式 (7-37)：K_f = f_c/(U_D+V_Q)' },
      { from: 'L_1C_ΣQ', parts: ['L_1', 'C_ΣQ'],
        ref: '教材式 (7-39)：f_c = 1/(2π√(L_1C_ΣQ))' },
      { from: 'Q_Lγ', parts: ['Q_L', 'γ'],
        ref: '教材式 (7-45)：K_p = −Q_Lγ/[2(U_D+V_Q)]' },
      { from: 'C_qr_q', parts: ['C_q', 'r_q'],
        ref: '教材图 4-13（书页 103）：L_q、C_q、r_q 串联，是三个独立元件' },
      { from: 'ω_cC', parts: ['ω_c', 'C'],
        ref: '教材例 3-1（书页 54）：ωC 是容性电纳项' },
      { from: 'ω_cL', parts: ['ω_c', 'L'],
        ref: '教材例 3-1（书页 54）：1/(ωL) 是感性电纳项' }
    ];

    /* 覆盖表按 from 长度倒序建正则 → 长的先匹配（「ω_cCR_L」先于「ω_cC」） */
    var OVERRIDE_RE = null;
    function overrideRe() {
      if (OVERRIDE_RE) return OVERRIDE_RE;
      if (!ovTable.length) return null;      /* ⚠ 空表不能建空正则：空模式会原地匹配 → 死循环 */
      var list = ovTable.slice().sort(function (a, b) { return b.from.length - a.from.length; });
      var src = list.map(function (o) {
        return o.from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      }).join('|');
      OVERRIDE_RE = new RegExp(src, 'g');
      return OVERRIDE_RE;
    }

    /* 把字符串切成原子段：[{text, parts|null}]
     * parts=null → 普通文本；parts!=null → 覆盖命中（parts 为教材式分段） */
    function splitByOverride(str) {
      if (str === undefined || str === null) return [];
      str = String(str);
      if (str.indexOf('_') < 0) return [{ text: str, parts: null }];
      var re = overrideRe();
      if (!re) return [{ text: str, parts: null }];
      re.lastIndex = 0;
      var atoms = [], last = 0, m;
      while ((m = re.exec(str)) !== null) {
        if (!m[0].length) { re.lastIndex++; continue; }   /* 防御：空匹配必须推进 */
        if (m.index > last) atoms.push({ text: str.slice(last, m.index), parts: null });
        var parts = null;
        for (var i = 0; i < ovTable.length; i++) {
          if (ovTable[i].from === m[0]) { parts = ovTable[i].parts; break; }
        }
        atoms.push({ text: m[0], parts: parts });
        last = m.index + m[0].length;
        re.lastIndex = last;
      }
      if (last < str.length) atoms.push({ text: str.slice(last), parts: null });
      return atoms;
    }

    /* --- 拆串 -------------------------------------------------------------
     * 返回 [{s:文字, sub:是否下标段, pre:本段前紧邻的下划线数, us:段内下划线位置}]
     * 规则：只有「符号字符 + _ + 可作下标的字符」才算下标分隔。
     *   "Q_L"      → base "Q" / sub "L"
     *   "P′_no1"   → base "P′" / sub "no1"
     *   "U̇_b′e"    → base "U̇" / sub "b′e"
     *   "K_r0.1"   → base "K" / sub "r0.1"（点属于下标）
     *   "u_o(t)"   → base "u" / sub "o" / base "(t)"
     *   "f_c + F"  → base "f" / sub "c" / base " + F"
     *   "A _B"     → 空格前不是符号字符 → 整串当普通文字（不拆）
     *   "a_b_c"    → base "a" / sub "b"(pre 1) / sub "c"(pre 1)
     *                （两个下划线都保留：linearize 必须能还原成 "a_b_c"）
     */
    function splitRaw(str) {
      var runs = [];
      if (str === undefined || str === null) return runs;
      str = String(str);
      var n = str.length, plainStart = 0, i = 0;
      while (i < n) {
        if (str[i] === '_' && i > plainStart && isSym(str[i - 1]) && isSubStart(str[i + 1])) {
          runs.push({ s: str.slice(plainStart, i), sub: false, pre: 0, us: [] });
          var k = i + 2;                     /* 第一个字符已由 isSubStart 认可 */
          while (k < n && isSubCont(str[k], str[k - 1], str[k + 1])) k++;
          var run = { s: str.slice(i + 1, k), sub: true, pre: 1, us: [] };
          runs.push(run);
          plainStart = k; i = k;
          /* 连续下划线（a_b_c）→ 并入同一段下标；**每个下划线都要保留**，
             否则 textContent 会少一个 "_"（守恒被破坏）。
             段内下划线的位置记在 us[] 里，linearize 据此还原。 */
          while (i < n && str[i] === '_' && isSym(str[i - 1]) && isSubStart(str[i + 1])) {
            var m = i + 2;
            while (m < n && isSubCont(str[m], str[m - 1], str[m + 1])) m++;
            run.us.push(run.s.length);
            run.s += str.slice(i + 1, m);
            plainStart = m; i = m;
          }
          continue;
        }
        i++;
      }
      if (plainStart < n) runs.push({ s: str.slice(plainStart), sub: false, pre: 0, us: [] });
      return runs;
    }

    /* 覆盖表感知的拆串（对外主入口） */
    function splitAll(str) {
      var atoms = splitByOverride(str);
      var runs = [];
      for (var i = 0; i < atoms.length; i++) {
        if (atoms[i].parts) {
          for (var j = 0; j < atoms[i].parts.length; j++) {
            runs = runs.concat(splitRaw(atoms[i].parts[j]));
          }
        } else {
          runs = runs.concat(splitRaw(atoms[i].text));
        }
      }
      return runs;
    }

    /* 还原成线性写法（用于守恒校验）：
     * 普通段原样；下标段前面补回它的下划线；段内下划线按 us[] 位置插回 */
    function linearize(runs) {
      var out = '';
      for (var i = 0; i < runs.length; i++) {
        var r = runs[i];
        var p = r.pre || 0;
        for (var k = 0; k < p; k++) out += '_';
        if (r.us && r.us.length) {
          var at = 0;
          for (var q = 0; q < r.us.length; q++) {
            out += r.s.slice(at, r.us[q]);
            out += '_';
            at = r.us[q];
          }
          out += r.s.slice(at);
        } else out += r.s;
      }
      return out;
    }

    function hasSub(str) {
      if (str === undefined || str === null) return false;
      var runs = splitAll(String(str));
      for (var i = 0; i < runs.length; i++) if (runs[i].sub) return true;
      return false;
    }

    /* --- SVG 渲染 ---------------------------------------------------------
     * node：<text> 元素；baseSize：基准字号（数字）。
     * 结构（全部用 <tspan> 承载，不依赖 document.createTextNode ——
     *       标准库自己的回归测试用的最小 DOM 桩没有那个方法）：
     *   普通文字 tspan（无属性）→ 零宽下划线 tspan → 下标 tspan → 复位 tspan
     *   零宽下划线：font-size="0" → 不渲染、不占宽，但 textContent 里保留 "_"
     *   下标 tspan：font-size = baseSize×RATIO，dy = baseSize×SHIFT（下移）
     *   复位 tspan：dy = −baseSize×SHIFT → 其后的普通文字回到原基线
     */
    function renderSvg(node, str, baseSize) {
      var runs = splitAll(str);
      var has = false;
      for (var i = 0; i < runs.length; i++) if (runs[i].sub) { has = true; break; }
      if (!has) { node.textContent = (str === undefined || str === null) ? '' : String(str); return node; }

      var B = (typeof baseSize === 'number' && isFinite(baseSize) && baseSize > 0) ? baseSize : 16;
      var subSize = Math.round(B * RATIO * 100) / 100;
      var dy = Math.round(B * SHIFT * 100) / 100;

      function zwSpan() {
        var z = document.createElementNS(NS, 'tspan');
        z.setAttribute('font-size', '0');
        z.textContent = '_';
        return z;
      }

      node.textContent = '';
      var shifted = false;
      for (var j = 0; j < runs.length; j++) {
        var r = runs[j];
        var p = r.pre || 0;
        for (var z2 = 0; z2 < p; z2++) node.appendChild(zwSpan());
        if (!r.sub) {
          if (!r.s) continue;
          var bs = document.createElementNS(NS, 'tspan');
          if (shifted) { bs.setAttribute('dy', String(-dy)); shifted = false; }
          bs.textContent = r.s;
          node.appendChild(bs);
        } else {
          /* 段内下划线（合并下标 a_b_c）：按 us[] 把本段切成若干片 */
          var pieces = [], at = 0;
          if (r.us && r.us.length) {
            for (var q = 0; q < r.us.length; q++) {
              pieces.push(r.s.slice(at, r.us[q]));
              pieces.push(null);                 /* null = 段内零宽下划线 */
              at = r.us[q];
            }
          }
          pieces.push(r.s.slice(at));
          for (var k = 0; k < pieces.length; k++) {
            if (pieces[k] === null) { node.appendChild(zwSpan()); continue; }
            if (!pieces[k]) continue;
            var ts = document.createElementNS(NS, 'tspan');
            ts.setAttribute('font-size', String(subSize));
            ts.setAttribute('dy', shifted ? '0' : String(dy));
            ts.textContent = pieces[k];
            node.appendChild(ts);
            shifted = true;
          }
        }
      }
      return node;
    }

    /* --- HTML 渲染（正文侧） ---------------------------------------------
     * toHtml(str)：把「X_y」转成「X<sub>…</sub>」，下划线以零宽 span 保留在
     * <sub> **之前**（下划线是「分隔标记」，不属于下标本身）。
     * 供源码级转换器使用（页面正文是静态 HTML，源级改写比运行时改 DOM 更稳）。
     */
    function innerHtml(run) {
      if (!run.us || !run.us.length) return run.s;
      var out = '', at = 0;
      for (var q = 0; q < run.us.length; q++) {
        out += run.s.slice(at, run.us[q]) + '<span style="font-size:0">_</span>';
        at = run.us[q];
      }
      return out + run.s.slice(at);
    }
    function toHtml(str) {
      var runs = splitAll(str);
      var has = false;
      for (var i = 0; i < runs.length; i++) if (runs[i].sub) { has = true; break; }
      if (!has) return str;
      var out = '';
      for (var j = 0; j < runs.length; j++) {
        var r = runs[j];
        var p = r.pre || 0;
        for (var z = 0; z < p; z++) out += '<span style="font-size:0">_</span>';
        if (r.sub) out += '<sub>' + innerHtml(r) + '</sub>';
        else out += r.s;
      }
      return out;
    }

    /* --- HTML 片段转真下标（供页面**运行时**写标签用） -------------------
     * 页面上有一部分标签是运行时生成的（读数面板的键名、动态说明文字），
     * 源级改写碰不到它们 → 运行时用 subHtml() 转一下再写进 HTML 文本节点。
     *   · 标签片段（<b>、<sup> …）原样保留，只转**文本部分**；
     *   · 下划线以零宽 span 保留 → textContent 逐字不变，
     *     页末自检里按字面串比对 document.body.textContent 的断言不受影响。
     * ⚠ 只用于**固定标签字符串**，不接受用户输入（它会写 innerHTML）。
     */
    function subHtml(str) {
      if (str === undefined || str === null) return '';
      str = String(str);
      if (str.indexOf('_') < 0) return str;
      return str.split(/(<[^>]*>)/g).map(function (seg) {
        if (!seg) return '';
        if (seg.charAt(0) === '<') return seg;
        return toHtml(seg);
      }).join('');
    }

    var api = {
      split: splitAll,
      splitRaw: splitRaw,
      splitAll: splitAll,
      linearize: linearize,
      hasSub: hasSub,
      renderSvg: renderSvg,
      toHtml: toHtml,
      subHtml: subHtml,
      setOverrides: function (list) {
        ovTable = (list || []).slice();
        OVERRIDE_RE = null;                 /* 正则缓存必须失效 */
        return ovTable;
      },
      RATIO: RATIO,
      SHIFT: SHIFT
    };
    /* 覆盖表用 getter 暴露：直接改 api.OVERRIDES 不起作用（内部读的是 ovTable） */
    Object.defineProperty(api, 'OVERRIDES', {
      get: function () { return ovTable; },
      enumerable: true
    });
    g.CourseSubscript = api;
    /* 裸全局别名：让**没有 lib.js** 的手工页也能直接写 subHtml('…')
       （lib.js 里的同名函数是本函数的一层薄封装，行为一致） */
    g.subHtml = subHtml;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
  })(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
/*=== SUBSCRIPT-REGION-END ===*/
var CourseSubscript = window.CourseSubscript;
function TXT(parent,x,y,str,attrs){
  var a={x:x,y:y}; if(attrs) for(var k in attrs) a[k]=attrs[k];
  /* halo:true → 给文字加一圈白色描边（paint-order:stroke 保证描边在字形之下），
     用于「标签位置随滑块动态变化、无法保证与线条错开」的场景：
     白圈会把穿过文字的线条遮断，文字始终清晰可读。 */
  if(a.halo){
    delete a.halo;
    a.stroke='#fff';
    a['stroke-width']=a['stroke-width']||4;
    a['paint-order']='stroke';
    a['stroke-linejoin']='round';
  }
  var t=S('text',a,parent);
  /* 「X_y」按教材式画成**真下标**（基线右下方的小字）。
     下划线以零宽方式保留在 textContent 里 → 页末自检的 txtguard、
     check_text.js 的抄写基线、check_geom.js 的估宽全部不受影响。 */
  var bs=16;
  if(a['font-size']!==undefined){ var fv=parseFloat(a['font-size']); if(isFinite(fv)&&fv>0) bs=fv; }
  CourseSubscript.renderSvg(t,(str===undefined||str===null)?'':String(str),bs);
  return t;
}
function LINE(parent,x1,y1,x2,y2,attrs){
  var a={x1:x1,y1:y1,x2:x2,y2:y2}; if(attrs) for(var k in attrs) a[k]=attrs[k];
  return S('line',a,parent);
}
function PATH(parent,d,attrs){
  var a={d:d}; if(attrs) for(var k in attrs) a[k]=attrs[k];
  return S('path',a,parent);
}
function CIRC(parent,cx,cy,r,attrs){
  var a={cx:cx,cy:cy,r:r}; if(attrs) for(var k in attrs) a[k]=attrs[k];
  return S('circle',a,parent);
}
function RECT(parent,x,y,w,h,attrs){
  var a={x:x,y:y,width:w,height:h}; if(attrs) for(var k in attrs) a[k]=attrs[k];
  return S('rect',a,parent);
}
function ARROW(parent,x1,y1,x2,y2,attrs){
  var o=attrs||{}, col=o.stroke||'#1a46b5';
  var g=S('g',null,parent);
  LINE(g,x1,y1,x2,y2,{stroke:col,'stroke-width':o.w||1.6,fill:'none'});
  var a=5.2, ang=Math.atan2(y2-y1,x2-x1);
  var p1=x2-a*Math.cos(ang-Math.PI/7), q1=y2-a*Math.sin(ang-Math.PI/7);
  var p2=x2-a*Math.cos(ang+Math.PI/7), q2=y2-a*Math.sin(ang+Math.PI/7);
  PATH(g,'M'+x2+','+y2+' L'+p1+','+q1+' L'+p2+','+q2+' Z',{fill:col,stroke:'none'});
  return g;
}
/* ---------------- 电路元件（水平摆放，SVG 单位 px） ---------------- */
function cWire(parent,d,attrs){
  return PATH(parent,d,Object.assign({fill:'none',stroke:'#1f1f1f','stroke-width':1.6},attrs||{}));
}
function cResH(parent,x1,x2,y,o){
  o=o||{};
  var len=x2-x1, n=6, amp=(o.amp||7), body=Math.min(len*0.6,36);
  var x0=x1+(len-body)/2, step=body/n, pts=[];
  for(var i=0;i<=n;i++){
    var xx=x0+step*i;
    var yy=(i===0||i===n)?y:(i%2?y-amp:y+amp);
    pts.push(xx.toFixed(2)+','+yy.toFixed(2));
  }
  var g=S('g',null,parent);
  cWire(g,'M'+x1+','+y+' L'+x0+','+y+' L'+pts.join(' L')+' L'+x2+','+y);
  if(o.label) TXT(g,(x0+x0+body)/2,y-amp-7,o.label,{'text-anchor':'middle','font-size':13,fill:o.lc||'#333'});
  return g;
}
function cCapH(parent,x1,x2,y,o){
  o=o||{};
  var xm=(x1+x2)/2, h=o.h||13, gap=o.gap||7;
  var g=S('g',null,parent);
  cWire(g,'M'+x1+','+y+' L'+(xm-gap)+','+y);
  cWire(g,'M'+(xm-gap)+','+(y-h)+' L'+(xm-gap)+','+(y+h));
  cWire(g,'M'+(xm+gap)+','+(y-h)+' L'+(xm+gap)+','+(y+h));
  cWire(g,'M'+(xm+gap)+','+y+' L'+x2+','+y);
  if(o.label) TXT(g,xm,y-h-6,o.label,{'text-anchor':'middle','font-size':13,fill:o.lc||'#333'});
  return g;
}
function cIndH(parent,x1,x2,y,o){
  o=o||{};
  var len=x2-x1, n=o.n||4, r=o.r||9;
  var body=Math.min(len*0.62,n*r*2), x0=x1+(len-body)/2, step=body/n;
  var d='M'+x1+','+y+' L'+x0+','+y, i, xx;
  for(i=0;i<n;i++){ xx=x0+step*i; d+=' A'+r+','+r+' 0 0 1 '+(xx+step).toFixed(2)+','+y; }
  d+=' L'+x2+','+y;
  var g=S('g',null,parent);
  cWire(g,d);
  if(o.label) TXT(g,x0+body/2,y-r-6,o.label,{'text-anchor':'middle','font-size':13,fill:o.lc||'#333'});
  return g;
}
function cGnd(parent,x,y,o){
  o=o||{};
  var g=S('g',null,parent);
  var w=o.w||15, gap=o.gap||4;
  cWire(g,'M'+x+','+y+' L'+x+','+(y+gap));
  cWire(g,'M'+(x-w)+','+(y+gap)+' L'+(x+w)+','+(y+gap));
  cWire(g,'M'+(x-w*0.62)+','+(y+gap+4)+' L'+(x+w*0.62)+','+(y+gap+4));
  cWire(g,'M'+(x-w*0.28)+','+(y+gap+8)+' L'+(x+w*0.28)+','+(y+gap+8));
  return g;
}
function cSrcV(parent,x,y,r,o){
  o=o||{};
  var g=S('g',null,parent);
  CIRC(g,x,y,r,{fill:'#fff',stroke:'#1f1f1f','stroke-width':1.6});
  if(o.type==='i'){
    LINE(g,x,y-r+5,x,y+r-5,{stroke:'#1f1f1f','stroke-width':1.5});
    ARROW(g,x,y+r-11,x,y-r+6,{stroke:'#1f1f1f',w:1.5});
  }else{
    LINE(g,x-4,y-r+3,x+4,y-r+3,{stroke:'#1f1f1f','stroke-width':1.6});
    LINE(g,x,y-r+3,x,y-r+11,{stroke:'#1f1f1f','stroke-width':1.6});
    LINE(g,x-4,y+r-3,x+4,y+r-3,{stroke:'#1f1f1f','stroke-width':1.6});
  }
  if(o.label) TXT(g,x,y-r-14,o.label,{'text-anchor':'middle','font-size':13,fill:o.lc||'#333'});
  return g;
}
function cDot(parent,x,y,attrs){ return CIRC(parent,x,y,2.6,Object.assign({fill:'#1f1f1f'},attrs||{})); }
function cLab(parent,x,y,str,attrs){
  var a={'font-size':13,fill:'#333'}; if(attrs) for(var k in attrs) a[k]=attrs[k];
  return TXT(parent,x,y,str,a);
}
function vert(g,cx,cy){ g.setAttribute('transform','rotate(90 '+cx+' '+cy+')'); return g; }
/* ---------------- 数值 ---------------- */
function LCG(seed){ this.s=(seed>>>0)||1; }
LCG.prototype.next=function(){ this.s=(this.s*1664525+1013904223)>>>0; return this.s/4294967296; };
LCG.prototype.normal=function(){
  var u=this.next(); while(u<=1e-12) u=this.next();
  var v=this.next(); while(v<=1e-12) v=this.next();
  return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);
};
function fx(x,d){ if(!isFinite(x)) return '—';
  var p=Math.pow(10,d); return (Math.round(x*p)/p).toFixed(d); }
function sig(x,d){ if(x===0) return '0'; if(!isFinite(x)) return '—';
  var a=Math.abs(x), e=Math.floor(Math.log10(a));
  var m=a/Math.pow(10,e);
  return m.toFixed(d===undefined?3:d)+'×10'+sup(e);
}
function sup(n){
  var map={'-':'⁻','0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹'};
  return String(n).split('').map(function(c){return map[c]||c;}).join('');
}
function eng(x,d){ // 工程计数：1.23 k / 4.56 M
  if(x===0) return '0'; if(!isFinite(x)) return '—';
  var a=Math.abs(x), e=Math.floor(Math.log10(a)/3)*3;
  var u={'0':'','3':'k','6':'M','9':'G','-3':'m','-6':'µ','-9':'n'}[String(e)];
  // 注意：不能用 || 取单位 —— e = 0 时单位是空串 ''，属有效值，
  // 用 || 会被当成缺省而落到 '10^0'，读数就会显示成「400.000 10^0」。
  if(u===undefined) u='10^'+e;
  return (x/Math.pow(10,e)).toFixed(d===undefined?3:d)+' '+u;
}
function dB(x){ return 20*Math.log10(Math.abs(x)); }
function ticks(a,b,n){
  if(a===b){a-=1;b+=1;}
  var span=b-a, raw=span/Math.max(1,n), mag=Math.pow(10,Math.floor(Math.log10(raw))), norm=raw/mag, step;
  if(norm<1.5) step=1*mag; else if(norm<3) step=2*mag; else if(norm<7) step=5*mag; else step=10*mag;
  // 用整数倍 k*step 累加以避免浮点漂移（如 0.2 累加得到 0.6000000000000001）
  var dec=Math.max(0,-Math.floor(Math.log10(step))+2);
  var out=[], k=Math.ceil(a/step-1e-9);
  for(var i=0;i<400;i++,k++){
    var v=k*step;
    if(v>b+step*1e-6) break;
    out.push(Math.abs(v)<step*1e-9?0:+v.toFixed(dec));
  }
  return out;
}
/* ---------------- Canvas 绘图 ---------------- */
function mkPlot(id,o){
  var cv=$(id); if(!cv) return null;
  var dpr=window.devicePixelRatio||1;
  var W=o.w||780, H=o.h||400;
  cv.width=Math.round(W*dpr); cv.height=Math.round(H*dpr);
  var ctx=cv.getContext('2d'); ctx.setTransform(dpr,0,0,dpr,0,0);
  var P=Object.assign({l:64,r:22,t:24,b:48},o.pad||{});
  var pw=W-P.l-P.r, ph=H-P.t-P.b;
  var xmin=o.xmin,xmax=o.xmax,ymin=o.ymin,ymax=o.ymax;
  var logx=!!o.logx;
  var ax0=logx?Math.log(xmin):xmin, ax1=logx?Math.log(xmax):xmax;
  var X=function(x){
    var t=logx?Math.log(x):x;
    return P.l+(t-ax0)/(ax1-ax0)*pw;
  };
  var Y=function(y){return P.t+ph-(y-ymin)/(ymax-ymin)*ph;};
  var api={ctx:ctx,cv:cv,W:W,H:H,P:P,pw:pw,ph:ph,X:X,Y:Y,o:o};
  api.frame=function(){
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle='#fff'; ctx.fillRect(0,0,W,H);
    var xt=o.xticks||ticks(xmin,xmax,8), yt=o.yticks||ticks(ymin,ymax,6);
    ctx.strokeStyle='#e8e8e2'; ctx.lineWidth=1; ctx.beginPath();
    xt.forEach(function(v){ ctx.moveTo(Math.round(X(v))+0.5,P.t); ctx.lineTo(Math.round(X(v))+0.5,P.t+ph); });
    yt.forEach(function(v){ ctx.moveTo(P.l,Math.round(Y(v))+0.5); ctx.lineTo(P.l+pw,Math.round(Y(v))+0.5); });
    ctx.stroke();
    ctx.strokeStyle='#333'; ctx.lineWidth=1.3; ctx.beginPath();
    ctx.moveTo(P.l,P.t); ctx.lineTo(P.l,P.t+ph); ctx.lineTo(P.l+pw,P.t+ph); ctx.stroke();
    ctx.fillStyle='#555'; ctx.font='12px Consolas,monospace';
    ctx.textAlign='center'; ctx.textBaseline='top';
    xt.forEach(function(v){ ctx.fillText(o.xfmt?o.xfmt(v):String(v), X(v), P.t+ph+7); });
    ctx.textAlign='right'; ctx.textBaseline='middle';
    yt.forEach(function(v){ ctx.fillText(o.yfmt?o.yfmt(v):String(v), P.l-9, Y(v)); });
    ctx.fillStyle='#333'; ctx.font='13px "Microsoft YaHei",sans-serif';
    if(o.xlabel){ ctx.textAlign='center'; ctx.textBaseline='bottom'; ctx.fillText(o.xlabel, P.l+pw/2, H-5); }
    if(o.ylabel){ ctx.save(); ctx.translate(15,P.t+ph/2); ctx.rotate(-Math.PI/2);
      ctx.textAlign='center'; ctx.textBaseline='top'; ctx.fillText(o.ylabel,0,0); ctx.restore(); }
    api.xt=xt; api.yt=yt;
  };
  api.curve=function(fn,color,opts){
    var o2=opts||{}, N=o2.n||600, started=false;
    ctx.strokeStyle=color||'#1a46b5'; ctx.lineWidth=o2.w||2;
    ctx.setLineDash(o2.dash||[]); ctx.beginPath();
    for(var i=0;i<=N;i++){
      var x=logx ? xmin*Math.pow(xmax/xmin,i/N) : xmin+(xmax-xmin)*i/N, y=fn(x);
      if(y===null||y===undefined||!isFinite(y)){ started=false; continue; }
      var px=X(x), py=Y(y);
      if(!started){ ctx.moveTo(px,py); started=true; } else { ctx.lineTo(px,py); }
    }
    ctx.stroke(); ctx.setLineDash([]);
  };
  api.hline=function(y,color,dash,label){
    ctx.strokeStyle=color||'#999'; ctx.lineWidth=1.2; ctx.setLineDash(dash||[4,4]);
    ctx.beginPath(); ctx.moveTo(P.l,Math.round(Y(y))+0.5); ctx.lineTo(P.l+pw,Math.round(Y(y))+0.5); ctx.stroke(); ctx.setLineDash([]);
    if(label){ ctx.fillStyle=color||'#666'; ctx.font='12px "Microsoft YaHei",sans-serif';
      ctx.textAlign='left'; ctx.textBaseline='bottom'; ctx.fillText(label, P.l+4, Y(y)-3); }
  };
  api.vline=function(x,color,dash,label){
    ctx.strokeStyle=color||'#999'; ctx.lineWidth=1.2; ctx.setLineDash(dash||[4,4]);
    ctx.beginPath(); ctx.moveTo(Math.round(X(x))+0.5,P.t); ctx.lineTo(Math.round(X(x))+0.5,P.t+ph); ctx.stroke(); ctx.setLineDash([]);
    if(label){ ctx.fillStyle=color||'#666'; ctx.font='12px "Microsoft YaHei",sans-serif';
      ctx.textAlign='center'; ctx.textBaseline='top'; ctx.fillText(label, X(x), P.t+2); }
  };
  api.dot=function(x,y,color,r){
    ctx.fillStyle=color||'#c02020'; ctx.beginPath(); ctx.arc(X(x),Y(y),r||3.5,0,2*Math.PI); ctx.fill();
  };
  api.text=function(x,y,str,attrs){
    var a=Object.assign({x:X(x),y:Y(y),fill:'#333','font-size':12},attrs||{});
    ctx.fillStyle=a.fill; ctx.font=(a['font-size']||12)+'px '+(a.font||'"Microsoft YaHei",sans-serif');
    ctx.textAlign=a.align||'left'; ctx.textBaseline=a.base||'alphabetic';
    ctx.fillText(str,a.x,a.y);
  };
  api.shadeX=function(x1,x2,color){
    ctx.fillStyle=color||'rgba(26,70,181,.09)';
    ctx.fillRect(X(Math.min(x1,x2)),P.t,Math.abs(X(x2)-X(x1)),ph);
  };
  api.shadeY=function(y1,y2,color){
    ctx.fillStyle=color||'rgba(26,70,181,.09)';
    var ya=Y(Math.max(y1,y2)), yb=Y(Math.min(y1,y2));
    ctx.fillRect(P.l,ya,pw,Math.abs(yb-ya));
  };
  api.area=function(fn,x1,x2,color){
    ctx.fillStyle=color||'rgba(192,32,32,.16)'; ctx.beginPath();
    ctx.moveTo(X(x1),Y(ymin));
    var N=400, started=false;
    for(var i=0;i<=N;i++){
      var x=x1+(x2-x1)*i/N, y=fn(x);
      if(y===null||y===undefined||!isFinite(y)) continue;
      var px=X(x),py=Y(y);
      if(!started){ ctx.lineTo(px,py); started=true; } else ctx.lineTo(px,py);
    }
    ctx.lineTo(X(x2),Y(ymin)); ctx.closePath(); ctx.fill();
  };
  api.legend=function(items,x,y){
    ctx.font='12.5px "Microsoft YaHei",sans-serif'; ctx.textAlign='left'; ctx.textBaseline='middle';
    var px=x===undefined?P.l+12:x, py=y===undefined?P.t+14:y;
    items.forEach(function(it,i){
      ctx.strokeStyle=it.c; ctx.lineWidth=it.w||2.5; ctx.setLineDash(it.dash||[]);
      ctx.beginPath(); ctx.moveTo(px,py+i*19); ctx.lineTo(px+22,py+i*19); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle='#333'; ctx.fillText(it.t,px+28,py+i*19);
    });
  };
  return api;
}
function bindRange(id,cb,fmtf){
  var el=$(id); if(!el) return;
  var out=$(id+'_v');
  function upd(){ var v=parseFloat(el.value); if(out) out.textContent=fmtf?fmtf(v):v; if(cb) cb(v); }
  el.addEventListener('input',upd); upd();
}
function setText(id,v){ var e=$(id); if(e) e.textContent=v; }
/* ---------------------------------------------------------------------------
 * subHtml(str) —— 把「X_y」渲染成教材式真下标后再写进 HTML 文本节点
 *
 * 为什么需要它：页面里有一部分标签是**运行时生成**的（读数面板的键名、
 * 动态说明文字），源级改写碰不到它们；不处理的话，同一页里静态正文是真下标、
 * 动态标签还是下划线式，观感不一致。
 *
 * ⚠ 两条约束：
 *   ① **只用于固定标签字符串**，不接受用户输入（它会写 innerHTML）；
 *   ② 下划线以零宽 span 保留 → textContent 逐字不变，
 *      页末自检里按字面串比对 document.body.textContent 的断言不受影响。
 *
 * 用法：el.innerHTML = subHtml('r_b′e = ');
 * -------------------------------------------------------------------------- */
function subHtml(str){
  if(str===undefined||str===null) return '';
  str=String(str);
  if(str.indexOf('_')<0) return str;
  if(typeof CourseSubscript==='undefined'||!CourseSubscript.subHtml) return str;
  return CourseSubscript.subHtml(str);
}
