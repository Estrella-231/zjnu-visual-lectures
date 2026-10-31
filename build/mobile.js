/* ============================================================================
   移动端适配运行时（build/mobile.js，由 build.js 内联进每个页面）
   ----------------------------------------------------------------------------
   做四件事，全部只在「窄屏 / 宽图」条件下触发，桌面端页面行为不变：

     ① 宽图横滑：viewBox 宽 > 视口宽的 SVG → 包进 .fig 横滑容器，
        并按 1:1（宽度 = viewBox 宽）渲染 → 图内标注不再被压成 3~5px。
        视口变宽（图能完整放下）时自动拆包还原。
     ② 表格横滑：没被 .tbl-wrap 包住的表格自动包上（沿用章节已有约定）。
     ③ 点图灯箱：点图（或提示条上的「放大」）→ 全屏查看，支持
        双指缩放 / 拖动平移 / 双击放大 / 键盘 Esc 关闭。
        交互型 SVG（带 data-* 热区的）不劫持点击，避免破坏页面原有交互。
     ④ 离线缓存：注册 service worker（需通过 http(s) 访问，file:// 会跳过）。

   ⚠ 本脚本在离线桩 DOM 里也必须**不抛异常**：桩不支持 querySelectorAll，
     断言会返回空数组，所有分支都要能安全退化。
   ========================================================================== */
