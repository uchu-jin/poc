// ADR-0001 検証用: one3 の条件で、Xor を呼ぶたびに基準（ref）が変わるかを確かめる
import { Clipper, FillRule, Paths64, Path64, Point64 } from 'clipper2-js';
import { buildPolys, variants } from './spike2.mjs';
import { methods } from './spike3-methods.mjs';
const S = 10;
const toP64 = (rings) => { const ps = new Paths64(); for (const r of rings) { const p = new Path64(); for (const [x, y] of r) p.push(new Point64(Math.round(x * S), Math.round(y * S))); ps.push(p); } return ps; };
const snap = (ps) => JSON.stringify(ps.map((p) => p.map((q) => [q.x, q.y])));
const polys = buildPolys('x', { weight: 20, width: 0.8, slant: 12, ...variants['flat-miter'] });
const ref = toP64(methods.D(polys)); const r0 = snap(ref);
for (const m of ['A1', 'A1r', 'D', 'D']) {
  const out = toP64(methods[m](polys)); const o0 = snap(out);
  const x = Math.abs(Clipper.areaPaths(Clipper.Xor(out, ref, FillRule.EvenOdd)));
  console.log(m, 'xor=', x, ' ref が変わった:', snap(ref) !== r0, ' out が変わった:', snap(out) !== o0, ' ref の点数', ref.map((p) => p.length).join(','));
}
