const fs=require('fs');
const path=require('path');
const ROOT='D:/课程文档/通信原理/build/parts';
for(const ch of fs.readdirSync(ROOT).sort()){
  const dir=path.join(ROOT,ch);
  if(!fs.statSync(dir).isDirectory()) continue;
  for(const f of fs.readdirSync(dir).sort()){
    if(!f.endsWith('.html')) continue;
    const html=fs.readFileSync(path.join(dir,f),'utf8');
    const ids=new Set();
    let m;
    const re=/<svg[^>]*\bid\s*=\s*["']([^"']+)["']/gi;
    while((m=re.exec(html))!==null) ids.add(m[1]);
    const re2=/<canvas[^>]*\bid\s*=\s*["']([^"']+)["']/gi;
    while((m=re2.exec(html))!==null) ids.add(m[1]);
    const bad=[];
    ids.forEach(id=>{
      const n=(html.match(new RegExp("['\"]"+id.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+"['\"]","g"))||[]).length;
      if(n<2) bad.push(id+' (refs='+n+')');
    });
    console.log(ch+'/'+f+'  svg/canvas='+ids.size+(bad.length?'   ⚠ 未被脚本引用: '+bad.join(', '):'   ✓ 全部有脚本引用'));
  }
}
