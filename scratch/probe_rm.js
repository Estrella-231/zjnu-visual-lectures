/* 临时探针：为什么 fs.rmSync 没删干净 site/ */
'use strict';
const fs = require('fs');
const path = require('path');

const SITE = 'D:/课程文档/通信原理/site';

function listAll(dir, out) {
  out = out || [];
  fs.readdirSync(dir).forEach(f => {
    const p = path.join(dir, f);
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) listAll(p, out);
    else out.push(p);
  });
  return out;
}

console.log('删除前文件数 = ' + listAll(SITE).length);
try {
  fs.rmSync(SITE, { recursive: true, force: true });
  console.log('rmSync 正常返回');
} catch (e) {
  console.log('rmSync 抛错: ' + e.message);
}
console.log('删除后 site 是否还存在 = ' + fs.existsSync(SITE));
if (fs.existsSync(SITE)) {
  const left = listAll(SITE);
  console.log('残留文件数 = ' + left.length);
  left.slice(0, 10).forEach(f => console.log('   ' + path.relative(SITE, f)));
  /* 单独试删那个残留文件 */
  const target = left.find(f => f.includes('例3-1'));
  if (target) {
    try { fs.unlinkSync(target); console.log('单独 unlink 成功'); }
    catch (e) { console.log('单独 unlink 失败: ' + e.message + ' (code=' + e.code + ')'); }
    try { fs.rmSync(target, { force: true }); console.log('单独 rmSync 成功'); }
    catch (e) { console.log('单独 rmSync 失败: ' + e.message + ' (code=' + e.code + ')'); }
  }
}
