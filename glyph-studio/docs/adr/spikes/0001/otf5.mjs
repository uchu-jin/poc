// ADR-0001 検証用: 案 E（clipper-lib）で OTF を書き出し、読み戻す
import fs from 'node:fs';
import opentype from 'opentype.js';
import { buildPolys, makeFont, variants } from './spike2.mjs';
import { E } from './spike5.mjs';
fs.mkdirSync('out5', { recursive: true });
for (const [vn, w] of [['flat-miter', 90], ['round-round', 140], ['slab-miter', 60]]) {
  const name = `E-${vn}-w${w}`;
  const buf = makeFont('S5' + name.replace(/-/g, ''), (ch, P) => E(buildPolys(ch, P)), { weight: w, width: 1, slant: 8, ...variants[vn] });
  fs.writeFileSync(`out5/${name}.otf`, buf);
  const f = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  console.log(`${name}.otf ${buf.length} bytes, glyphs=${f.glyphs.length}, outlinesFormat=${f.outlinesFormat}`);
}
