/* ============================================================================
   PWA 图标生成器（build/make_icons.js）
   ----------------------------------------------------------------------------
   为 manifest 生成 icon-192.png / icon-512.png。
   **不引任何第三方库**：手写最小 PNG 编码（IHDR + IDAT + IEND + CRC32），
   zlib 用 Node 自带的 —— 产物仍然完全自包含，项目零依赖。

   图案：深蓝底 + 白色正弦波（通信信号），居中留白以兼容 maskable。
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

/* ---------- CRC32 ---------- */
const CRC_TABLE = (function () {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}
function encodePNG(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;                       /* filter = 0 */
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;    /* bit depth */
  ihdr[9] = 6;    /* color type = RGBA */
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/* ---------- 画图标 ---------- */
function drawIcon(size) {
  const bg = [0x12, 0x23, 0x3F];      /* 深蓝 */
  const fg = [0xFF, 0xFF, 0xFF];      /* 白 */
  const ac = [0xE0, 0xA8, 0x30];      /* 琥珀点 */
  const rgba = Buffer.alloc(size * size * 4);

  const cx = size / 2, cy = size / 2;
  const amp = size * 0.155;           /* 振幅 */
  const period = size * 0.43;        /* 周期 */
  const thick = Math.max(2, Math.round(size * 0.032));
  const dotR = Math.max(3, Math.round(size * 0.055));
  const dotX = cx + period * 0.5;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      let c = bg;
      /* 正弦波 */
      const yc = cy + amp * Math.sin((2 * Math.PI * (x - cx)) / period);
      if (Math.abs(y - yc) <= thick / 2) c = fg;
      /* 右端琥珀点（采样点） */
      const ddx = x - dotX, ddy = y - cy;
      if (ddx * ddx + ddy * ddy <= dotR * dotR) c = ac;
      rgba[i] = c[0]; rgba[i + 1] = c[1]; rgba[i + 2] = c[2]; rgba[i + 3] = 255;
    }
  }
  return encodePNG(size, size, rgba);
}

/* ---------- 写盘 ---------- */
function makeIcons(outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const out = [];
  [192, 512].forEach(function (s) {
    const p = path.join(outDir, 'icon-' + s + '.png');
    fs.writeFileSync(p, drawIcon(s));
    out.push(p);
  });
  return out;
}

module.exports = { makeIcons: makeIcons, encodePNG: encodePNG };

/* 直接运行：node build/make_icons.js [输出目录] */
if (require.main === module) {
  const dir = process.argv[2] || path.join(__dirname, 'icons');
  makeIcons(dir).forEach(function (p) {
    console.log('  OK  ' + p + '  (' + fs.statSync(p).size + ' bytes)');
  });
}
