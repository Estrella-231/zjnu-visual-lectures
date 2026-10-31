
(function(){
"use strict";
/* ================= 数学工具 ================= */
function erfc(x){
  var z=Math.abs(x), t=1/(1+0.5*z);
  var c=[1.00002368,0.37409196,0.09678418,-0.18628806,0.27886807,-1.13520398,1.48851587,-0.82215223,0.17087277];
  var res=c[8];
  for(var i=7;i>=0;i--) res=c[i]+t*res;
  var ans=t*Math.exp(-z*z-1.26551223+t*res);
  return x>=0?ans:2-ans;
}
function erf(x){ return 1-erfc(x); }
function lcg(seed){ this.s=(seed>>>0)||20261023; }
lcg.prototype.next=function(){ this.s=(this.s*1664525+1013904223)>>>0; return this.s/4294967296; };
lcg.prototype.gauss=function(){
  var u=this.next(); while(u<=1e-12)u=this.next();
  var v=this.next(); while(v<=1e-12)v=this.next();
  return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);
};

/* ================= SVG 工具 ================= */
var NS='http://www.w3.org/2000/svg';
function el(tag,attrs,parent){
  var e=document.createElementNS(NS,tag);
  if(attrs){for(var k in attrs){ if(k==='text') e.textContent=attrs[k]; else e.setAttribute(k,attrs[k]); }}
  if(parent) parent.appendChild(e);
  return e;
}
function clr(node){ while(node.firstChild) node.removeChild(node.firstChild); }
function txt(svg,x,y,s,attrs){
  var a={x:x,y:y,'font-size':11,fill:'var(--ink2)'};
  if(attrs) for(var k in attrs) a[k]=attrs[k];
  a.text=s;
  return el('text',a,svg);
}
function pathD(pts,close){
  var d='';
  for(var i=0;i<pts.length;i++) d+=(i?'L':'M')+pts[i][0].toFixed(2)+' '+pts[i][1].toFixed(2);
  return d+(close?'Z':'');
}
function frame(svg,box,xd,yd,xl,yl,opts){
  opts=opts||{};
  var X=function(v){return box.x+(v-xd[0])/(xd[1]-xd[0])*box.w;};
  var Y=function(v){return box.y+box.h-(v-yd[0])/(yd[1]-yd[0])*box.h;};
  el('rect',{x:box.x,y:box.y,width:box.w,height:box.h,fill:'#fbfaf7',stroke:'var(--line)',rx:8},svg);
  var xt=opts.xt||5, yt=opts.yt||5;
  var nx=Math.round((xd[1]-xd[0])/xt);
  for(var i=0;i<=nx;i++){
    var v=xd[0]+i*xt;
    var px=X(v);
    el('line',{x1:px,y1:box.y,x2:px,y2:box.y+box.h,stroke:'var(--line-soft)','stroke-width':1},svg);
    if(!opts.hideX)
      txt(svg,px,box.y+box.h+13,v.toFixed(opts.xdp===undefined?0:opts.xdp),
          {'text-anchor':'middle','font-size':10,fill:'var(--muted)'});
  }
  var ny=Math.round((yd[1]-yd[0])/yt);
  for(var j=0;j<=ny;j++){
    var w=yd[0]+j*yt;
    var py=Y(w);
    el('line',{x1:box.x,y1:py,x2:box.x+box.w,y2:py,stroke:'var(--line-soft)','stroke-width':1},svg);
    txt(svg,box.x-6,py+3.5,w.toFixed(opts.ydp===undefined?0:opts.ydp),
        {'text-anchor':'end','font-size':10,fill:'var(--muted)'});
  }
  if(xl) txt(svg,box.x+box.w,box.y+box.h+27,xl,{'text-anchor':'end','font-size':10.5,fill:'var(--muted)'});
  if(yl) txt(svg,box.x-6,box.y-8,yl,{'text-anchor':'start','font-size':10.5,fill:'var(--muted)'});
  return {X:X,Y:Y};
}
function legend(svg,x,y,items,fs){
  fs=fs||11;
  for(var i=0;i<items.length;i++){
    var it=items[i], yy=y+i*15;
    el('line',{x1:x,y1:yy,x2:x+18,y2:yy,stroke:it.c,'stroke-width':2.4,
      'stroke-dasharray':it.dash?it.dash:''},svg);
    txt(svg,x+24,yy+3.5,it.t,{'font-size':fs,fill:'var(--ink2)'});
  }
}
function fillRo(node,items){
  var html='';
  for(var i=0;i<items.length;i++)
    html+='<div class="ro"><div class="k">'+items[i][0]+'</div><div class="v">'+items[i][1]+'</div></div>';
  node.innerHTML=html;
}
function fmtE(x){
  if(x===0)return '0';
  if(x>=0.01&&x<1e4)return x.toPrecision(4);
  var e=Math.floor(Math.log10(Math.abs(x)));
  var m=x/Math.pow(10,e);
  return m.toFixed(3)+'e'+e;
}
function fmtN(x,d){ d=(d===undefined)?1:d; return x.toFixed(d); }
function dbm2w(dbm){ return Math.pow(10,dbm/10)*1e-3; }
function w2dbm(w){ return 10*Math.log10(w/1e-3); }
function db2lin(db){ return Math.pow(10,db/10); }

/* ================= W1 大气分层与传播方式 ================= */
var W1={mode:'ground'};
function w1yk(km){ return 330 - 295*Math.pow(km/400,0.6); }
function w1gy(x){ /* 右侧面板的地面二次曲线 */
  var t=(x-360)/400;
  if(t<0)t=0; if(t>1)t=1;
  var mt=1-t;
  return mt*mt*300 + 2*mt*t*250 + t*t*300;
}
function w1Draw(){
  var svg=document.getElementById('w1');
  clr(svg);

  /* ---- 左：大气分层 ---- */
  var x0=46, x1=132;
  var bands=[
    {a:0,b:10,name:'对流层',fill:'rgba(201,123,63,.13)',stroke:'#c97b3f',lab:'0 ~ 10 km'},
    {a:10,b:60,name:'平流层',fill:'rgba(74,111,165,.12)',stroke:'#4a6fa5',lab:'10 ~ 60 km'},
    {a:60,b:80,name:'D 层',fill:'rgba(176,99,103,.14)',stroke:'#b06367',lab:'60 ~ 80 km（吸收）'},
    {a:100,b:120,name:'E 层',fill:'rgba(47,111,94,.16)',stroke:'#2f6f5e',lab:'100 ~ 120 km（白天反射）'},
    {a:150,b:400,name:'F 层',fill:'rgba(47,111,94,.09)',stroke:'#2f6f5e',lab:'150 ~ 400 km（远距主力）'}
  ];
  for(var i=0;i<bands.length;i++){
    var b=bands[i];
    var ya=w1yk(b.a), yb=w1yk(b.b);
    el('rect',{x:x0,y:Math.min(ya,yb),width:x1-x0,height:Math.abs(yb-ya),
      fill:b.fill,stroke:b.stroke,'stroke-width':1.1},svg);
    txt(svg,x1+10,(ya+yb)/2+3.5,b.name,{'font-size':11.5,fill:'var(--ink)','font-weight':'600'});
    txt(svg,x1+10,(ya+yb)/2+17,b.lab,{'font-size':10,fill:'var(--muted)'});
  }
  el('line',{x1:x0-14,y1:330,x2:x0-14,y2:35,stroke:'var(--line)','stroke-width':1.4},svg);
  el('line',{x1:x0-19,y1:330,x2:x0-9,y2:330,stroke:'var(--line)','stroke-width':1.4},svg);
  var ticks=[0,10,60,100,150,200,400];
  for(var t=0;t<ticks.length;t++){
    var yy=w1yk(ticks[t]);
    el('line',{x1:x0-19,y1:yy,x2:x0-9,y2:yy,stroke:'var(--line)','stroke-width':1.2},svg);
    txt(svg,x0-23,yy+3.5,String(ticks[t]),{'text-anchor':'end','font-size':9.5,fill:'var(--muted)'});
  }
  txt(svg,x0-23,24,'km',{'text-anchor':'end','font-size':9.5,fill:'var(--muted)'});
  el('line',{x1:x0-6,y1:330,x2:x1+6,y2:330,stroke:'var(--ink)','stroke-width':2},svg);
  txt(svg,x1+6,347,'地面',{'font-size':10,fill:'var(--muted)'});

  /* ---- 右：传播路径 ---- */
  var g=el('g',{},svg);
  var gp=[];
  for(var q=0;q<=40;q++){ var xx=360+q*10; gp.push([xx,w1gy(xx)]); }
  el('path',{d:pathD(gp),fill:'none',stroke:'#c9c2b3','stroke-width':2.4},g);

  function antenna(x,color,h){
    var gy=w1gy(x);
    el('line',{x1:x,y1:gy,x2:x,y2:gy-(h||40),stroke:color,'stroke-width':2.2},g);
    el('circle',{cx:x,cy:gy-(h||40),r:3.2,fill:color},g);
    el('line',{x1:x-9,y1:gy,x2:x+9,y2:gy,stroke:color,'stroke-width':1.6},g);
    return gy-(h||40);
  }
  function arrow(x1,y1,x2,y2,color){
    var dx=x2-x1, dy=y2-y1, L=Math.sqrt(dx*dx+dy*dy);
    var ux=dx/L, uy=dy/L, px=-uy, py=ux;
    var bx=x2-ux*10, by=y2-uy*10;
    el('line',{x1:x1,y1:y1,x2:bx,y2:by,stroke:color,'stroke-width':2},g);
    el('path',{d:'M'+x2+' '+y2+'L'+(bx+px*4.4)+' '+(by+py*4.4)+'L'+(bx-px*4.4)+' '+(by-py*4.4)+'Z',
      fill:color,stroke:'none'},g);
  }

  var m=W1.mode;
  if(m==='ground'){
    var gp2=[];
    for(var q2=0;q2<=30;q2++){ var x2=410+q2*9; gp2.push([x2,w1gy(x2)-9]); }
    el('path',{d:pathD(gp2),fill:'none',stroke:'var(--c-ground)','stroke-width':3,
      'stroke-linecap':'round'},g);
    antenna(400,'var(--c-ground)',34);
    antenna(700,'var(--c-ground)',34);
    txt(svg,455,190,'地波沿地面绕射前进',{'font-size':12,fill:'var(--c-ground)','font-weight':'600'});
    txt(svg,455,207,'频率 < 2 MHz　距离：数百 ~ 数千米',{'font-size':10.5,fill:'var(--muted)'});
    txt(svg,455,224,'（低频、甚低频可达数千公里）',{'font-size':10.5,fill:'var(--muted)'});
  } else if(m==='sky'){
    el('rect',{x:380,y:108,width:360,height:14,fill:'rgba(47,111,94,.13)',stroke:'#2f6f5e',
      'stroke-width':1,'stroke-dasharray':'5 3'},g);
    txt(svg,690,100,'电离层 F',{'font-size':10.5,fill:'#2f6f5e','font-weight':'600'});
    var ya1=antenna(425,'var(--c-sky)',30), ya2=antenna(695,'var(--c-sky)',30);
    el('path',{d:'M425 '+(ya1+2)+'L560 115L695 '+(ya2+2),fill:'none',
      stroke:'var(--c-sky)','stroke-width':2.4},g);
    arrow(470,ya1-((ya1-115)/135)*45,470,ya1-((ya1-115)/135)*45-16,'var(--c-sky)');
    arrow(650,ya2-((ya2-115)/135)*45,650,ya2-((ya2-115)/135)*45-16,'var(--c-sky)');
    txt(svg,420,72,'天波被电离层反射',{'font-size':12,fill:'var(--c-sky)','font-weight':'600'});
    txt(svg,420,88,'频率 2 ~ 30 MHz　一跳 < 4000 km',{'font-size':10.5,fill:'var(--muted)'});
  } else if(m==='los'){
    var yl=200;
    el('line',{x1:400,y1:yl,x2:720,y2:yl,stroke:'var(--c-los)','stroke-width':3,
      'stroke-linecap':'round'},g);
    arrow(560,yl,600,yl,'var(--c-los)');
    antenna(395,'var(--c-los)',w1gy(395)-yl);
    antenna(725,'var(--c-los)',w1gy(725)-yl);
    el('rect',{x:380,y:86,width:360,height:12,fill:'rgba(201,123,63,.10)',stroke:'#c97b3f',
      'stroke-width':1,'stroke-dasharray':'4 4'},g);
    txt(svg,690,80,'电离层（被穿透）',{'font-size':10,fill:'#c97b3f'});
    txt(svg,420,62,'视线传播：近似光波作直线传播',{'font-size':12,fill:'var(--c-los)','font-weight':'600'});
    txt(svg,420,48,'频率 > 30 MHz　距离由天线高度决定',{'font-size':10.5,fill:'var(--muted)'});
  } else {
    var scx=560, scy=168;
    el('ellipse',{cx:scx,cy:scy,rx:70,ry:22,fill:'rgba(176,99,103,.18)',stroke:'var(--c-scatter)',
      'stroke-width':1.2,'stroke-dasharray':'4 3'},g);
    txt(svg,scx+76,scy+4,'有效散射区域',{'font-size':10.5,fill:'var(--c-scatter)'});
    var s1=antenna(420,'var(--c-scatter)',28), s2=antenna(700,'var(--c-scatter)',28);
    el('path',{d:'M420 '+s1+'L'+(scx-40)+' '+(scy+12)+'L'+(scx+40)+' '+(scy+12)+'L700 '+s2,
      fill:'rgba(176,99,103,.10)',stroke:'var(--c-scatter)','stroke-width':1.6},g);
    el('path',{d:'M420 '+s1+'L'+(scx+40)+' '+(scy+12),fill:'none',stroke:'var(--c-scatter)',
      'stroke-width':2,'stroke-dasharray':'6 3'},g);
    el('path',{d:'M700 '+s2+'L'+(scx-40)+' '+(scy+12),fill:'none',stroke:'var(--c-scatter)',
      'stroke-width':2,'stroke-dasharray':'6 3'},g);
    txt(svg,400,52,'散射通信',{'font-size':12,fill:'var(--c-scatter)','font-weight':'600'});
    txt(svg,400,68,'电离层散射 30~60 MHz　对流层散射 100~4000 MHz（≤600 km）',{'font-size':10.5,fill:'var(--muted)'});
    txt(svg,400,84,'流星余迹散射 30~100 MHz（余迹高 80~120 km，长 15~40 km）',{'font-size':10.5,fill:'var(--muted)'});
  }

  var caps={
    ground:'<b>地波</b>：频率低于 2 MHz 的电磁波沿弯曲的地球表面传播，有一定的绕射能力。'+
      '距离通常为数百或数千米，低频与甚低频段可达数千公里。典型用途是 <b>AM 广播</b>。',
    sky:'<b>天波</b>：2~30 MHz 的电磁波被电离层反射回来。电离层 F 层（150~400 km）高度最高、反射能力最强，'+
      '一次反射最远约 4000 km，多次反射可达 10000 km 以上。用于<b>短波远程通信</b>；'+
      '反射回地面的电磁波与地面之间存在收不到直达波也收不到反射波的<b>寂静区</b>。',
    los:'<b>视线</b>：频率高于 30 MHz 的电磁波能<b>穿透电离层</b>不被反射，绕射能力也很小，'+
      '只能近似当作光波作直线传播。要增大通信距离，唯一有效的办法是<b>把天线架高</b>。'+
      '用于超短波与微波通信、卫星及外太空通信。',
    scatter:'<b>散射</b>：靠大气的随机不均匀性把电波"漫反射"到接收点。'+
      '对流层散射用 100~4000 MHz、有效散射距离最大约 600 km；'+
      '流星余迹散射用 30~100 MHz，余迹高度 80~120 km、长度 15~40 km、存留时间从几分之一秒到几分钟，'+
      '只能用于<b>低速存储、高速突发的断续传输</b>。'
  };
  document.getElementById('w1cap').innerHTML=caps[m];
}
function w1Init(){
  var svg=document.getElementById('w1');
  w1Draw();
  var all=document.querySelectorAll('#s2 [data-m]');
  for(var i=0;i<all.length;i++){
    all[i].addEventListener('click',function(){
      var a=document.querySelectorAll('#s2 [data-m]');
      for(var j=0;j<a.length;j++) a[j].classList.remove('on');
      this.classList.add('on');
      W1.mode=this.getAttribute('data-m');
      w1Draw();
    });
  }
}

/* ================= W2 视线传播距离计算器 ================= */
var W2={mode:'los',rad:8493,h1:40,h2:40,hr:400};
function w2d(hkm,rkm){ return Math.sqrt(hkm*hkm+2*rkm*hkm); }
function w2Draw(){
  var svg=document.getElementById('w2');
  clr(svg);
  var OX=390, OY=1150, R=905.2;
  function gy(x){ return OY - Math.sqrt(Math.max(0,R*R-(x-OX)*(x-OX))); }

  var arc=[];
  for(var x=90;x<=690;x+=10) arc.push([x,gy(x)]);
  el('path',{d:pathD(arc),fill:'none',stroke:'#c9c2b3','stroke-width':2.6},svg);
  el('path',{d:'M'+OX+' 244.8L'+OX+' 346',stroke:'var(--muted)','stroke-width':1.1,
    'stroke-dasharray':'4 3',fill:'none'},svg);
  txt(svg,OX+6,300,'r（地心方向）',{'font-size':10,fill:'var(--muted)'});

  var r=W2.rad, h1=W2.h1/1000, h2=W2.h2/1000, hr=W2.hr;
  var d1=w2d(h1,r), d2=w2d(h2,r);
  var Dm, Dt;
  if(W2.mode==='los'){ Dm=d1+d2; Dt=Dm; }
  else if(W2.mode==='sky'){ Dm=2*w2d(hr,r); Dt=Dm; }
  else { Dm=d1; Dt=Dm; }

  function tower(x,color,label,hpx){
    var base=gy(x);
    el('line',{x1:x,y1:base,x2:x,y2:base-hpx,stroke:color,'stroke-width':2.4},svg);
    el('circle',{cx:x,cy:base-hpx,r:3.4,fill:color},svg);
    el('line',{x1:x-10,y1:base,x2:x+10,y2:base,stroke:color,'stroke-width':1.6},svg);
    if(label) txt(svg,x,base+16,label,{'text-anchor':'middle','font-size':10,fill:'var(--muted)'});
  }
  function dim(x1,x2,y,label,color){
    el('line',{x1:x1,y1:y,x2:x2,y2:y,stroke:color||'var(--muted)','stroke-width':1.2,
      'marker-start':'none'},svg);
    el('line',{x1:x1,y1:y-4,x2:x1,y2:y+4,stroke:color||'var(--muted)','stroke-width':1.2},svg);
    el('line',{x1:x2,y1:y-4,x2:x2,y2:y+4,stroke:color||'var(--muted)','stroke-width':1.2},svg);
    if(label) txt(svg,(x1+x2)/2,y-5,label,{'text-anchor':'middle','font-size':10.5,fill:color||'var(--ink2)'});
  }

  if(W2.mode==='los'){
    var yl=244.8;
    el('line',{x1:170,y1:yl,x2:610,y2:yl,stroke:'var(--c-los)','stroke-width':3,
      'stroke-linecap':'round'},svg);
    tower(170,'var(--c-los)','发射天线 h₁',gy(170)-yl);
    tower(610,'var(--c-los)','接收天线 h₂',gy(610)-yl);
    el('circle',{cx:OX,cy:yl,r:4.6,fill:'none',stroke:'var(--c-los)','stroke-width':2},svg);
    txt(svg,OX+8,yl-8,'切点 T',{'font-size':10.5,fill:'var(--c-los)'});
    el('path',{d:'M'+(OX+8)+' '+(yl+9)+'L'+(OX+8)+' '+(yl+20)+'L'+(OX+19)+' '+(yl+20),
      fill:'none',stroke:'var(--muted)','stroke-width':1.1},svg);
    dim(170,OX,312,'d₁','var(--c-los)');
    dim(OX,610,312,'d₂','var(--c-los)');
    dim(170,610,332,'D = d₁ + d₂','var(--ink)');
    txt(svg,120,60,'视线传播几何（示意，非按比例）',{'font-size':12.5,fill:'var(--ink)','font-weight':'600'});
    txt(svg,120,78,'d = √(h² + 2rh)　　收发等高时 D = 2d ≈ 2√(2rh)',{'font-size':11,fill:'var(--ink2)'});
    txt(svg,120,96,'⇒ D² ≈ 8rh　⇒　h = D²/50 （D 用 km，h 用 m）',{'font-size':11,fill:'var(--warm)'});
  } else if(W2.mode==='sky'){
    el('rect',{x:170,y:128,width:440,height:16,fill:'rgba(47,111,94,.13)',stroke:'#2f6f5e',
      'stroke-width':1,'stroke-dasharray':'5 3'},svg);
    txt(svg,612,120,'电离层 F 层　h_r = '+W2.hr+' km',{'font-size':10.5,fill:'#2f6f5e','font-weight':'600'});
    var ya=tower(230,'var(--c-sky)','',26);
    var yb=tower(550,'var(--c-sky)','',26);
    el('path',{d:'M230 '+ya+'L390 136L550 '+yb,fill:'none',stroke:'var(--c-sky)','stroke-width':2.6},svg);
    txt(svg,268,108,'上行',{'font-size':10,fill:'var(--c-sky)'});
    txt(svg,474,108,'下行',{'font-size':10,fill:'var(--c-sky)'});
    dim(230,390,186,'d','var(--c-sky)');
    dim(390,550,186,'d','var(--c-sky)');
    dim(230,550,204,'D = 2d（单跳）','var(--ink)');
    txt(svg,120,52,'天波单跳跳距（示意）',{'font-size':12.5,fill:'var(--ink)','font-weight':'600'});
    txt(svg,120,70,'一跳：上行 d + 下行 d，D = 2d = 2√(h_r² + 2 r′ h_r)',{'font-size':11,fill:'var(--ink2)'});
    txt(svg,120,88,'注意：必须用 4/3 等效半径 r′ = 8493 km，否则算成 4585 km',{'font-size':11,fill:'var(--warm)'});
  } else {
    var px=390, py=126;
    el('rect',{x:px-34,y:py-12,width:68,height:16,rx:3,fill:'rgba(74,111,165,.20)',
      stroke:'#4a6fa5','stroke-width':1.4},svg);
    txt(svg,px,py+1,'HAPS',{'text-anchor':'middle','font-size':10,fill:'#3b5a86','font-weight':'600'});
    el('line',{x1:px,y1:py+4,x2:px,y2:244.8,stroke:'#4a6fa5','stroke-width':1.4,'stroke-dasharray':'4 3'},svg);
    var rpx=Math.min(285,0.28*Dm);
    el('ellipse',{cx:px,cy:244.8,rx:rpx,ry:Math.max(14,rpx*0.17),fill:'rgba(74,111,165,.13)',
      stroke:'#4a6fa5','stroke-width':1.4,'stroke-dasharray':'5 3'},svg);
    txt(svg,px+rpx/2,268,'覆盖地面半径 R',{'text-anchor':'middle','font-size':11,fill:'#3b5a86','font-weight':'600'});
    txt(svg,px+rpx/2,284,'R = √(h² + 2rh) = '+fmtN(Dm,1)+' km',{'text-anchor':'middle','font-size':10.5,fill:'var(--muted)'});
    el('path',{d:'M'+px+' 244.8L'+px+' 346',stroke:'var(--muted)','stroke-width':1.1,
      'stroke-dasharray':'4 3',fill:'none'},svg);
    txt(svg,px+6,300,'r（地心方向）',{'font-size':10,fill:'var(--muted)'});
    txt(svg,120,52,'单站覆盖地面半径（示意）',{'font-size':12.5,fill:'var(--ink)','font-weight':'600'});
    txt(svg,120,70,'覆盖圆以平台正下方为中心，半径 R = √(h² + 2rh)（不是 2 倍！）',{'font-size':11,fill:'var(--ink2)'});
    txt(svg,120,88,'教材：20 km 高度的平台可覆盖约 500 km 半径',{'font-size':11,fill:'var(--warm)'});
  }

  var d1t=w2d(h1,r), d2t=w2d(h2,r), Dm2;
  if(W2.mode==='los') Dm2=d1t+d2t;
  else if(W2.mode==='sky') Dm2=2*w2d(hr,r);
  else Dm2=d1t;
  var Dreal=(W2.mode==='sky')?2*w2d(hr,6370):((W2.mode==='los')?w2d(h1,6370)+w2d(h2,6370):w2d(h1,6370));
  var gain=(Dreal>0)?((Dm2/Dreal-1)*100):0;

  var h1s=(W2.h1<1000)?(W2.h1+' m'):(fmtN(W2.h1/1000,2)+' km');
  var h2s=(W2.h2<1000)?(W2.h2+' m'):(fmtN(W2.h2/1000,2)+' km');

  fillRo(document.getElementById('w2ro'),[
    ['地球半径 r', W2.rad+' km'],
    ['d₁ = √(h₁²+2rh₁)', fmtN(d1t,3)+' km'],
    ['d₂ = √(h₂²+2rh₂)', fmtN(d2t,3)+' km'],
    (W2.mode==='cov')?['覆盖半径 R','<b style="color:var(--primary)">'+fmtN(Dm2,2)+' km</b>']:
      ['最远距离 D','<b style="color:var(--primary)">'+fmtN(Dm2,2)+' km</b>'],
    ['相对 r=6370 km', (gain>=0?'+':'')+fmtN(gain,1)+' %']
  ]);

  var caps={
    los:'<b>视线模式</b>：收发天线分别高 '+h1s+' 与 '+h2s+'。'+
      '每端各能"看到" d₁ = '+fmtN(d1t,3)+' km、d₂ = '+fmtN(d2t,3)+' km，'+
      '故两端相距最远 <b>D = '+fmtN(Dm2,2)+' km</b>。'+
      (W2.rad===6370?'当前用真实半径 6370 km（不含大气折射）。':'当前用 4/3 等效半径 8493 km（已计入大气折射，比真实半径大 '+fmtN(gain,1)+'%）。'),
    sky:'<b>天波模式</b>：电离层反射层高 '+W2.hr+' km，一跳跳距 D = 2√(h_r²+2rh_r) = <b>'+fmtN(Dm2,1)+' km</b>。'+
      (W2.rad===8493?'用的是 4/3 等效半径 8493 km——<b>这正是习题 4-2 的条件</b>；若换成 6370 km 只有 '+fmtN(Dreal,1)+' km。':
        '当前用真实半径 6370 km，结果为 '+fmtN(Dm2,1)+' km；切到 4/3 等效半径可复现习题 4-2。'),
    cov:'<b>覆盖半径模式</b>：平台高 '+h1s+'，覆盖地面半径 R = √(h²+2rh) = <b>'+fmtN(Dm2,2)+' km</b>。'+
      '注意 R <b>不是</b> D：习题 4-3 求的正是 R，教材正文说 20 km 高度对应约 500 km，与此吻合。'
  };
  document.getElementById('w2cap').innerHTML=caps[W2.mode];
}
function w2Init(){
  var s1=document.getElementById('w2h1'), s2=document.getElementById('w2h2'), s3=document.getElementById('w2hr');
  function upd(){
    W2.h1=parseFloat(s1.value); W2.h2=parseFloat(s2.value); W2.hr=parseFloat(s3.value);
    document.getElementById('w2h1v').textContent=(W2.h1<1000)?(W2.h1+' m'):(fmtN(W2.h1/1000,2)+' km');
    document.getElementById('w2h2v').textContent=(W2.h2<1000)?(W2.h2+' m'):(fmtN(W2.h2/1000,2)+' km');
    document.getElementById('w2hrv').textContent=W2.hr+' km';
    w2Draw();
  }
  s1.addEventListener('input',upd); s2.addEventListener('input',upd); s3.addEventListener('input',upd);

  var modes=document.querySelectorAll('#s3 [data-mode]');
  for(var i=0;i<modes.length;i++){
    modes[i].addEventListener('click',function(){
      var a=document.querySelectorAll('#s3 [data-mode]');
      for(var j=0;j<a.length;j++) a[j].classList.remove('on');
      this.classList.add('on');
      W2.mode=this.getAttribute('data-mode');
      w2Draw();
    });
  }
  var rads=document.querySelectorAll('#s3 [data-rad]');
  for(var k=0;k<rads.length;k++){
    rads[k].addEventListener('click',function(){
      var a=document.querySelectorAll('#s3 [data-rad]');
      for(var j=0;j<a.length;j++) a[j].classList.remove('on');
      this.classList.add('on');
      W2.rad=parseInt(this.getAttribute('data-rad'),10);
      w2Draw();
    });
  }
  var pres=document.querySelectorAll('#s3 [data-preset]');
  for(var m=0;m<pres.length;m++){
    pres[m].addEventListener('click',function(){
      var p=this.getAttribute('data-preset');
      var a=document.querySelectorAll('#s3 [data-mode]');
      for(var j=0;j<a.length;j++) a[j].classList.remove('on');
      var b=document.querySelectorAll('#s3 [data-rad]');
      for(var j2=0;j2<b.length;j2++) b[j2].classList.remove('on');
      if(p==='4-1'){
        W2.mode='los'; W2.rad=6370; W2.h1=40; W2.h2=40;
        a[0].classList.add('on'); b[0].classList.add('on');
      } else if(p==='4-2'){
        W2.mode='sky'; W2.rad=8493; W2.hr=400;
        a[1].classList.add('on'); b[1].classList.add('on');
      } else {
        W2.mode='cov'; W2.rad=6370; W2.h1=20000; W2.h2=0;
        a[2].classList.add('on'); b[0].classList.add('on');
      }
      s1.value=W2.h1; s2.value=W2.h2; s3.value=W2.hr;
      upd();
    });
  }
  upd();
}

/* ================= W3 自由空间链路预算 ================= */
var W3={f:800,d:50,pt:40,gt:20,gr:20};
function w3Draw(){
  var svg=document.getElementById('w3');
  clr(svg);
  var fMHz=W3.f, dkm=W3.d;
  var lam=300/fMHz;
  function prAt(dk){
    var lfs=32.44+20*Math.log10(dk)+20*Math.log10(fMHz);
    return W3.pt+W3.gt+W3.gr-lfs;
  }
  var pr1=prAt(1), pr200=prAt(200);
  var lo=Math.floor(pr200/10)*10-10, hi=Math.ceil(pr1/10)*10+10;
  var box={x:74,y:26,w:620,h:212};
  var F=frame(svg,box,[0,200],[lo,hi],'距离 d / km','P_R / dBm',{xt:25,yt:(hi-lo)/5,xdp:0,ydp:0});
  var pts=[];
  for(var d=1;d<=200;d+=1){ pts.push([F.X(d),F.Y(prAt(d))]); }
  el('path',{d:pathD(pts),fill:'none',stroke:'var(--primary)','stroke-width':2.4},svg);
  var opx=F.X(dkm), opy=F.Y(prAt(dkm));
  el('line',{x1:opx,y1:box.y,x2:opx,y2:box.y+box.h,stroke:'var(--warm)','stroke-width':1.1,'stroke-dasharray':'4 3'},svg);
  el('circle',{cx:opx,cy:opy,r:5,fill:'var(--warm)',stroke:'#fff','stroke-width':1.6},svg);
  txt(svg,opx+9,opy-8,'当前工作点',{'font-size':10.5,fill:'var(--warm)','font-weight':'600'});
  txt(svg,box.x+8,box.y+16,'P_R(d) = P_T + G_T + G_R − 32.44 − 20lg d − 20lg f',
    {'font-size':10.5,fill:'var(--muted)'});
  txt(svg,box.x+box.w-6,box.y+16,'λ = '+fmtN(lam,4)+' m',
    {'text-anchor':'end','font-size':10.5,fill:'var(--muted)'});

  var lfs=32.44+20*Math.log10(dkm)+20*Math.log10(fMHz);
  var prdbm=prAt(dkm);
  var prW=dbm2w(prdbm);
  var eirp=W3.pt+W3.gt;
  var needPt=prdbm+32.44+20*Math.log10(dkm)+20*Math.log10(fMHz)-W3.gt-W3.gr;
  fillRo(document.getElementById('w3ro'),[
    ['λ = c/f', fmtN(lam,4)+' m'],
    ['自由空间路径损耗 L_fs', '<b style="color:var(--warm)">'+fmtN(lfs,2)+' dB</b>'],
    ['EIRP', fmtN(eirp,1)+' dBm'],
    ['接收功率 P_R', '<b style="color:var(--primary)">'+fmtN(prdbm,2)+' dBm</b>'],
    ['接收功率 P_R', fmtE(prW)+' W'],
    ['若 P_R = −100 dBm 所需 P_T', fmtN(needPt,1)+' dBm']
  ]);
  var cap='当前：f = '+fMHz+' MHz，d = '+dkm+' km，P_T = '+W3.pt+' dBm，发/收天线增益 '+W3.gt+' / '+W3.gr+' dBi。'+
    '由式 (4.1-11) 得 P_R = λ²P_TG_TG_R/(16π²d²) = <b>'+fmtN(prdbm,2)+' dBm</b>（'+fmtE(prW)+' W），'+
    '对应路径损耗 <b>'+fmtN(lfs,2)+' dB</b>。'+
    '注意距离翻倍只掉 <b>6.02 dB</b>，频率翻倍也只掉 6.02 dB——路径损耗随 d 和 f 都是<b>平方根</b>级增长，这是无线链路的基本规律。'+
    (W3.note||'');
  document.getElementById('w3cap').innerHTML=cap;
}
function w3Init(){
  var ids=['w3f','w3d','w3pt','w3gt','w3gr'];
  function upd(){
    W3.f=parseFloat(document.getElementById('w3f').value);
    W3.d=parseFloat(document.getElementById('w3d').value);
    W3.pt=parseFloat(document.getElementById('w3pt').value);
    W3.gt=parseFloat(document.getElementById('w3gt').value);
    W3.gr=parseFloat(document.getElementById('w3gr').value);
    document.getElementById('w3fv').textContent=W3.f+' MHz';
    document.getElementById('w3dv').textContent=W3.d+' km';
    document.getElementById('w3ptv').textContent=W3.pt+' dBm';
    document.getElementById('w3gtv').textContent=W3.gt+' dBi';
    document.getElementById('w3grv').textContent=W3.gr+' dBi';
    w3Draw();
  }
  for(var i=0;i<ids.length;i++){
    document.getElementById(ids[i]).addEventListener('input',function(){ W3.note=''; upd(); });
  }
  var pres=document.querySelectorAll('#s4 [data-preset]');
  for(var k=0;k<pres.length;k++){
    pres[k].addEventListener('click',function(){
      var p=this.getAttribute('data-preset');
      W3.note='';
      if(p==='ex41'){
        W3.f=800; W3.d=50; W3.pt=40; W3.gt=20; W3.gr=10;
        W3.note='<b>这是教材例 4-1</b>：P_T = 10 W、G_T = 100、G_R = 10、d = 50 km、f = 800 MHz ⇒ '+
          'P_R = 3.56×10⁻⁹ W，路径损耗 L_tr = 94.5 dB。';
      } else if(p==='ex49'){
        W3.f=1800; W3.d=50; W3.pt=47.55; W3.gt=20; W3.gr=10;
        W3.note='<b>这是教材习题 4-9</b>：要求 P_R ≥ 4000 pW（= 4×10⁻⁹ W = −53.98 dBm）。'+
          '此时 P_T = 47.55 dBm ≈ <b>56.9 W</b>，恰满足要求。';
      } else {
        W3.f=28000; W3.d=2; W3.pt=40; W3.gt=20; W3.gr=20;
        W3.note='<b>5G 毫米波示意</b>：28 GHz、2 km。天线增益补不回 d² 的损失，只能靠缩短距离与提高功率。';
      }
      document.getElementById('w3f').value=W3.f;
      document.getElementById('w3d').value=W3.d;
      document.getElementById('w3pt').value=W3.pt;
      document.getElementById('w3gt').value=W3.gt;
      document.getElementById('w3gr').value=W3.gr;
      upd();
    });
  }
  upd();
}

/* ================= 系统框图（静态） ================= */
function lineArrow(svg,x1,y1,x2,y2,color,w){
  var dx=x2-x1, dy=y2-y1, L=Math.sqrt(dx*dx+dy*dy);
  var ux=dx/L, uy=dy/L, px=-uy, py=ux;
  var bx=x2-ux*10, by=y2-uy*10;
  el('line',{x1:x1,y1:y1,x2:bx,y2:by,stroke:color||'var(--muted)','stroke-width':w||1.5},svg);
  el('path',{d:'M'+x2+' '+y2+'L'+(bx+px*4.6)+' '+(by+py*4.6)+'L'+(bx-px*4.6)+' '+(by-py*4.6)+'Z',
    fill:color||'var(--muted)',stroke:'none'},svg);
}
function wSysMap(){
  var svg=document.getElementById('sysmap');
  clr(svg);
  var names=['信源','信源编码','加密','信道编码','数字调制','数字解调','信道译码','解密','信源译码','信宿'];
  var x0=8, w=56, step=70, y=36, h=28;
  var gap=98;   /* 数字调制→数字解调之间插入「信道」框所需的额外让位 */
  function bx(i){ return x0+i*step+(i>=5?gap:0); }
  for(var i=0;i<names.length;i++){
    var x=bx(i);
    var isMod=(i===4||i===5), isEnc=(i===3||i===6);
    var fill='#fbfaf7', stroke='var(--line)';
    if(isMod){ fill='rgba(74,111,165,.12)'; stroke='#4a6fa5'; }
    else if(isEnc){ fill='rgba(201,123,63,.12)'; stroke='#c97b3f'; }
    el('rect',{x:x,y:y,width:w,height:h,rx:6,fill:fill,stroke:stroke,'stroke-width':1.3},svg);
    txt(svg,x+w/2,y+h/2+3.5,names[i],{'text-anchor':'middle','font-size':9.8,
      fill:(isMod||isEnc)?'var(--ink)':'var(--ink2)','font-weight':(isMod||isEnc)?'600':'400'});
    /* i===4 的链路箭头由「信道」虚线框接管，不再直连 */
    if(i<names.length-1 && i!==4) lineArrow(svg,x+w,y+h/2,bx(i+1)-3,y+h/2,'var(--muted)',1.3);
  }
  /* 信道（虚线框，正好落在调制与解调之间的让位区间，不压任何框图） */
  var cx=bx(4)+w+18, cw=76, cy=36;
  el('rect',{x:cx,y:cy,width:cw,height:h,rx:6,fill:'rgba(47,111,94,.10)',stroke:'#2f6f5e',
    'stroke-width':1.3,'stroke-dasharray':'4 3'},svg);
  txt(svg,cx+cw/2,cy+h/2+3.5,'信道',{'text-anchor':'middle','font-size':10,fill:'#2f6f5e','font-weight':'600'});
  lineArrow(svg,bx(4)+w,y+h/2,cx-3,y+h/2,'var(--muted)',1.3);
  lineArrow(svg,cx+cw+2,y+h/2,bx(5)-3,y+h/2,'var(--muted)',1.3);
  /* 噪声源：从右上方绕行进入信道框 —— 竖直线不再穿过下方两个括号标注 */
  var nx=cx+cw+80, ny=132;
  el('rect',{x:nx-38,y:ny,width:76,height:24,rx:6,fill:'rgba(176,99,103,.12)',stroke:'#b06367','stroke-width':1.2},svg);
  txt(svg,nx,ny+16,'噪声源',{'text-anchor':'middle','font-size':9.8,fill:'#96525a'});
  el('path',{d:'M'+nx+' '+ny+' L'+nx+' 24 L'+(cx+cw+8)+' 24 L'+(cx+cw+8)+' '+(cy+h/2),
    fill:'none',stroke:'#b06367','stroke-width':1.3},svg);
  el('path',{d:'M'+(cx+cw+2)+' '+(cy+h/2)+' l10 -4.5 l0 9 z',fill:'#b06367'},svg);
  /* 括号：调制信道 / 编码信道 */
  function bracket(x1,x2,y,color,label){
    el('path',{d:'M'+x1+' '+(y+8)+'L'+x1+' '+y+'L'+x2+' '+y+'L'+x2+' '+(y+8),
      fill:'none',stroke:color,'stroke-width':1.6},svg);
    txt(svg,(x1+x2)/2,y+21,label,{'text-anchor':'middle','font-size':11,fill:color,'font-weight':'600'});
  }
  bracket(bx(4), bx(5)+w, 80, '#4a6fa5', '调制信道：研究调制 / 解调');
  bracket(bx(3), bx(6)+w, 104, '#c97b3f', '编码信道：研究编码 / 译码');
  txt(svg,bx(3),200,'教材图 4-14 的信号流程（简绘）',{'font-size':10,fill:'var(--muted)'});
}
/* ================= 调制信道模型框图（静态） ================= */
function wModModel(){
  var svg=document.getElementById('modmodel');
  clr(svg);
  function box(x,y,w,h,t1,t2,fill,stroke){
    el('rect',{x:x,y:y,width:w,height:h,rx:7,fill:fill,stroke:stroke,'stroke-width':1.3},svg);
    txt(svg,x+w/2,y+h/2+(t2?(-2):4),t1,{'text-anchor':'middle','font-size':11.5,
      fill:'var(--ink)','font-weight':'600'});
    if(t2) txt(svg,x+w/2,y+h/2+13,t2,{'text-anchor':'middle','font-size':10,fill:'var(--muted)'});
  }
  /* 时域 */
  box(30,58,84,30,'e_i(t)',null,'#fbfaf7','var(--line)');
  lineArrow(svg,114,73,178,73,'var(--muted)',1.4);
  box(180,50,170,46,'线性（时变）系统','h(t) = c(t)','rgba(47,111,94,.09)','#2f6f5e');
  lineArrow(svg,350,73,392,73,'var(--muted)',1.4);
  el('circle',{cx:412,cy:73,r:16,fill:'#fff',stroke:'var(--ink2)','stroke-width':1.5},svg);
  txt(svg,412,78,'+',{'text-anchor':'middle','font-size':15,fill:'var(--ink2)','font-weight':'600'});
  lineArrow(svg,428,73,486,73,'var(--muted)',1.4);
  box(488,58,84,30,'e_o(t)',null,'#fbfaf7','var(--line)');
  box(378,150,68,26,'n(t)','加性噪声','rgba(176,99,103,.12)','#b06367');
  lineArrow(svg,412,148,412,92,'#b06367',1.4);
  txt(svg,30,32,'时域：e_o(t) = f[e_i(t)] + n(t) = k(t)·e_i(t) + n(t)',{'font-size':11.5,fill:'var(--ink)','font-weight':'600'});
  txt(svg,470,32,'k(t) 恒定 ⇒ 恒参信道；k(t) 随机快变 ⇒ 随参信道',{'font-size':10.5,fill:'var(--muted)'});
  /* 频域 */
  txt(svg,30,200,'频域：S_o(ω) = C(ω) · S_i(ω)',{'font-size':11.5,fill:'var(--ink)','font-weight':'600'});
  box(30,212,84,30,'S_i(ω)',null,'#fbfaf7','var(--line)');
  lineArrow(svg,114,227,178,227,'var(--muted)',1.4);
  box(180,212,170,30,'× C(ω)','频域特性','rgba(74,111,165,.10)','#4a6fa5');
  lineArrow(svg,350,227,392,227,'var(--muted)',1.4);
  el('circle',{cx:412,cy:227,r:16,fill:'#fff',stroke:'var(--ink2)','stroke-width':1.5},svg);
  txt(svg,412,232,'+',{'text-anchor':'middle','font-size':15,fill:'var(--ink2)','font-weight':'600'});
  lineArrow(svg,428,227,486,227,'var(--muted)',1.4);
  box(488,212,84,30,'S_o(ω)',null,'#fbfaf7','var(--line)');
  txt(svg,578,232,'+ N(ω)',{'font-size':10.5,fill:'var(--muted)'});
}

/* ================= W4 光纤结构与介质对比 ================= */
function w4Draw(){
  var svg=document.getElementById('w4');
  clr(svg);
  var sub=[
    {t:'(a) 多模阶跃折射率',core:'50 ~ 200 μm',clad:'125 ~ 400 μm',cx:150,coreW:46,cladW:92,grad:false,mode:'multi'},
    {t:'(b) 多模梯度折射率',core:'50 ~ 100 μm',clad:'125 ~ 140 μm',cx:390,coreW:34,cladW:72,grad:true,mode:'multi'},
    {t:'(c) 单模阶跃折射率',core:'7 ~ 10 μm',clad:'125 μm',cx:630,coreW:9,cladW:92,grad:false,mode:'single'}
  ];
  for(var i=0;i<sub.length;i++){
    var s=sub[i];
    var cy=88, hh=44;
    /* 包层 */
    el('rect',{x:s.cx-s.cladW/2,y:cy-hh/2,width:s.cladW,height:hh,rx:4,
      fill:'rgba(74,111,165,.10)',stroke:'#4a6fa5','stroke-width':1.3},svg);
    /* 纤芯 */
    if(s.grad){
      var g=el('linearGradient',{id:'g'+i,x1:'0',x2:'1',y1:'0',y2:'0'},svg);
      el('stop',{offset:'0%','stop-color':'rgba(47,111,94,.55)'},g);
      el('stop',{offset:'50%','stop-color':'rgba(47,111,94,.16)'},g);
      el('stop',{offset:'100%','stop-color':'rgba(47,111,94,.55)'},g);
      el('rect',{x:s.cx-s.coreW/2,y:cy-hh/2,width:s.coreW,height:hh,rx:2,fill:'url(#g'+i+')',
        stroke:'#2f6f5e','stroke-width':1.1},svg);
    } else {
      el('rect',{x:s.cx-s.coreW/2,y:cy-hh/2,width:s.coreW,height:hh,rx:2,
        fill:'rgba(47,111,94,.30)',stroke:'#2f6f5e','stroke-width':1.1},svg);
    }
    /* 光路 */
    var pts=[];
    if(s.mode==='single'){
      pts=[[s.cx,cy-hh/2-14],[s.cx,cy+hh/2+14]];
    } else if(s.grad){
      pts=[[s.cx,cy-hh/2-14],[s.cx-6,cy-8],[s.cx,cy+hh/2+14]];
    } else {
      var b=s.coreW/2-1;
      pts=[[s.cx,cy-hh/2-14],[s.cx+b,cy-hh/2],[s.cx-b,cy-hh/2+hh/3],
           [s.cx+b,cy-hh/2+2*hh/3],[s.cx-b,cy+hh/2],[s.cx,cy+hh/2+14]];
    }
    el('path',{d:pathD(pts),fill:'none',stroke:'var(--warm)','stroke-width':2,
      'stroke-linejoin':'round'},svg);
    txt(svg,s.cx,cy-hh/2-22,s.t,{'text-anchor':'middle','font-size':10.5,fill:'var(--ink)','font-weight':'600'});
    txt(svg,s.cx,cy+hh/2+32,'纤芯 '+s.core,{'text-anchor':'middle','font-size':9.8,fill:'var(--primary)'});
    txt(svg,s.cx,cy+hh/2+46,'包层 '+s.clad,{'text-anchor':'middle','font-size':9.8,fill:'var(--blue)'});
  }
  txt(svg,30,22,'光纤结构与折射率剖面（横向放大示意）',{'font-size':12,fill:'var(--ink)','font-weight':'600'});
  txt(svg,30,182,'橙线 = 光线；多模有多条路径（模式色散），单模只有一条路径。',{'font-size':10,fill:'var(--muted)'});

  /* 下半：有线介质 距离-速率 分布 */
  var bx=78, by=222, bw=620, bh=170;
  el('rect',{x:bx,y:by,width:bw,height:bh,fill:'#fbfaf7',stroke:'var(--line)',rx:8},svg);
  txt(svg,30,200,'典型传输介质：距离与速率的取舍（对数坐标）',{'font-size':12,fill:'var(--ink)','font-weight':'600'});
  var xmin=Math.log10(0.01), xmax=Math.log10(40000);
  var ymin=3, ymax=11;
  function PX(km){ return bx+ (Math.log10(km)-xmin)/(xmax-xmin)*bw; }
  function PY(rate){ return by+bh-(Math.log10(rate)-ymin)/(ymax-ymin)*bh; }
  var xt=[0.01,0.1,1,10,100,10000];
  var xlab=['10 m','100 m','1 km','10 km','100 km','10000 km'];
  for(var q=0;q<xt.length;q++){
    el('line',{x1:PX(xt[q]),y1:by,x2:PX(xt[q]),y2:by+bh,stroke:'var(--line-soft)','stroke-width':1},svg);
    txt(svg,PX(xt[q]),by+bh+13,xlab[q],{'text-anchor':'middle','font-size':9.5,fill:'var(--muted)'});
  }
  var yt=[1e3,1e5,1e7,1e9,1e11];
  var ylab=['1 kb/s','100 kb/s','10 Mb/s','1 Gb/s','100 Gb/s'];
  for(var q2=0;q2<yt.length;q2++){
    el('line',{x1:bx,y1:PY(yt[q2]),x2:bx+bw,y2:PY(yt[q2]),stroke:'var(--line-soft)','stroke-width':1},svg);
    txt(svg,bx-6,PY(yt[q2])+3.5,ylab[q2],{'text-anchor':'end','font-size':9.5,fill:'var(--muted)'});
  }
  var pts=[
    {n:'明线',d:1,r:1e3,c:'#8a7a4e'},
    {n:'双绞线 UTP',d:0.1,r:1e8,c:'#4a6fa5'},
    {n:'同轴 50Ω 基带',d:3,r:1e7,c:'#c97b3f'},
    {n:'同轴 75Ω 宽带',d:30,r:5e7,c:'#c97b3f'},
    {n:'多模光纤',d:2,r:1e9,c:'#2f6f5e'},
    {n:'单模光纤',d:100,r:1e10,c:'#2f6f5e'},
    {n:'卫星 / 微波',d:36000,r:1e8,c:'#b06367'}
  ];
  for(var q3=0;q3<pts.length;q3++){
    var p=pts[q3], cx2=PX(p.d), cy2=PY(p.r);
    el('circle',{cx:cx2,cy:cy2,r:5.5,fill:p.c,opacity:.85},svg);
    var lx=(q3===0||q3===3)?-10:(cx2>bx+bw-120?cx2-10:cx2+10);
    var an=(cx2>bx+bw-120)?'end':'start';
    txt(svg,lx,cy2+4,p.n,{'text-anchor':an,'font-size':10,fill:'var(--ink2)'});
  }
  txt(svg,bx+bw,by+bh+27,'距离 d / km（对数）',{'text-anchor':'end','font-size':10,fill:'var(--muted)'});
  txt(svg,bx-6,by-8,'速率（对数）',{'text-anchor':'start','font-size':10,fill:'var(--muted)'});
  document.getElementById('w4cap').innerHTML=
    '<b>上图为三种光纤的剖面（横向放大示意）。</b>多模光纤纤芯粗（50~200 μm）、用 LED 作光源，'+
    '存在模式色散；单模光纤纤芯只有 7~10 μm、用激光器作光源，路径唯一，传输容量大得多。'+
    '<b>下图为工程直觉：</b>越往右上（高速 + 远距离）越"难"，'+
    '只有<b>单模光纤</b>同时占据"高速 + 远距"象限——这正是骨干网全部用光纤的原因。';
}

/* ================= W5 编码信道与误码率 ================= */
var W5={p0:0.5,e1:0.05,e2:0.05};
function w5Draw(){
  var svg=document.getElementById('w5');
  clr(svg);
  var p0=W5.p0, p1=1-p0, e1=W5.e1, e2=W5.e2;
  var sx=110, sy=100, rx=560;
  function node(x,y,label,sub){
    el('circle',{cx:x,cy:y,r:19,fill:'#fff',stroke:'var(--primary)','stroke-width':2},svg);
    txt(svg,x,y+6,label,{'text-anchor':'middle','font-size':14,fill:'var(--primary)','font-weight':'600'});
    if(sub) txt(svg,x,y+36,sub,{'text-anchor':'middle','font-size':10,fill:'var(--muted)'});
  }
  node(sx,sy,'0','发送端'); node(sx,sy+140,'1','发送端');
  node(rx,sy,'0','接收端'); node(rx,sy+140,'1','接收端');
  txt(svg,sx-2,sy-34,'发送端 x',{'font-size':11,fill:'var(--ink2)','font-weight':'600'});
  txt(svg,rx+30,sy-34,'接收端 y',{'font-size':11,fill:'var(--ink2)','font-weight':'600'});

  function edge(x1,y1,x2,y2,p,color,lab,curve){
    var wdt=1+7*p;
    var d;
    if(curve){
      var mx=(x1+x2)/2, my=(y1+y2)/2+(curve>0?46:-46);
      d='M'+x1+' '+y1+'Q'+mx+' '+my+' '+x2+' '+y2;
      el('path',{d:d,fill:'none',stroke:color,'stroke-width':wdt,opacity:.9},svg);
      txt(svg,mx,my+(curve>0?-4:14),lab,{'text-anchor':'middle','font-size':10.5,fill:color,'font-weight':'600'});
    } else {
      d='M'+x1+' '+y1+'L'+x2+' '+y2;
      el('path',{d:d,fill:'none',stroke:color,'stroke-width':wdt,opacity:.9},svg);
      txt(svg,(x1+x2)/2,y1-9,lab,{'text-anchor':'middle','font-size':10.5,fill:color,'font-weight':'600'});
    }
  }
  edge(sx+19,sy,rx-19,sy,1-e1,'var(--primary)','P(0/0) = '+fmtN(1-e1,3),0);
  edge(sx+19,sy+140,rx-19,sy+140,1-e2,'var(--primary)','P(1/1) = '+fmtN(1-e2,3),0);
  edge(sx+19,sy+6,rx-19,sy+134,e1,'var(--warm)','P(1/0) = '+fmtN(e1,3),1);
  edge(sx+19,sy+134,rx-19,sy+6,e2,'var(--warm)','P(0/1) = '+fmtN(e2,3),-1);
  txt(svg,335,310,'线宽 ∝ 转移概率大小',{'font-size':10,fill:'var(--muted)'});

  var pe=p0*e1+p1*e2;
  fillRo(document.getElementById('w5ro'),[
    ['P(0) / P(1)', fmtN(p0,3)+' / '+fmtN(p1,3)],
    ['P(1/0) · P(0/1)', fmtN(e1,3)+' · '+fmtN(e2,3)],
    ['误码率 P_e', '<b style="color:var(--warm)">'+fmtN(pe,5)+'</b>'],
    ['正确概率', fmtN(1-pe,5)]
  ]);
  document.getElementById('w5cap').innerHTML=
    '当前参数下：发送 "0" 的概率 <b>'+fmtN(p0,3)+'</b>，收到错码 "1" 的概率 <b>'+fmtN(e1,3)+'</b>；'+
    '发送 "1" 的概率 <b>'+fmtN(p1,3)+'</b>，收到错码 "0" 的概率 <b>'+fmtN(e2,3)+'</b>。'+
    '于是总误码率 P<sub>e</sub> = P(0)·P(1/0) + P(1)·P(0/1) = <b>'+fmtN(pe,5)+'</b>。'+
    (pe>0?'<b>注意</b>：若先验 P(0)≠P(1)，两个错转概率必须各自加权，不能直接相加。':'当前无噪声，理论上可无误码传输。');
}
function w5Init(){
  function upd(){
    W5.p0=parseFloat(document.getElementById('w5p0').value);
    W5.e1=parseFloat(document.getElementById('w5e1').value);
    W5.e2=parseFloat(document.getElementById('w5e2').value);
    document.getElementById('w5p0v').textContent=fmtN(W5.p0,2);
    document.getElementById('w5e1v').textContent=fmtN(W5.e1,3);
    document.getElementById('w5e2v').textContent=fmtN(W5.e2,3);
    w5Draw();
  }
  ['w5p0','w5e1','w5e2'].forEach(function(id){
    document.getElementById(id).addEventListener('input',upd);
  });
  var pres=document.querySelectorAll('#s6 [data-preset]');
  for(var i=0;i<pres.length;i++){
    pres[i].addEventListener('click',function(){
      var p=this.getAttribute('data-preset');
      if(p==='sym'){ W5.p0=0.5; W5.e1=1/128; W5.e2=1/128; }
      else if(p==='p7'){ W5.p0=0.7; W5.e1=0.05; W5.e2=0.05; }
      else { W5.p0=0.5; W5.e1=0.2; W5.e2=0.2; }
      document.getElementById('w5p0').value=W5.p0;
      document.getElementById('w5e1').value=W5.e1;
      document.getElementById('w5e2').value=W5.e2;
      upd();
    });
  }
  upd();
}

/* ================= W6 恒参信道三联图 ================= */
var W6={mode:'ideal',td:0.8};
function w6Data(){
  var fs=[], i;
  for(i=0;i<=140;i++) fs.push(100*Math.pow(100, i/140));   /* 100 Hz .. 10 kHz */
  var out={f:fs,amp:[],ph:[],tau:[]};
  if(W6.mode==='ideal'){
    for(i=0;i<fs.length;i++){
      out.amp.push(0);                              /* dB */
      out.ph.push(-2*Math.PI*(W6.td/1000)*fs[i]);   /* rad */
      out.tau.push(W6.td);                          /* ms */
    }
  } else if(W6.mode==='lpf'){
    var fc=1000;
    for(i=0;i<fs.length;i++){
      var f=fs[i];
      out.amp.push(-10*Math.log10(1+(f/fc)*(f/fc)));
      out.ph.push(-Math.atan(f/fc));
      out.tau.push(1000*fc/(fc*fc+f*f));
    }
  } else {
    for(i=0;i<fs.length;i++){
      var fr=fs[i];
      var il=0;
      if(fr<300) il=30*Math.pow(Math.log10(300/fr),2);
      else if(fr>3400) il=30*Math.pow(Math.log10(fr/3400),2);
      out.amp.push(-il);
      out.tau.push(W6.td+0.55*Math.pow(fr/1000-1,2));
    }
    /* 相频由群时延数值积分得到 */
    var ph=0, df=0;
    for(i=0;i<fs.length;i++){
      if(i>0){
        df=fs[i]-fs[i-1];
        ph+=-2*Math.PI*((out.tau[i]+out.tau[i-1])/2/1000)*df;
      }
      out.ph.push(ph);
    }
  }
  return out;
}
function w6Draw(){
  var svg=document.getElementById('w6');
  clr(svg);
  var d=w6Data();
  var panels=[
    {x:34,y:44,w:222,h:212,key:'amp',yl:'幅频 / dB',col:'var(--primary)'},
    {x:284,y:44,w:222,h:212,key:'ph',yl:'相频 / rad',col:'var(--blue)'},
    {x:534,y:44,w:222,h:212,key:'tau',yl:'群时延 / ms',col:'var(--warm)'}
  ];
  var logs=[0,10000];
  for(var pi=0;pi<panels.length;pi++){
    var P=panels[pi];
    var arr=d[P.key];
    var lo=Infinity, hi=-Infinity;
    for(var i=0;i<arr.length;i++){ if(arr[i]<lo)lo=arr[i]; if(arr[i]>hi)hi=arr[i]; }
    var pad=(hi-lo)*0.12; if(pad<1e-9) pad=1;
    lo-=pad; hi+=pad;
    el('rect',{x:P.x,y:P.y,width:P.w,height:P.h,fill:'#fbfaf7',stroke:'var(--line)',rx:8},svg);
    function PX(f){ return P.x+(f-logs[0])/(logs[1]-logs[0])*P.w; }
    function PY(v){ return P.y+P.h-(v-lo)/(hi-lo)*P.h; }
    var fts=[0,2500,5000,7500,10000];
    for(var t=0;t<fts.length;t++){
      el('line',{x1:PX(fts[t]),y1:P.y,x2:PX(fts[t]),y2:P.y+P.h,stroke:'var(--line-soft)','stroke-width':1},svg);
      txt(svg,PX(fts[t]),P.y+P.h+13,(fts[t]===0?'0':(fts[t]/1000+'k')),
        {'text-anchor':'middle','font-size':9,fill:'var(--muted)'});
    }
    var ny=4;
    for(var q=0;q<=ny;q++){
      var v=lo+(hi-lo)*q/ny;
      el('line',{x1:P.x,y1:PY(v),x2:P.x+P.w,y2:PY(v),stroke:'var(--line-soft)','stroke-width':1},svg);
      txt(svg,P.x-5,PY(v)+3.5,v.toFixed(v<10?2:(v<100?1:0)),
        {'text-anchor':'end','font-size':9,fill:'var(--muted)'});
    }
    var pts=[];
    for(var q2=0;q2<d.f.length;q2++) pts.push([PX(d.f[q2]),PY(d[P.key][q2])]);
    el('path',{d:pathD(pts),fill:'none',stroke:P.col,'stroke-width':2.3},svg);
    txt(svg,P.x+P.w/2,P.y-8,P.yl,{'text-anchor':'middle','font-size':11,fill:P.col,'font-weight':'600'});
  }
  txt(svg,34,24,'幅频特性 |H(ω)|',{'font-size':11.5,fill:'var(--ink)','font-weight':'600'});
  txt(svg,284,24,'相频特性 φ(ω)',{'font-size':11.5,fill:'var(--ink)','font-weight':'600'});
  txt(svg,534,24,'群时延特性 τ(ω) = dφ/dω',{'font-size':11.5,fill:'var(--ink)','font-weight':'600'});
  txt(svg,145,290,'频率 f / Hz（线性轴：相频 φ = ωt_d 才会显示为直线）',{'text-anchor':'middle','font-size':10,fill:'var(--muted)'});

  var tauMax=0, tauMin=1e9;
  for(var q3=0;q3<d.tau.length;q3++){ if(d.tau[q3]>tauMax)tauMax=d.tau[q3]; if(d.tau[q3]<tauMin)tauMin=d.tau[q3]; }
  var flat=(tauMax-tauMin)<0.02;
  fillRo(document.getElementById('w6ro'),[
    ['τ(ω) 是否常数', flat?'<b style="color:var(--primary)">是（无失真）</b>':'<b style="color:var(--warm)">否（有群时延失真）</b>'],
    ['τ 范围', fmtN(tauMin,3)+' ~ '+fmtN(tauMax,3)+' ms'],
    ['|H(ω)| 起伏', fmtN(Math.abs(d.amp[0]-d.amp[d.amp.length-1]),1)+' dB']
  ]);
  var caps={
    ideal:'<b>理想无失真传输：</b>幅频是一条水平直线（|H| = K），相频是过原点的直线（φ = ωt_d），'+
      '因此群时延恒为 t_d = '+fmtN(W6.td,2)+' ms。<b>波形只被延迟和缩放，一点形状都不变</b>——这就是"无失真"的含义。',
    real:'<b>实际电话信道：</b>幅频两端上翘（插入损耗最大可达 30~40 dB），中间 300~3400 Hz 较平坦；'+
      '群时延在中频平坦、两端明显上翘。<b>群时延不是常数 ⇒ 相频失真 ⇒ 数字信号码元间串扰</b>，'+
      '必须用均衡器补偿。这就是为什么长话线路要装均衡器。',
    lpf:'<b>一阶低通网络：</b>|H| = −10lg(1+(f/f_c)²) 单调下降，φ = −arctan(f/f_c) 不是直线，'+
      '群时延 τ = f_c/(f_c²+f²) 随频率下降。<b>这是一个典型的"幅频 + 相频"双重失真例子</b>，'+
      '与习题 4-4 图 P4-1 的 R–L 网络属于同一类问题。'
  };
  document.getElementById('w6cap').innerHTML=caps[W6.mode];
}
function w6Init(){
  var modes=document.querySelectorAll('#s7 [data-m]');
  for(var i=0;i<modes.length;i++){
    modes[i].addEventListener('click',function(){
      var a=document.querySelectorAll('#s7 [data-m]');
      for(var j=0;j<a.length;j++) a[j].classList.remove('on');
      this.classList.add('on');
      W6.mode=this.getAttribute('data-m');
      w6Draw();
    });
  }
  var sl=document.getElementById('w6td');
  sl.addEventListener('input',function(){
    W6.td=parseFloat(sl.value);
    document.getElementById('w6tdv').textContent=fmtN(W6.td,1)+' ms';
    w6Draw();
  });
  w6Draw();
}

/* ================= W7 多径效应 ================= */
var W7={tau:2,fc:1000};
function w7Draw(){
  var svg=document.getElementById('w7');
  clr(svg);
  var tau=W7.tau*1e-6;          /* s */
  var fcoh=1/tau;               /* Hz */
  var rng=new lcg(20261004);

  /* 上：窄带信号与随机包络（载波频率按比例缩小以便观察） */
  var bx=44, by=34, bw=700, bh=162;
  txt(svg,bx+2,20,'r(t) = V(t)·cos[ω_c t + φ(t)]　　包络 V(t) 服从瑞利分布（随机仿真）',
    {'font-size':10.5,fill:'var(--ink2)'});
  legend(svg,bx+bw-186,6,[{t:'信号 r(t)',c:'var(--primary)'},{t:'包络 ±V(t)',c:'var(--warm)'}],10);
  el('rect',{x:bx,y:by,width:bw,height:bh,fill:'#fbfaf7',stroke:'var(--line)',rx:8},svg);
  var mid=by+bh/2;
  el('line',{x1:bx,y1:mid,x2:bx+bw,y2:mid,stroke:'var(--line)','stroke-width':1},svg);
  var N=700, TW=12*tau;
  var fdisp=4/TW;
  var rng=new lcg(20261004);
  var envTop=[], envBot=[], sig=[];
  var omegas=[], phases=[];
  var KK=24;
  for(var k=0;k<KK;k++){
    omegas.push(2*Math.PI*fcoh*(0.85+0.30*rng.next()));
    phases.push(2*Math.PI*rng.next());
  }
  var ampN=Math.sqrt(KK/2);
  var Vs=[], PHs=[], vmax=0;
  for(var i=0;i<=N;i++){
    var t=i/N*TW;
    var re=0, im=0;
    for(var k2=0;k2<KK;k2++){
      re+=Math.cos(omegas[k2]*t+phases[k2]);
      im+=Math.sin(omegas[k2]*t+phases[k2]);
    }
    var V=Math.sqrt(re*re+im*im)/ampN;
    Vs.push(V); PHs.push(Math.atan2(im,re));
    if(V>vmax) vmax=V;
  }
  /* 包络自适应缩放：始终严格落在面板内，且不出现被削平的平台 */
  var half=bh/2-9;
  for(var i=0;i<=N;i++){
    var t=i/N*TW;
    var x=bx+bw*i/N;
    var off=Vs[i]/vmax*half;
    envTop.push([x, mid-off]);
    envBot.push([x, mid+off]);
    sig.push([x, mid-off*Math.cos(2*Math.PI*fdisp*t+PHs[i])]);
  }
  el('path',{d:pathD(envTop)+pathD(envBot.slice().reverse()),fill:'rgba(201,123,63,.12)',stroke:'none'},svg);
  el('path',{d:pathD(envTop),fill:'none',stroke:'var(--warm)','stroke-width':2},svg);
  el('path',{d:pathD(envBot),fill:'none',stroke:'var(--warm)','stroke-width':2},svg);
  el('path',{d:pathD(sig),fill:'none',stroke:'var(--primary)','stroke-width':1.2},svg);
  txt(svg,bx,by+bh+16,'显示窗口 = 12 τ（载波频率已按比例缩小以便观察，实际载频 '+W7.fc+' MHz）　衰落零点间隔 1/τ = '+fmtN(fcoh/1e6,3)+' MHz',
    {'font-size':10,fill:'var(--muted)'});

  /* 下：|1+e^{-jωτ}| 幅频 */
  var cy0=238, ch=132;
  var fmax=4*fcoh;
  var box={x:44,y:cy0,w:700,h:ch};
  var F=frame(svg,box,[0,fmax],[0,2.1],'频率 f / Hz','|1 + e^(−jωτ)|',{xt:fmax/4,yt:0.5,xdp:2,ydp:1,hideX:true});
  var pts=[];
  for(var f=0;f<=fmax;f+=fmax/400){
    var ang=2*Math.PI*f*tau;
    var v=Math.sqrt(Math.pow(1+Math.cos(ang),2)+Math.pow(Math.sin(ang),2));
    pts.push([F.X(f),F.Y(v)]);
  }
  el('path',{d:pathD(pts),fill:'none',stroke:'var(--blue)','stroke-width':2.3},svg);
  /* 零点 */
  for(var n=1;n<=4;n++){
    var fz=n*fcoh;
    if(fz>fmax) break;
    el('circle',{cx:F.X(fz),cy:F.Y(0),r:3.6,fill:'var(--warm)'},svg);
    txt(svg,F.X(fz),F.Y(0)-8,'零点 '+fmtN(fz/1e6,2)+' MHz',{'text-anchor':'middle','font-size':9.5,fill:'var(--warm)'});
  }
  var xts=[0,1,2,3,4];
  for(var q=0;q<xts.length;q++){
    var fxv=xts[q]*fcoh;
    el('line',{x1:F.X(fxv),y1:box.y+box.h,x2:F.X(fxv),y2:box.y+box.h+5,stroke:'var(--line)','stroke-width':1},svg);
    txt(svg,F.X(fxv),box.y+box.h+16,fmtN(fxv/1e6,2)+' MHz',{'text-anchor':'middle','font-size':9.5,fill:'var(--muted)'});
  }
  txt(svg,F.X(fmax/2),F.Y(2.1)+0.16,'|1+e^(−jωτ)| = 2|cos(ωτ/2)|　最大 2，最小 0（教材式 4.4-11）',
    {'text-anchor':'middle','font-size':10,fill:'var(--muted)'});

  /* 当前载频位置 */
  var ang2=2*Math.PI*(W7.fc*1e6)*tau;
  var mag=Math.sqrt(Math.pow(1+Math.cos(ang2),2)+Math.pow(Math.sin(ang2),2));
  var phase=-Math.PI*(W7.fc*1e6)*tau;
  while(phase<-Math.PI) phase+=2*Math.PI;
  while(phase>Math.PI) phase-=2*Math.PI;
  fillRo(document.getElementById('w7ro'),[
    ['衰落零点间隔 Δf = 1/τ', '<b style="color:var(--primary)">'+fmtN(fcoh/1e6,3)+' MHz</b>'],
    ['衰落零点频率 n/τ', fmtN(fcoh/1e6,3)+' MHz 的整数倍'],
    ['载频 f_c', W7.fc+' MHz'],
    ['|H(f_c)|', '<b style="color:var(--warm)">'+fmtN(mag,3)+'</b>'],
    ['附加相位（取主值）', fmtN(phase,3)+' rad']
  ]);
  document.getElementById('w7cap').innerHTML=
    '当前 τ = '+fmtN(W7.tau,1)+' μs ⇒ 衰落零点间隔 Δf = 1/τ = <b>'+fmtN(fcoh/1e6,3)+' MHz</b>，'+
    '衰落零点出现在 f = n/τ = '+fmtN(fcoh/1e6,3)+' MHz 的整数倍处。'+
    '工作载频 <b>'+W7.fc+' MHz</b> 处的合成增益 |1+e<sup>−jωτ</sup>| = <b>'+fmtN(mag,3)+'</b>'+
    (mag<0.4?'，<b>正好落在衰落谷里</b>——此时即使发射功率翻倍也收不到多少信号。这就是频率选择性衰落。':
      (mag<1?'，已处于衰落较深的位置。':'，该点位于衰落脊附近，信号较强。'))+
    '若信号带宽 B<sub>s</sub> ≫ 1/τ，不同频率分量受到的衰落差异巨大，接收信号严重畸变。'+
    '<br><span style="color:var(--muted)">辨析：本节的 τ 是<b>两径的相对时延差</b>，1/τ 是相邻衰落零点的间隔；'+
    '§4.4 的<b>相关带宽 Δf = 1/τ<sub>m</sub></b> 用的是<b>最大时延扩展 τ<sub>m</sub></b>（各径时延散布的范围）。'+
    '两者都量出"信道能挑多细的频率"，但 τ ≠ τ<sub>m</sub>，数值不能直接互套。</span>';
}

/* ================= W7 初始化 ================= */
function w7Init(){
  function upd(){
    W7.tau=parseFloat(document.getElementById('w7tau').value);
    W7.fc=parseFloat(document.getElementById('w7fc').value);
    document.getElementById('w7tauv').textContent=fmtN(W7.tau,1)+' μs';
    document.getElementById('w7fcv').textContent=W7.fc+' MHz';
    w7Draw();
  }
  document.getElementById('w7tau').addEventListener('input',upd);
  document.getElementById('w7fc').addEventListener('input',upd);
  upd();
}

/* ================= W8 相关带宽与码元宽度 ================= */
var W8={tm:2};
function w8Draw(){
  var svg=document.getElementById('w8');
  clr(svg);
  var tm=W8.tm*1e-6;
  var df=1/tm;
  var bsLo=df/5, bsHi=df/3;
  var tsLo=3*tm, tsHi=5*tm;
  var rbLo=1/tsHi, rbHi=1/tsLo;

  /* 频率域条 */
  var bx=110, by=52, bw=580;
  var fLo=Math.log10(df/50), fHi=Math.log10(df*2);
  function FX(f){ return bx+(Math.log10(f)-fLo)/(fHi-fLo)*bw; }
  el('rect',{x:bx,y:by,width:bw,height:34,fill:'rgba(47,111,94,.08)',stroke:'#2f6f5e',
    'stroke-width':1.2,rx:6},svg);
  txt(svg,bx-8,by+21,'信道相干带宽 Δf',{'text-anchor':'end','font-size':11,fill:'#2f6f5e','font-weight':'600'});
  el('rect',{x:FX(bsLo),y:by+4,width:Math.max(2,FX(bsHi)-FX(bsLo)),height:26,
    fill:'rgba(201,123,63,.35)',stroke:'var(--warm)','stroke-width':1.2,rx:4},svg);
  txt(svg,(FX(bsLo)+FX(bsHi))/2,by+21,'推荐信号带宽 B_s',{'text-anchor':'middle','font-size':9.5,fill:'#a05f2c','font-weight':'600'});
  el('line',{x1:FX(df),y1:by-6,x2:FX(df),y2:by+40,stroke:'var(--primary)','stroke-width':1.3},svg);
  txt(svg,FX(df),by-12,'Δf = 1/τ_m',{'text-anchor':'middle','font-size':10,fill:'var(--primary)','font-weight':'600'});
  var fts=[df/50,df/10,df/2,df,df*2];
  for(var i=0;i<fts.length;i++){
    el('line',{x1:FX(fts[i]),y1:by+36,x2:FX(fts[i]),y2:by+42,stroke:'var(--line)','stroke-width':1},svg);
    txt(svg,FX(fts[i]),by+55,fmtFreq(fts[i]),{'text-anchor':'middle','font-size':9.5,fill:'var(--muted)'});
  }
  txt(svg,bx+bw,by+78,'频率（对数）',{'text-anchor':'end','font-size':10,fill:'var(--muted)'});

  /* 时间域条 */
  var ty=150, th=34, tmax=6*tm;
  function TX(t){ return bx+t/tmax*bw; }
  el('rect',{x:bx,y:ty,width:bw,height:th,fill:'rgba(74,111,165,.08)',stroke:'#4a6fa5',
    'stroke-width':1.2,rx:6},svg);
  txt(svg,bx-8,ty+21,'时延扩展 τ_m',{'text-anchor':'end','font-size':11,fill:'#3b5a86','font-weight':'600'});
  el('rect',{x:TX(tsLo),y:ty+4,width:Math.max(2,TX(tsHi)-TX(tsLo)),height:26,
    fill:'rgba(176,99,103,.35)',stroke:'var(--rose)','stroke-width':1.2,rx:4},svg);
  txt(svg,(TX(tsLo)+TX(tsHi))/2,ty+21,'码元宽度 T_s',{'text-anchor':'middle','font-size':9.5,fill:'#96525a','font-weight':'600'});
  el('line',{x1:TX(tm),y1:ty-6,x2:TX(tm),y2:ty+40,stroke:'#3b5a86','stroke-width':1.3},svg);
  txt(svg,TX(tm),ty-12,'τ_m',{'text-anchor':'middle','font-size':10,fill:'#3b5a86','font-weight':'600'});
  var tts=[0,tm,2*tm,4*tm,6*tm];
  for(var j=0;j<tts.length;j++){
    el('line',{x1:TX(tts[j]),y1:ty+36,x2:TX(tts[j]),y2:ty+42,stroke:'var(--line)','stroke-width':1},svg);
    txt(svg,TX(tts[j]),ty+55,fmtTime(tts[j]),{'text-anchor':'middle','font-size':9.5,fill:'var(--muted)'});
  }
  txt(svg,bx+bw,ty+78,'时间（线性）',{'text-anchor':'end','font-size':10,fill:'var(--muted)'});

  fillRo(document.getElementById('w8ro'),[
    ['τ_m（最大相对时延差）', fmtN(W8.tm,1)+' μs'],
    ['Δf = 1/τ_m', '<b style="color:var(--primary)">'+fmtFreq(df)+'</b>'],
    ['推荐 B_s = (1/3~1/5)Δf', fmtFreq(bsLo)+' ~ '+fmtFreq(bsHi)],
    ['推荐 T_s = (3~5)τ_m', fmtTime(tsLo)+' ~ '+fmtTime(tsHi)],
    ['码元速率 R_B = 1/T_s', fmtBaud(rbLo)+' ~ '+fmtBaud(rbHi)]
  ]);
  document.getElementById('w8cap').innerHTML=
    '当前 τ<sub>m</sub> = '+fmtN(W8.tm,1)+' μs：相关带宽 <b>Δf = '+fmtFreq(df)+'</b>，'+
    '因此信号带宽应取 <b>'+fmtFreq(bsLo)+' ~ '+fmtFreq(bsHi)+'</b>（不超过 Δf 的 1/3~1/5），'+
    '码元宽度应取 <b>'+fmtTime(tsLo)+' ~ '+fmtTime(tsHi)+'</b>，'+
    '对应码元速率只能到 <b>'+fmtBaud(rbLo)+' ~ '+fmtBaud(rbHi)+'</b>。'+
    '<b>这就是"抗衰落"与"高码元速率"之间最直接的取舍</b>：多径越严重（τ_m 越大），能跑的最高速率就越低。';
}
function fmtFreq(v){
  if(v>=1e6) return fmtN(v/1e6,3)+' MHz';
  if(v>=1e3) return fmtN(v/1e3,3)+' kHz';
  return fmtN(v,3)+' Hz';
}
function fmtTime(sec){
  if(sec>=1) return fmtN(sec,2)+' s';
  if(sec>=1e-3) return fmtN(sec*1e3,2)+' ms';
  if(sec>=1e-6) return fmtN(sec*1e6,2)+' μs';
  return fmtN(sec*1e9,2)+' ns';
}
function fmtBaud(v){
  if(v>=1e6) return fmtN(v/1e6,3)+' MBd';
  if(v>=1e3) return fmtN(v/1e3,3)+' kBd';
  return fmtN(v,3)+' Bd';
}

/* ================= W8 初始化 ================= */
function w8Init(){
  var sl=document.getElementById('w8tm');
  sl.addEventListener('input',function(){
    W8.tm=parseFloat(sl.value);
    document.getElementById('w8tmv').textContent=fmtN(W8.tm,1)+' μs';
    w8Draw();
  });
  w8Draw();
}

/* ================= W9 热噪声 ================= */
var W9={t:27,b:6,r:600};
function w9Draw(){
  var svg=document.getElementById('w9');
  clr(svg);
  var k=1.38e-23, Tk=W9.t+273.15, BHz=W9.b*1e6, R=W9.r;
  function vn(bHz){ return Math.sqrt(4*k*Tk*R*bHz); }
  /* 左：V vs B */
  var Bmax=100;
  var vMaxB=vn(Bmax*1e6)*1e6*1.14;
  var b1={x:60,y:26,w:330,h:200};
  var F1=frame(svg,b1,[0,Bmax],[0,vMaxB],'带宽 B / MHz','V_n / μV',{xt:20,yt:vMaxB/4,xdp:0,ydp:1});
  var pts=[];
  for(var i=0;i<=120;i++){
    var b=Bmax*i/120;
    pts.push([F1.X(b),F1.Y(vn(b*1e6)*1e6)]);
  }
  el('path',{d:pathD(pts),fill:'none',stroke:'var(--primary)','stroke-width':2.3},svg);
  var cur=vn(BHz)*1e6;
  el('circle',{cx:F1.X(W9.b),cy:F1.Y(cur),r:5,fill:'var(--warm)',stroke:'#fff','stroke-width':1.5},svg);
  txt(svg,F1.X(W9.b)+9,F1.Y(cur)-8,'当前 '+fmtN(cur,2)+' μV',{'font-size':10,fill:'var(--warm)','font-weight':'600'});
  txt(svg,b1.x+6,b1.y+16,'V ∝ √B',{'font-size':10,fill:'var(--muted)'});
  /* 右：V vs T */
  var Tmax=100;
  var vMaxT=cur*Math.sqrt((Tmax+273.15)/Tk)*1.14;
  var b2={x:450,y:26,w:294,h:200};
  var F2=frame(svg,b2,[0,Tmax],[0,vMaxT],'温度 T / °C','V_n / μV',{xt:20,yt:vMaxT/4,xdp:0,ydp:1});
  var pts2=[];
  for(var j=0;j<=100;j++){
    var tc=j;
    var v=Math.sqrt(4*k*(tc+273.15)*R*BHz)*1e6;
    pts2.push([F2.X(tc),F2.Y(v)]);
  }
  el('path',{d:pathD(pts2),fill:'none',stroke:'var(--warm)','stroke-width':2.3},svg);
  el('circle',{cx:F2.X(W9.t),cy:F2.Y(cur),r:5,fill:'var(--primary)',stroke:'#fff','stroke-width':1.5},svg);
  txt(svg,b2.x+6,b2.y+16,'V ∝ √T',{'font-size':10,fill:'var(--muted)'});
  txt(svg,34,242,'V = √(4kTRB)，k = 1.38×10⁻²³ J/K，T 用开尔文（℃ + 273）',{'font-size':10.5,fill:'var(--ink2)'});

  var pw=4*k*Tk*R*BHz;
  fillRo(document.getElementById('w9ro'),[
    ['噪声电压有效值 V_n', '<b style="color:var(--primary)">'+fmtN(cur,3)+' μV</b>'],
    ['噪声功率 4kTRB', fmtE(pw)+' W'],
    ['等效噪声带宽 B', W9.b+' MHz'],
    ['绝对温度 T', fmtN(Tk,1)+' K']
  ]);
  document.getElementById('w9cap').innerHTML=
    '当前 R = '+W9.r+' Ω、B = '+W9.b+' MHz、T = '+W9.t+' °C（= '+fmtN(Tk,1)+' K）：'+
    'V<sub>n</sub> = √(4kTRB) = <b>'+fmtN(cur,3)+' μV</b>，对应噪声功率 <b>'+fmtE(pw)+' W</b>。'+
    (Math.abs(cur-7.72)<0.05?'<b>这正是教材习题 4-5 的答案（600 Ω、6 MHz、27 °C ⇒ 7.72 μV）。</b>':
      '注意结论只与 R、T、B 有关，<b>与信号完全无关</b>——噪声是信道的"固有财产"，信号强弱改不了它。')+
    '想降低噪声只有三条路：<b>降温、减小带宽、减小阻值</b>。';
}
function w9Init(){
  function upd(){
    W9.t=parseFloat(document.getElementById('w9t').value);
    W9.b=parseFloat(document.getElementById('w9b').value);
    W9.r=parseFloat(document.getElementById('w9r').value);
    document.getElementById('w9tv').textContent=W9.t+' °C';
    document.getElementById('w9bv').textContent=fmtN(W9.b,1)+' MHz';
    document.getElementById('w9rv').textContent=W9.r+' Ω';
    w9Draw();
  }
  ['w9t','w9b','w9r'].forEach(function(id){ document.getElementById(id).addEventListener('input',upd); });
  var pres=document.querySelectorAll('#s10 [data-preset]');
  for(var i=0;i<pres.length;i++){
    pres[i].addEventListener('click',function(){
      var p=this.getAttribute('data-preset');
      if(p==='ex45'){ W9.t=27; W9.b=6; W9.r=600; }
      else { W9.t=27; W9.b=1; W9.r=1000; }
      document.getElementById('w9t').value=W9.t;
      document.getElementById('w9b').value=W9.b;
      document.getElementById('w9r').value=W9.r;
      upd();
    });
  }
  upd();
}

/* ================= W10 噪声等效带宽 ================= */
var W10={mode:'rect'};
/* 三种接收滤波器的功率谱形状，均以"3 dB 带宽 B₃dB"为共同尺度：
   rect  —— 矩形，|Δf| ≤ B₃dB/2 内为 1（矩形没有 -3dB 拐点，宽度即名义带宽）
   gauss —— 高斯，σ = B₃dB/(2√ln2)，此时 3 dB 带宽恰为 B₃dB
   rc    —— 升余弦，-3 dB 点落在 ±B₃dB/2，过渡带延伸至 ±B₃dB */
var RC_A3=Math.acos(Math.SQRT2-1)/Math.PI;   /* = 0.36421，使 H(x₃)=1/√2 */
function w10Shape(f,fo,B3,alpha){
  var x=Math.abs(f-fo);
  if(W10.mode==='rect') return (x<=B3/2)?1:0;
  if(W10.mode==='gauss'){
    var sg=B3/(2*Math.sqrt(Math.log(2)));
    return Math.exp(-(f-fo)*(f-fo)/(2*sg*sg));
  }
  var x3=B3/2, tr=x3, w0=x3*(1-RC_A3);
  if(x<=w0) return 1;
  if(x>=w0+tr) return 0;
  var a=(x-w0)/tr;
  return 0.5*(1+Math.cos(Math.PI*a));
}
function w10Draw(){
  var svg=document.getElementById('w10');
  clr(svg);
  var fo=5000, B3=1000, alpha=0.5;
  /* 教材式 (4.5-3) 右端：B_n = ∫₀^∞ P_n(f)df / P_n(f₀)。
     P_n(f₀) 已归一化为 1，故 B_n 就是正频率侧曲线下的面积。
     f₀ = 5000 Hz ≫ B₃dB = 1000 Hz，符合"窄带噪声"（负频率镜像可忽略）。 */
  var N=24000, spanI=12000, df=spanI/N, tot=0;
  for(var i=0;i<N;i++){
    var f=fo-spanI/2+df*(i+0.5);
    tot+=w10Shape(f,fo,B3,alpha)*df;
  }
  var bn=tot;            /* 等效带宽：正频率侧面积（P_n(f₀)=1） */
  var b3=B3;
  var span=6000;        /* 绘图区频率范围（积分范围比绘图区宽，尾部不丢） */
  var box={x:60,y:28,w:600,h:196};
  var F=frame(svg,box,[fo-span/2,fo+span/2],[0,1.12],'频率 f / Hz','P_n(f) / P_n(f₀)',{xt:500,yt:0.2,xdp:0,ydp:1});
  var pts=[];
  for(var q=0;q<=600;q++){
    var f=fo-span/2+span*q/600;
    pts.push([F.X(f),F.Y(w10Shape(f,fo,B3,alpha))]);
  }
  el('path',{d:pathD(pts),fill:'none',stroke:'var(--primary)','stroke-width':2.3},svg);
  /* 等效矩形：高度 = P_n(f₀)，宽度 = B_n ⇒ 面积 = 正频率侧曲线下的面积 */
  var rw=bn;
  el('rect',{x:F.X(fo-rw/2),y:F.Y(1),width:Math.max(2,F.X(fo+rw/2)-F.X(fo-rw/2)),height:F.Y(0)-F.Y(1),
    fill:'rgba(201,123,63,.22)',stroke:'var(--warm)','stroke-width':1.4},svg);
  el('line',{x1:F.X(fo),y1:F.Y(1),x2:F.X(fo),y2:F.Y(0),stroke:'var(--warm)','stroke-width':1.1,'stroke-dasharray':'4 3'},svg);
  txt(svg,F.X(fo),F.Y(1)-8,'P_n(f₀)',{'text-anchor':'middle','font-size':10,fill:'var(--warm)','font-weight':'600'});
  txt(svg,box.x+box.w-6,box.y+16,'等效矩形带宽 B_n = '+fmtN(bn,1)+' Hz',
    {'text-anchor':'end','font-size':10.5,fill:'var(--warm)','font-weight':'600'});
  txt(svg,box.x+6,box.y+16,'实际接收滤波器特性',{'font-size':10,fill:'var(--muted)'});

  fillRo(document.getElementById('w10ro'),[
    ['噪声等效带宽 B_n', '<b style="color:var(--primary)">'+fmtN(bn,1)+' Hz</b>'],
    ['3 dB 带宽 B₃dB', fmtN(b3,1)+' Hz'],
    ['B_n / B₃dB', fmtN(bn/b3,4)],
    ['矩形滤波器情形', 'B_n = B₃dB']
  ]);
  var caps={
    rect:'<b>矩形滤波器</b>：功率谱本身就是矩形，等效带宽 <b>B_n = B₃dB = '+fmtN(b3,0)+' Hz</b>。'+
      '这是最"诚实"的一种：噪声功率 = 带宽 × 峰值功率谱密度，一目了然，橙色等效矩形与绿色曲线完全重合。',
    gauss:'<b>高斯型滤波器</b>：功率谱是钟形。按教材式 (4.5-3) 算出 <b>B_n ≈ '+fmtN(bn/b3,3)+'·B₃dB</b>——'+
      '<b>比 3 dB 带宽还大</b>。钟形曲线拖出去的尾巴也要算进噪声功率，所以等效矩形比 3 dB 带宽宽。',
    rc:'<b>升余弦型滤波器</b>（过渡带自 ±B₃dB/2 延伸到 ±B₃dB）：按式 (4.5-3) 算出 <b>B_n ≈ '+fmtN(bn/b3,3)+'·B₃dB</b>。'+
      '比 3 dB 带宽宽一点，但比高斯型的 1.505 窄。<b>规律：功率谱越接近矩形，等效矩形就越贴近 3 dB 带宽</b>；'+
      '高斯型拖尾最长，等效带宽最大。所以"3 dB 带宽"和"噪声等效带宽"必须分清——'+
      '算噪声功率要用后者。'
  };
  document.getElementById('w10cap').innerHTML=caps[W10.mode]+'　'+
    '<b>物理意义重申：</b>通过宽度为 B<sub>n</sub> 的矩形滤波器的噪声功率 = 通过实际接收滤波器的噪声功率。'+
    '于是无论滤波器什么形状，噪声功率都可以用"<b>等效带宽 × 峰值功率谱密度</b>"算出来——这是第 6、7 章算误码率时的通用前提。';
}
function w10Init(){
  var modes=document.querySelectorAll('#s10 [data-m]');
  for(var i=0;i<modes.length;i++){
    modes[i].addEventListener('click',function(){
      var a=document.querySelectorAll('#s10 [data-m]');
      for(var j=0;j<a.length;j++) a[j].classList.remove('on');
      this.classList.add('on');
      W10.mode=this.getAttribute('data-m');
      w10Draw();
    });
  }
  w10Draw();
}

/* ================= W11 离散信道容量 ================= */
var W11={mode:'quad',e:1,r:1000};
function w11Calc(){
  var M=(W11.mode==='bin')?2:4;
  var px=(W11.mode==='bin')?[0.5,0.5]:[0.25,0.25,3/16,5/16];
  var k=W11.e/1024;
  var py=[], post=[];
  for(var i=0;i<M;i++){
    var s=0;
    for(var j=0;j<M;j++){
      var cond=(i===j)?(1-(M-1)*k):k;
      s+=px[j]*cond;
    }
    py.push(s);
  }
  for(var i2=0;i2<M;i2++){
    var row=[];
    for(var j2=0;j2<M;j2++){
      var cond2=(i2===j2)?(1-(M-1)*k):k;
      row.push(px[j2]*cond2/py[i2]);
    }
    post.push(row);
  }
  var Hx=0;
  for(var a=0;a<M;a++) Hx-=px[a]*Math.log(px[a])/Math.LN2;
  var Hxy=0;
  for(var b=0;b<M;b++) for(var c=0;c<M;c++) Hxy-=py[b]*post[b][c]*Math.log(post[b][c])/Math.LN2;
  return {M:M,px:px,py:py,post:post,Hx:Hx,Hxy:Hxy,C:Hx-Hxy,Ct:(Hx-Hxy)*W11.r};
}
function w11Draw(){
  var svg=document.getElementById('w11');
  clr(svg);
  var d=w11Calc();
  var names=(d.M===2)?['0','1']:['A','B','C','D'];
  var bx=96, by=44, bw=580, bh=40;
  var Cw=bw*d.C/d.Hx;
  el('rect',{x:bx,y:by,width:Cw,height:bh,rx:5,fill:'rgba(47,111,94,.22)',stroke:'#2f6f5e','stroke-width':1.3},svg);
  el('rect',{x:bx+Cw,y:by,width:bw-Cw,height:bh,rx:5,fill:'rgba(176,99,103,.28)',stroke:'#b06367','stroke-width':1.3},svg);
  txt(svg,bx+10,by+25,'有效信息 C = '+fmtN(d.C,4)+' b/符号',{'font-size':11.5,fill:'#2f6f5e','font-weight':'600'});
  txt(svg,bx+Cw+10,by+25,'噪声损失 H(x/y) = '+fmtN(d.Hxy,4),{'font-size':11.5,fill:'#96525a','font-weight':'600'});
  txt(svg,bx,by-10,'H(x) = '+fmtN(d.Hx,4)+' b/符号',{'font-size':11,fill:'var(--ink2)'});
  txt(svg,bx+bw,by-10,'（条带总长 = H(x)）',{'text-anchor':'end','font-size':10,fill:'var(--muted)'});

  txt(svg,96,126,'信源符号概率 P(x)',{'font-size':11.5,fill:'var(--ink)','font-weight':'600'});
  var n=d.M, gap=16, barW=(600-gap*(n-1))/n;
  for(var i=0;i<n;i++){
    var x=96+i*(barW+gap);
    var h=Math.max(3,d.px[i]/0.35*80);
    el('rect',{x:x,y:206-h,width:barW,height:h,rx:4,fill:'rgba(47,111,94,.45)',stroke:'#2f6f5e','stroke-width':1.1},svg);
    txt(svg,x+barW/2,206+15,names[i],{'text-anchor':'middle','font-size':11,fill:'var(--ink2)','font-weight':'600'});
    txt(svg,x+barW/2,206-h-7,'P='+fmtN(d.px[i],4),{'text-anchor':'middle','font-size':9.5,fill:'var(--primary)'});
  }
  el('line',{x1:96,y1:206,x2:696,y2:206,stroke:'var(--line)','stroke-width':1.2},svg);
  txt(svg,700,206,'H(x)',{'font-size':10,fill:'var(--muted)'});
  txt(svg,96,244,'错误转移概率：P(正确|接收) = '+fmtN(1-(d.M-1)*W11.e/1024,6)+
    '，P(某一错符号|接收) = '+fmtN(W11.e/1024,6)+'，符号速率 r = '+W11.r+' 符号/s',
    {'font-size':10,fill:'var(--muted)'});
  txt(svg,96,262,'收端后验概率 P(x_i/y_j) 由贝叶斯公式 P(x_i|y_j) = P(x_i)·P(y_j|x_i)/P(y_j) 逐项算出。',
    {'font-size':10,fill:'var(--muted)'});

  fillRo(document.getElementById('w11ro'),[
    ['H(x)　信源熵', fmtN(d.Hx,4)+' b/符号'],
    ['H(x/y)　噪声损失', fmtN(d.Hxy,4)+' b/符号'],
    ['C = max[H(x)−H(x/y)]', '<b style="color:var(--primary)">'+fmtN(d.C,4)+' b/符号</b>'],
    ['C_t = r·C', '<b style="color:var(--warm)">'+fmtN(d.Ct,1)+' b/s</b>'],
    ['损失占比', fmtN(d.Hxy/d.Hx*100,3)+' %']
  ]);
  document.getElementById('w11cap').innerHTML=
    '当前模型：'+(d.M===2?'<b>二元对称信道</b>（P(0)=P(1)=1/2）':'<b>四符号信道</b>（A,B,C,D 概率 1/4, 1/4, 3/16, 5/16）')+
    '，每符号错误概率 '+fmtN(W11.e/1024,6)+'（即 '+W11.e+'/1024），符号速率 '+W11.r+' 符号/s。'+
    '算得 H(x) = <b>'+fmtN(d.Hx,4)+'</b>，H(x/y) = <b>'+fmtN(d.Hxy,4)+'</b>，'+
    '故 <b>C = '+fmtN(d.C,4)+' b/符号</b>，<b>C_t = '+fmtN(d.Ct,1)+' b/s</b>。'+
    (W11.mode==='quad'&&W11.e===1?'<b>这正是教材习题 4-6 的条件</b>（正确接收概率 1021/1024，错为其它符号的条件概率均为 1/1024）。':'')+
    (W11.mode==='quad'&&W11.r===1000?'<b>这正是教材习题 4-7</b>：四进制符号速率 1000 符号/s ⇒ C_t ≈ 1944 b/s。':'')+
    (W11.mode==='bin'&&W11.e===8?'<b>这正是教材例 4-2</b>：符号错误概率 1/128，1000 符号/s ⇒ C_t = 935 b/s。':'');
}
function w11Init(){
  var modes=document.querySelectorAll('#s11 [data-m]');
  for(var i=0;i<modes.length;i++){
    modes[i].addEventListener('click',function(){
      var a=document.querySelectorAll('#s11 [data-m]');
      for(var j=0;j<a.length;j++) a[j].classList.remove('on');
      this.classList.add('on');
      W11.mode=this.getAttribute('data-m');
      if(W11.mode==='bin'){ W11.e=8; W11.r=1000; }
      else { W11.e=1; W11.r=1000; }
      document.getElementById('w11e').value=W11.e;
      document.getElementById('w11r').value=W11.r;
      document.getElementById('w11mv').textContent=(W11.mode==='bin')?'二元对称 (0/1)':'四符号 (A B C D)';
      w11Draw();
    });
  }
  function upd(){
    W11.e=parseInt(document.getElementById('w11e').value,10);
    W11.r=parseInt(document.getElementById('w11r').value,10);
    document.getElementById('w11ev').textContent=W11.e+' / 1024';
    document.getElementById('w11rv').textContent=W11.r+' 符号/s';
    w11Draw();
  }
  document.getElementById('w11e').addEventListener('input',upd);
  document.getElementById('w11r').addEventListener('input',upd);
  upd();
}

/* ================= W12 香农公式 ================= */
var W12={sdb:20,blog:1};
function w12Draw(){
  var svg=document.getElementById('w12');
  clr(svg);
  var snr0=db2lin(W12.sdb);          /* S/n0，单位 Hz */
  var B=Math.pow(10,W12.blog);       /* Hz */
  function Cb(b){ return b*Math.log(1+snr0/b)/Math.LN2; }
  var fLo=1, fHi=1e5;
  var box={x:74,y:28,w:620,h:214};
  var F=frame(svg,box,[Math.log10(fLo),Math.log10(fHi)],[0,snr0*1.5],'带宽 B / Hz（对数）','C_t / (b/s)',{xt:1,yt:snr0*1.5/4,xdp:0,ydp:0,hideX:true});
  var pts=[];
  var lx0=Math.log10(fLo), lx1=Math.log10(fHi);
  for(var i=0;i<=400;i++){
    var lx=lx0+(lx1-lx0)*i/400;
    var b=Math.pow(10,lx);
    pts.push([F.X(lx),F.Y(Math.min(snr0*1.5,Cb(b)))]);
  }
  el('path',{d:pathD(pts),fill:'none',stroke:'var(--primary)','stroke-width':2.4},svg);
  /* 渐近线 1.44 S/n0 */
  var yas=1.4427*snr0;
  if(yas<=snr0*1.5){
    el('line',{x1:box.x,x2:box.x+box.w,y1:F.Y(yas),y2:F.Y(yas),stroke:'var(--warm)',
      'stroke-width':1.5,'stroke-dasharray':'6 4'},svg);
    txt(svg,box.x+box.w-4,F.Y(yas)-7,'渐近上限 1.44·(S/n₀) = '+fmtN(yas,1),
      {'text-anchor':'end','font-size':10.5,fill:'var(--warm)','font-weight':'600'});
  }
  /* B = S/n0 */
  if(snr0>=fLo && snr0<=fHi){
    el('line',{x1:F.X(Math.log10(snr0)),y1:box.y,x2:F.X(Math.log10(snr0)),y2:box.y+box.h,
      stroke:'var(--blue)','stroke-width':1.2,'stroke-dasharray':'4 3'},svg);
    txt(svg,F.X(Math.log10(snr0))+5,box.y+32,'B = S/n₀（N = S）',{'font-size':10,fill:'var(--blue)'});
  }
  /* 工作点 */
  var cx=F.X(Math.log10(B)), cy=F.Y(Math.min(snr0*1.5,Cb(B)));
  el('circle',{cx:cx,cy:cy,r:5.5,fill:'var(--warm)',stroke:'#fff','stroke-width':1.6},svg);
  txt(svg,cx+9,cy-8,'当前工作点',{'font-size':10.5,fill:'var(--warm)','font-weight':'600'});
  var fts=[1,10,100,1000,10000,100000];
  for(var q=0;q<fts.length;q++){
    txt(svg,F.X(Math.log10(fts[q])),box.y+box.h+13,String(fts[q]),
      {'text-anchor':'middle','font-size':9.5,fill:'var(--muted)'});
  }
  txt(svg,box.x+box.w/2,16,'C_t = B·log₂(1 + S/N) = B·log₂(1 + S/(n₀B))',
    {'text-anchor':'middle','font-size':11.5,'font-weight':'600',fill:'var(--ink)'});

  var C=Cb(B), ratio=C/yas;
  var snr=snr0/B;
  fillRo(document.getElementById('w12ro'),[
    ['S / n₀', W12.sdb+' dB（'+fmtN(snr0,2)+' Hz）'],
    ['当前带宽 B', fmtN(B,2)+' Hz'],
    ['信噪比 S/N', fmtN(snr,3)],
    ['容量 C_t', '<b style="color:var(--primary)">'+fmtN(C,1)+' b/s</b>'],
    ['渐近上限 1.44·S/n₀', fmtN(yas,1)+' b/s'],
    ['已达成比例', fmtN(ratio*100,1)+' %']
  ]);
  document.getElementById('w12cap').innerHTML=
    '当前 S/n₀ = '+W12.sdb+' dB（= '+fmtN(snr0,2)+' Hz），带宽 B = '+fmtN(B,2)+' Hz，'+
    '噪声功率 N = n₀B，于是 S/N = '+fmtN(snr,3)+'，<b>C_t = B·log₂(1+S/N) = '+fmtN(C,1)+' b/s</b>。'+
    '注意曲线在 B 超过 S/n₀ 之后就<b>不再上升</b>：带宽翻倍，进来的噪声功率也跟着翻倍，'+
    '信噪比反而下降，这就是 <b>lim<sub>B→∞</sub> C_t = 1.44·(S/n₀) = '+fmtN(yas,1)+' b/s</b> 的含义。'+
    '（把 B 再扩大 10 倍，容量只增加 '+fmtN((Cb(B*10)/C-1)*100,1)+'%，几乎白费。）';
}
function w12Init(){
  function upd(){
    W12.sdb=parseInt(document.getElementById('w12s').value,10);
    W12.blog=parseFloat(document.getElementById('w12b').value);
    document.getElementById('w12sv').textContent=W12.sdb+' dB';
    document.getElementById('w12bv').textContent=fmtN(Math.pow(10,W12.blog),2)+' Hz';
    w12Draw();
  }
  document.getElementById('w12s').addEventListener('input',upd);
  document.getElementById('w12b').addEventListener('input',upd);
  upd();
}


/* ================= 分节页启动挂载 =================
   整章拆成单节页后，各节片段只启动自己用到的部件（片段尾部调用）。
   这里把启动函数挂到 window.__CH —— 浏览器与桩 DOM 检查器语义一致。 */
window.__CH = {
  wSysMap:wSysMap,
  wModModel:wModModel,
  w4Draw:w4Draw,
  w1Init:w1Init,
  w2Init:w2Init,
  w3Init:w3Init,
  w5Init:w5Init,
  w6Init:w6Init,
  w7Init:w7Init,
  w8Init:w8Init,
  w9Init:w9Init,
  w10Init:w10Init,
  w11Init:w11Init,
  w12Init:w12Init
};
})();
