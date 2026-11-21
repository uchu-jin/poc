// ADR-0001 検証用: B-raw の各リングの向き（面積の符号）を出す
import opentype from 'opentype.js';
import fs from 'node:fs';
for (const n of ['B-raw', 'B-norm', 'A1']) {
  const b = fs.readFileSync(`out/${n}.otf`);
  const f = opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  const res = [];
  for (const ch of ['A', 'O', 'x', '8']) {
    const cmds = f.charToGlyph(ch).path.commands; const rings = []; let r = [];
    for (const c of cmds) { if (c.type === 'M') r = [[c.x, c.y]]; else if (c.type === 'L') r.push([c.x, c.y]); else if (c.type === 'Z') rings.push(r); }
    const area = (r) => r.reduce((a, p, i) => { const q = r[(i + 1) % r.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;
    res.push(`${ch}:[${rings.map((r) => (area(r) > 0 ? '+' : '-')).join('')}]`);
  }
  console.log(n.padEnd(7), res.join(' '), '  (+ = 反時計回り)');
}