(function () {
  'use strict';
  if (typeof document === 'undefined' || !document.addEventListener) return;

  var EPS = 4;              /* 视口比较容差（px） */
  var RESIZE_MS = 200;      /* resize 防抖 */
  var FIG_MIN_W = 200;      /* 小于这个宽度的是图标，不当图处理 */
  var FIG_MIN_H = 110;

  /* ------------------------- 小工具 ------------------------- */
  function vbSize(svg) {
    if (!svg.getAttribute) return { w: 0, h: 0 };
    var vb = svg.getAttribute('viewBox');
    if (!vb) return { w: 0, h: 0 };
    var p = vb.trim().split(/\s+/);
    if (p.length < 4) return { w: 0, h: 0 };
    var w = parseFloat(p[2]), h = parseFloat(p[3]);
    if (!isFinite(w) || !isFinite(h)) return { w: 0, h: 0 };
    return { w: w, h: h };
  }
  function isFigure(svg) {
    var s = vbSize(svg);
    return s.w >= FIG_MIN_W && s.h >= FIG_MIN_H;
  }
  /* 页面里带 data-* 的 SVG 是交互图（有热区），不能劫持它的点击 */
  function hasHotspot(svg) {
    if (!svg.querySelectorAll) return false;
    var els = svg.querySelectorAll('*');
    for (var i = 0; i < els.length; i++) {
      var a = els[i].attributes;
      if (!a) continue;
      for (var j = 0; j < a.length; j++) {
        if (a[j].name && a[j].name.indexOf('data-') === 0) return true;
      }
    }
    return false;
  }
  /* ⚠ 旧章节整页的交互图用的是**内联事件属性**（onclick / onmousedown …），
     不是 data-* 热区 —— 只判 data-* 会让灯箱抢走它们的点击，
     页面本来能用的交互就没了。这里把内联事件属性也算作「交互图」标记。 */
  function hasInlineHandler(svg) {
    if (!svg.querySelectorAll) return false;
    var els = svg.querySelectorAll('*');
    for (var i = 0; i < els.length; i++) {
      var a = els[i].attributes;
      if (!a) continue;
      for (var j = 0; j < a.length; j++) {
        var n = a[j].name ? a[j].name.toLowerCase() : '';
        if (n && n.indexOf('on') === 0 && n.length > 2) return true;
      }
    }
    return false;
  }
  /* 是不是「交互图」—— 两种标记都算：data-* 热区 / 内联事件属性 */
  function isInteractive(svg) {
    return hasHotspot(svg) || hasInlineHandler(svg);
  }
  function viewportWidth() {
    var d = document.documentElement;
    return (d && d.clientWidth) ? d.clientWidth : (window.innerWidth || 0);
  }

  /* ------------------------- ① 宽图横滑 ------------------------- */
  function layoutFigures() {
    if (!document.querySelectorAll) return;
    var vw = viewportWidth();
    var svgs = document.querySelectorAll('svg');
    for (var i = 0; i < svgs.length; i++) {
      var s = svgs[i];
      var size = vbSize(s);
      if (!size.w) continue;
      if (!isFigure(s)) continue;

      if (size.w > vw + EPS) {
        if (!s.__mvis) {
          var origParent = s.parentNode;
          var wrap = document.createElement('div');
          wrap.className = 'figwrap';
          var box = document.createElement('div');
          box.className = 'fig';
          var hint = document.createElement('div');
          hint.className = 'fighint';

          var tip = document.createElement('span');
          tip.textContent = '← 左右滑动查看完整图形 · 点图可全屏放大 →';
          hint.appendChild(tip);

          var btn = document.createElement('button');
          btn.type = 'button';
          btn.textContent = '全屏放大';
          btn.setAttribute('data-mvis', 'zoom');
          hint.appendChild(btn);

          origParent.insertBefore(wrap, s);
          wrap.appendChild(box);
          box.appendChild(s);
          wrap.appendChild(hint);

          s.__mvis = { wrap: wrap, box: box, hint: hint, parent: origParent, btn: btn };
        }
        var f = s.__mvis;
        s.style.width = size.w + 'px';
        s.style.height = 'auto';
        /* ⚠ 容器本身保持自适应宽度（= 视口内可用宽），
           只让**内容**（SVG）宽到 viewBox 宽 —— 容器横向滚动，
           否则容器自己就撑宽到 800px，把整页顶出横向滚动条。 */
        f.box.style.width = '';
        f.wrap.className = 'figwrap' +
          (f.box.scrollWidth > f.box.clientWidth + 1 ? ' is-scroll' : '');
      } else if (s.__mvis) {
        /* 视口够宽 → 拆包还原 */
        var g = s.__mvis;
        s.style.width = '';
        s.style.height = '';
        g.parent.insertBefore(s, g.wrap);
        if (g.wrap.parentNode) g.wrap.parentNode.removeChild(g.wrap);
        s.__mvis = null;
      }
    }
  }

  /* ------------------------- ② 表格横滑 ------------------------- */
  function layoutTables() {
    if (!document.querySelectorAll) return;
    var ts = document.querySelectorAll('table');
    for (var i = 0; i < ts.length; i++) {
      var t = ts[i];
      var p = t.parentNode;
      if (p && p.className && String(p.className).indexOf('tbl-wrap') >= 0) continue;
      /* ⚠ 父节点已经是横向滚动容器（如发布期加固加的 .pub-tw）→
         再包一层会出现「嵌套滚动条」，横向滑动手感变差。跳过。 */
      if (p && p.nodeType === 1) {
        try {
          var ox = window.getComputedStyle(p).overflowX;
          if (ox === 'auto' || ox === 'scroll') continue;
        } catch (e) { }
      }
      var d = document.createElement('div');
      d.className = 'tbl-wrap';
      p.insertBefore(d, t);
      d.appendChild(t);
    }
  }

  /* ------------------------- ③ 点图灯箱 ------------------------- */
  function initLightbox() {
    if (document.getElementById('mvis-lb')) return;
    var lb = document.createElement('div');
    lb.id = 'mvis-lb';
    lb.className = 'mvis-lb';
    lb.innerHTML =
      '<div class="mvis-lb-stage">' +
        '<button class="mvis-lb-x" type="button" data-mvis="close">✕</button>' +
        '<div class="mvis-lb-zoom"></div>' +
      '</div>' +
      '<div class="mvis-lb-bar">' +
        '<button type="button" data-mvis="out">−</button>' +
        '<button type="button" data-mvis="in">＋</button>' +
        '<button type="button" data-mvis="reset">复位</button>' +
        '<button type="button" data-mvis="close">关闭</button>' +
        '<span class="mvis-lb-tip">双指缩放 · 拖动平移 · 双击放大</span>' +
      '</div>';
    document.body.appendChild(lb);

    var stage = lb.querySelector('.mvis-lb-stage');
    var zoom = lb.querySelector('.mvis-lb-zoom');
    var k = 1, tx = 0, ty = 0;
    var pinch = null, pan = null, lastTap = 0;

    function apply() {
      zoom.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + k + ')';
    }
    function reset() { k = 1; tx = 0; ty = 0; apply(); }
    function clampK(v) { return Math.max(1, Math.min(8, v)); }

    function open(svg) {
      if (!svg) return;
      zoom.innerHTML = '';
      var c = svg.cloneNode(true);
      if (c.removeAttribute) c.removeAttribute('id');
      c.style.width = '100%';
      c.style.height = '100%';
      c.style.maxWidth = 'none';
      c.style.maxHeight = 'none';
      c.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      zoom.appendChild(c);
      reset();
      lb.className = 'mvis-lb on';
      document.documentElement.style.overflow = 'hidden';
    }
    function close() {
      lb.className = 'mvis-lb';
      zoom.innerHTML = '';
      document.documentElement.style.overflow = '';
    }
    function zoomBy(f) {
      k = clampK(k * f);
      if (k <= 1.0001) { tx = 0; ty = 0; }
      apply();
    }

    lb.addEventListener('click', function (e) {
      var t = e.target;
      var act = t && t.getAttribute ? t.getAttribute('data-mvis') : null;
      if (act === 'in') { zoomBy(1.25); return; }
      if (act === 'out') { zoomBy(1 / 1.25); return; }
      if (act === 'reset') { reset(); return; }
      if (act === 'close') { close(); return; }
      if (t === stage) close();          /* 点空白处关闭 */
    });

    /* 双指缩放 */
    function dist(t) {
      var dx = t[0].clientX - t[1].clientX, dy = t[0].clientY - t[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    }
    stage.addEventListener('touchstart', function (e) {
      if (e.touches.length === 2) {
        pinch = { d: dist(e.touches), k: k };
        pan = null;
      } else if (e.touches.length === 1) {
        pan = { x: e.touches[0].clientX, y: e.touches[0].clientY, tx: tx, ty: ty };
      }
    }, { passive: true });
    stage.addEventListener('touchmove', function (e) {
      if (e.touches.length === 2 && pinch) {
        var d = dist(e.touches);
        if (pinch.d > 0) { k = clampK(pinch.k * d / pinch.d); apply(); }
        e.preventDefault();
      } else if (e.touches.length === 1 && pan && k > 1) {
        tx = pan.tx + (e.touches[0].clientX - pan.x);
        ty = pan.ty + (e.touches[0].clientY - pan.y);
        apply();
        e.preventDefault();
      }
    }, { passive: false });
    stage.addEventListener('touchend', function () { pinch = null; pan = null; });

    /* 桌面：滚轮缩放 / 拖动平移 / 双击放大 */
    stage.addEventListener('wheel', function (e) {
      e.preventDefault();
      zoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12);
    }, { passive: false });
    stage.addEventListener('mousedown', function (e) {
      pan = { x: e.clientX, y: e.clientY, tx: tx, ty: ty };
      stage.style.cursor = 'grabbing';
    });
    window.addEventListener('mouseup', function () { pan = null; stage.style.cursor = ''; });
    stage.addEventListener('mousemove', function (e) {
      if (!pan || k <= 1) return;
      tx = pan.tx + (e.clientX - pan.x);
      ty = pan.ty + (e.clientY - pan.y);
      apply();
    });
    stage.addEventListener('click', function (e) {
      var now = Date.now();
      if (now - lastTap < 320) { k = k > 1.5 ? 1 : 2.2; if (k === 1) { tx = 0; ty = 0; } apply(); }
      lastTap = now;
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close();
    });

    /* 页面里的图 → 点开 */
    document.addEventListener('click', function (e) {
      if (/\bon\b/.test(lb.className)) return;   /* 灯箱已开着，别把点击放大后的图重新打开 */
      var el = e.target;
      if (!el || !el.closest) return;
      var svg = el.closest('svg');
      if (!svg || !isFigure(svg)) return;
      if (isInteractive(svg)) return;        /* 交互图（data-* 热区 / 内联 onclick）不劫持 */
      open(svg);
    });
    return { open: open, close: close };
  }

  /* ------------------------- 启动 ------------------------- */
  function boot() {
    try {
      layoutTables();
      layoutFigures();
      var lb = initLightbox();
      /* 提示条上的「放大」按钮 */
      document.addEventListener('click', function (e) {
        var el = e.target;
        if (!el || !el.getAttribute) return;
        if (el.getAttribute('data-mvis') !== 'zoom') return;
        var wrap = el.closest ? el.closest('.figwrap') : null;
        if (!wrap || !lb) return;
        var svg = wrap.querySelector('svg');
        if (svg) lb.open(svg);
      });
    } catch (e) {
      if (window.console && console.log) console.log('[mvis] 跳过：' + e.message);
    }
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(boot, 0);
  } else {
    document.addEventListener('DOMContentLoaded', boot);
  }

  /* resize（转屏 / 窗口变化）后重排 */
  var rt = null;
  window.addEventListener('resize', function () {
    if (rt) clearTimeout(rt);
    rt = setTimeout(function () { try { layoutFigures(); } catch (e) { } }, RESIZE_MS);
  });

  /* ------------------------- ④ 离线缓存 ------------------------- */
  if (typeof navigator !== 'undefined' && navigator.serviceWorker && typeof location !== 'undefined') {
    if (location.protocol === 'http:' || location.protocol === 'https:') {
      window.addEventListener('load', function () {
        try {
          navigator.serviceWorker.register('sw.js').catch(function () { });
        } catch (e) { }
      });
    }
  }
})();
