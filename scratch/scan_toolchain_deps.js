/* 移植前体检：列出通信电路工具链各文件的课程名/绝对路径引用。 */
'use strict';
const fs = require('fs');
const b = 'D:/课程文档/通信电路/';
const files = [
  'build/build.js', 'build/lib.js', 'build/math.js', 'build/check.js',
  'build/check_geom.js', 'build/check_gap.js', 'build/check_text.js',
  'build/scan_svg.js', 'build/fracify.js', 'build/merge_meta.js',
  'build/DESIGN.md', 'build/update_index.js', 'build/update_examples_index.js',
  'build/check_formula_no.js',
  'scratch/check_all_syntax.js', 'scratch/verify_runtime.js',
  'scratch/audit_product.js', 'scratch/scan_eng_unit.js',
  'scratch/dump_console.js', 'scratch/gap_detail.js'
];
for (const f of files) {
  try {
    const s = fs.readFileSync(b + f, 'utf8');
    const c = (s.match(/通信电路|通信电子线路/g) || []).length;
    const paths = s.match(/D:[/\\]+课程文档[^'"\s]*/g) || [];
    console.log(
      f.padEnd(42),
      String(s.length).padStart(7),
      '课程名:' + String(c).padStart(3),
      '绝对路径:' + String(paths.length).padStart(3),
      paths.length ? ' 例: ' + paths[0] : ''
    );
  } catch (e) {
    console.log(f.padEnd(42), 'MISSING');
  }
}
