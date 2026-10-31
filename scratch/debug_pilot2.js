/* 插桩：按 check.js 的两段执行顺序复现，打印 __CH 与 sysmap 状态 */
'use strict';
const fs = require('fs');
const path = require('path');
const { prepare, execScripts, execScriptsOneScope } = require('../build/check.js');
const frag = path.join(__dirname, '..', 'build', 'parts', 'ch4', 's4_1.html');

const ctx = prepare(frag);
console.log('scripts:', ctx.scripts.length);
/* 手动复现 execScripts 的两段 */
const lib = fs.readFileSync(path.join(__dirname, '..', 'build', 'lib.js'), 'utf8');
const ch = fs.readFileSync(path.join(__dirname, '..', 'build', 'parts', 'ch4', '_script.js'), 'utf8');
const prefix = lib + '\n' + ch + '\n';

/* 段1：warm-up */
new Function('document', 'window', 'console', prefix)(ctx.doc, ctx.win, console);
console.log('warm-up 后 window.__CH =', typeof ctx.win.__CH);

/* 段2：片段（带 self-check，先看 wSysMap 是否画了） */
const probe = [
  'window.__CH.wSysMap();',
  'console.log("probe children:", document.getElementById("sysmap").children.length);',
  'console.log("probe childNodes:", (document.getElementById("sysmap").childNodes||[]).length);'
].join('\n');
try {
  new Function('document', 'window', 'console', prefix + probe)(ctx.doc, ctx.win, console);
} catch (e) {
  console.log('probe 异常:', e.message, '\n', (e.stack || '').split('\n').slice(0, 4).join('\n'));
}
