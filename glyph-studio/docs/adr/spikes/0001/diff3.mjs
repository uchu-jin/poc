// ADR-0001 検証用: A2（paper.js）と D（clipper2-js）で差が出た所を赤で描く
import fs from 'node:fs';
import { Clipper, FillRule, Paths64, Path64, Point64 } from 'clipper2-js';
import { buildPolys, variants } from './spike2.mjs';
import { methods } from './spike3-methods.mjs';
const S = 10;
const toP64 = (rings) => { const ps = new Paths64(); for (const r of rings) { const p = new Path64(); for (const [x, y] of r) p.push(new Point64(Math.round(x * S), Math.round(y * S))); ps.push(p); } return ps; };
const d = (rings) => rings.map((r) => 'M' + r.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join('L') + 'Z').join('');
const cases = [['slab-miter', 'g', 24, 12, 1], ['flat-miter', 'g', 24, 0, 1], ['round-round', '@', 30, 0, 1]];
let svg = '';
cases.forEach(([vn, ch, w, slant, width], i) => {
  const polys = buildPolys(ch, { weight: w, width, slant, ...variants[vn] });
  const a2 = methods.A2(polys), D = methods.D(polys);
  const x = Clipper.Xor(toP64(a2), toP64(D), FillRule.EvenOdd).map((p) => p.map((q) => [q.x / S, q.y / S]));
  const raw = polys.flat();
  const tx = 40 + i * 420;
  svg += `<text x="${tx}" y="20" font-size="13">${vn} ${ch} w=${w} slant=${slant}</text>`;
  svg += `<g transform="translate(${tx},330) scale(0.35,-0.35)"><path d="${d(D)}" fill="#bbb" fill-rule="evenodd"/><path d="${d(x)}" fill="red"/><path d="${d(raw)}" fill="none" stroke="blue" stroke-width="2"/></g>`;
});
fs.writeFileSync('out2/diff3.svg', `<svg xmlns="http://www.w3.org/2000/svg" width="1300" height="450"><rect width="100%" height="100%" fill="#fff"/>${svg}<text x="40" y="440" font-size="13">灰=D の結果、赤=A2 との差、青=合成前の線の輪郭</text></svg>`);
