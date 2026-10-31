/* 定位试点片段脚本的运行时异常：复现 check.js 的拼接执行并打印出错行上下文。 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = 'D:/课程文档/通信原理/build';
const lib = fs.readFileSync(path.join(ROOT, 'lib.js'), 'utf8');
const ch = fs.readFileSync(path.join(ROOT, 'parts/ch4/_script.js'), 'utf8');
const frag = fs.readFileSync(path.join(ROOT, 'parts/ch4/s4_1.html'), 'utf8');
const m = [...frag.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)];
console.log('片段 script 段数:', m.length);
const code = lib + '\n' + ch + '\n' + m.map(x => x[1]).join('\n');
const lines = code.split(/\r?\n/);
try {
  new Function('document', 'window', 'console', code)(makeDoc(), makeWin(), console);
  console.log('执行成功');
} catch (e) {
  console.log('异常:', e.message);
  const st = (e.stack || '').split('\n').slice(0, 6);
  st.forEach(l => console.log('  ' + l));
  const mm = /<anonymous>:(\d+):(\d+)/.exec(e.stack || '');
  if (mm) {
    const ln = +mm[1];
    console.log('--- 出错行 ' + ln + ' 上下文 ---');
    for (let i = Math.max(0, ln - 8); i < Math.min(lines.length, ln + 4); i++) {
      console.log((i + 1 === ln ? '>>' : '  ') + (i + 1) + ': ' + lines[i]);
    }
  }
}
function makeDoc() {
  const els = {};
  const mk = (tag, id) => ({
    tagName: (tag || 'div').toUpperCase(), id: id || '', value: '', style: {}, children: [],
    attributes: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    _listeners: {},
    appendChild(c) { this.children.push(c); c._parent = this; return c; },
    removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); return c; },
    setAttribute(k, v) { this.attributes[k] = v; },
    getAttribute(k) { return this.attributes[k]; },
    addEventListener(ev, fn) { (this._listeners[ev] = this._listeners[ev] || []).push(fn); },
    dispatchEvent(ev) { (this._listeners[ev.type] || []).forEach(f => f.call(this, { type: ev.type, target: this })); },
    querySelector: () => null, querySelectorAll: () => [],
    getBoundingClientRect: () => ({ top: 0, left: 0, width: 780, height: 400, bottom: 400, right: 780 }),
    getContext: () => new Proxy({}, { get: () => () => ({ addColorStop() {} }), set: () => true }),
    focus() {}, click() {}
  });
  const doc = {
    title: '', body: mk('body'), documentElement: mk('html'),
    getElementById(id) { if (!els[id]) els[id] = mk('div', id); return els[id]; },
    createElement: t => mk(t), createElementNS: (ns, t) => mk(t), createTextNode: t => ({ textContent: t }),
    querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, removeEventListener() {}
  };
  return doc;
}
function makeWin() {
  const win = {
    devicePixelRatio: 2, innerWidth: 1280, innerHeight: 900,
    addEventListener() {}, removeEventListener() {}, requestAnimationFrame: fn => setTimeout(fn, 0),
    getComputedStyle: () => ({}),
    Math, Date, JSON, console, isNaN, isFinite, parseFloat, parseInt, Number, String, Object, Array, Error, Promise, Set, Map, RegExp
  };
  win.window = win; win.self = win; win.globalThis = win;
  return win;
}
