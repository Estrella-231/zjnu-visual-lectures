/* =======================================================================
 * merge_meta.js —— 把各章 worker 产出的 _meta.json 合并进 manifest.json
 *
 * 为什么要单独做：
 *   manifest.json 由父会话统一维护（各 worker 并行写会冲突）。
 *   worker 只写自己那章的 parts/chN/_meta.json，这里统一合并、排序、落盘。
 *
 * 用法：
 *   node merge_meta.js            干跑，只报告将要合并的条目
 *   node merge_meta.js --apply    写入 build/manifest.json
 * ======================================================================= */
'use strict';
const fs = require('fs');
const path = require('path');

const PARTS = path.join(__dirname, 'parts');
const MF = path.join(__dirname, 'manifest.json');
const APPLY = process.argv.indexOf('--apply') >= 0;

/* 章序：ch2 … ch10 */
function chNum(ch) { const m = /^ch(\d+)$/.exec(ch); return m ? +m[1] : 99; }

let manifest = [];
try { manifest = JSON.parse(fs.readFileSync(MF, 'utf8').replace(/^\uFEFF/, '')); }
catch (e) { console.log('[WARN] manifest.json 读不到，按空处理：' + e.message); }

/* 用各章 _meta.json 覆盖同 id 的条目；未出现在 _meta.json 里的旧条目保留 */
const byId = new Map();
manifest.forEach(function (m) { if (m.id) byId.set(m.id, m); });

let added = 0, updated = 0;
const chapters = fs.readdirSync(PARTS).filter(function (d) {
  try { return fs.statSync(path.join(PARTS, d)).isDirectory(); } catch (e) { return false; }
}).sort(function (a, b) { return chNum(a) - chNum(b); });

for (const ch of chapters) {
  const mp = path.join(PARTS, ch, '_meta.json');
  if (!fs.existsSync(mp)) { console.log('  ' + ch + '  (无 _meta.json，跳过)'); continue; }
  let list;
  try { list = JSON.parse(fs.readFileSync(mp, 'utf8').replace(/^\uFEFF/, '')); }
  catch (e) { console.log('  [FAIL] ' + ch + ' 的 _meta.json 解析失败：' + e.message); continue; }
  if (!Array.isArray(list)) { console.log('  [FAIL] ' + ch + ' 的 _meta.json 不是数组'); continue; }

  let cAdd = 0, cUpd = 0;
  for (const it of list) {
    if (!it || !it.id) { console.log('  [WARN] ' + ch + ' 有条目缺 id，跳过'); continue; }
    const norm = Object.assign({}, it);
    norm.ch = norm.ch || ch;
    if (!norm.file) { console.log('  [WARN] ' + it.id + ' 缺 file 字段'); continue; }
    if (byId.has(norm.id)) {
      /* 同 id 已存在：worker 的版本优先，但保留旧条目里 worker 没写的字段 */
      const old = byId.get(norm.id);
      Object.keys(old).forEach(function (k) { if (!(k in norm)) norm[k] = old[k]; });
      byId.set(norm.id, norm);
      cUpd++;
    } else {
      byId.set(norm.id, norm);
      cAdd++;
    }
  }
  added += cAdd; updated += cUpd;
  console.log('  ' + ch + '  新增 ' + cAdd + ' 条，更新 ' + cUpd + ' 条');
}

const out = Array.from(byId.values()).sort(function (a, b) {
  const ca = chNum(a.ch || 'ch2'), cb = chNum(b.ch || 'ch2');
  if (ca !== cb) return ca - cb;
  return String(a.id).localeCompare(String(b.id), 'en', { numeric: true });
});

console.log('--------------------------------------------');
console.log('manifest 条目：' + manifest.length + ' → ' + out.length + '（新增 ' + added + '，更新 ' + updated + '）');

if (APPLY) {
  fs.writeFileSync(MF, JSON.stringify(out, null, 2) + '\n', 'utf8');
  console.log('>> 已写入 ' + MF);
} else {
  console.log('干跑（加 --apply 才写文件）。将要合并的条目：');
  out.forEach(function (m) { console.log('  [' + (m.ch || 'ch2') + '] ' + m.id + '  →  ' + m.file); });
}
