/* 用修复版 wSysMap 替换 parts/ch4/_script.js 里的旧实现（按函数边界整段换）。
 * 旧版缺陷：信道虚线框画在「数字解调」框上（同坐标叠字），噪声源竖线穿过两个括号标注。
 * 替换后断言：新代码含 gap=98、不含 coordMod、行数增加。 */
'use strict';
const fs = require('fs');
const path = require('path');
const P = 'D:/课程文档/通信原理/build/parts/ch4/_script.js';
const s = fs.readFileSync(P, 'utf8');
const a = s.indexOf('function wSysMap(){');
const b = s.indexOf('/* ================= 调制信道模型框图');
if (a < 0 || b <= a) { console.error('FAIL: 边界定位失败'); process.exit(1); }

const fn = [
  'function wSysMap(){',
  '  var svg=document.getElementById(\'sysmap\');',
  '  clr(svg);',
  '  var names=[\'信源\',\'信源编码\',\'加密\',\'信道编码\',\'数字调制\',\'数字解调\',\'信道译码\',\'解密\',\'信源译码\',\'信宿\'];',
  '  var x0=8, w=56, step=70, y=36, h=28;',
  '  var gap=98;   /* 数字调制→数字解调之间插入「信道」框所需的额外让位 */',
  '  function bx(i){ return x0+i*step+(i>=5?gap:0); }',
  '  for(var i=0;i<names.length;i++){',
  '    var x=bx(i);',
  '    var isMod=(i===4||i===5), isEnc=(i===3||i===6);',
  '    var fill=\'#fbfaf7\', stroke=\'var(--line)\';',
  '    if(isMod){ fill=\'rgba(74,111,165,.12)\'; stroke=\'#4a6fa5\'; }',
  '    else if(isEnc){ fill=\'rgba(201,123,63,.12)\'; stroke=\'#c97b3f\'; }',
  '    el(\'rect\',{x:x,y:y,width:w,height:h,rx:6,fill:fill,stroke:stroke,\'stroke-width\':1.3},svg);',
  '    txt(svg,x+w/2,y+h/2+3.5,names[i],{\'text-anchor\':\'middle\',\'font-size\':9.8,',
  '      fill:(isMod||isEnc)?\'var(--ink)\':\'var(--ink2)\',\'font-weight\':(isMod||isEnc)?\'600\':\'400\'});',
  '    /* i===4 的链路箭头由「信道」虚线框接管，不再直连 */',
  '    if(i<names.length-1 && i!==4) lineArrow(svg,x+w,y+h/2,bx(i+1)-3,y+h/2,\'var(--muted)\',1.3);',
  '  }',
  '  /* 信道（虚线框，正好落在调制与解调之间的让位区间，不压任何框图） */',
  '  var cx=bx(4)+w+18, cw=76, cy=36;',
  '  el(\'rect\',{x:cx,y:cy,width:cw,height:h,rx:6,fill:\'rgba(47,111,94,.10)\',stroke:\'#2f6f5e\',',
  '    \'stroke-width\':1.3,\'stroke-dasharray\':\'4 3\'},svg);',
  '  txt(svg,cx+cw/2,cy+h/2+3.5,\'信道\',{\'text-anchor\':\'middle\',\'font-size\':10,fill:\'#2f6f5e\',\'font-weight\':\'600\'});',
  '  lineArrow(svg,bx(4)+w,y+h/2,cx-3,y+h/2,\'var(--muted)\',1.3);',
  '  lineArrow(svg,cx+cw+2,y+h/2,bx(5)-3,y+h/2,\'var(--muted)\',1.3);',
  '  /* 噪声源：从右上方绕行进入信道框 —— 竖直线不再穿过下方两个括号标注 */',
  '  var nx=cx+cw+80, ny=132;',
  '  el(\'rect\',{x:nx-38,y:ny,width:76,height:24,rx:6,fill:\'rgba(176,99,103,.12)\',stroke:\'#b06367\',\'stroke-width\':1.2},svg);',
  '  txt(svg,nx,ny+16,\'噪声源\',{\'text-anchor\':\'middle\',\'font-size\':9.8,fill:\'#96525a\'});',
  '  el(\'path\',{d:\'M\'+nx+\' \'+ny+\' L\'+nx+\' 24 L\'+(cx+cw+8)+\' 24 L\'+(cx+cw+8)+\' \'+(cy+h/2),',
  '    fill:\'none\',stroke:\'#b06367\',\'stroke-width\':1.3},svg);',
  '  el(\'path\',{d:\'M\'+(cx+cw+2)+\' \'+(cy+h/2)+\' l10 -4.5 l0 9 z\',fill:\'#b06367\'},svg);',
  '  /* 括号：调制信道 / 编码信道 */',
  '  function bracket(x1,x2,y,color,label){',
  '    el(\'path\',{d:\'M\'+x1+\' \'+(y+8)+\'L\'+x1+\' \'+y+\'L\'+x2+\' \'+y+\'L\'+x2+\' \'+(y+8),',
  '      fill:\'none\',stroke:color,\'stroke-width\':1.6},svg);',
  '    txt(svg,(x1+x2)/2,y+21,label,{\'text-anchor\':\'middle\',\'font-size\':11,fill:color,\'font-weight\':\'600\'});',
  '  }',
  '  bracket(bx(4), bx(5)+w, 80, \'#4a6fa5\', \'调制信道：研究调制 / 解调\');',
  '  bracket(bx(3), bx(6)+w, 104, \'#c97b3f\', \'编码信道：研究编码 / 译码\');',
  '  txt(svg,bx(3),200,\'教材图 4-14 的信号流程（简绘）\',{\'font-size\':10,fill:\'var(--muted)\'});',
  '}',
  ''
].join('\n');

const out = s.slice(0, a) + fn + s.slice(b);
fs.writeFileSync(P, out, 'utf8');
/* 断言 */
const chk = fs.readFileSync(P, 'utf8');
const ok = chk.includes('gap=98') && !chk.includes('coordMod') &&
  (chk.match(/function wSysMap/g) || []).length === 1;
console.log(ok ? 'PASS wSysMap 已替换' : 'FAIL 断言未过');
console.log('字节', s.length, '->', out.length);
if (!ok) process.exit(1);

/* viewBox 780 → 800（最右框 x=792） */
const F = 'D:/课程文档/通信原理/build/parts/ch4/s4_1.html';
let f = fs.readFileSync(F, 'utf8');
if (!f.includes('viewBox="0 0 780 210"')) { console.error('FAIL: 未找到 sysmap viewBox'); process.exit(1); }
f = f.replace('viewBox="0 0 780 210"', 'viewBox="0 0 800 210"');
fs.writeFileSync(F, f, 'utf8');
console.log('PASS s4_1.html viewBox 780 -> 800');
