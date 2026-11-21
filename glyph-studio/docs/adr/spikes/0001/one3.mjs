// ADR-0001 検証用: spike3 の 1 条件だけを同じ手順で再計算する
import { Clipper, FillRule, Paths64, Path64, Point64 } from 'clipper2-js';
import { buildPolys, variants } from './spike2.mjs';
const S = 10;
const toP64 = (rings) => { const ps = new Paths64(); for (const r of rings) { const p = new Path64(); for (const [x, y] of r) p.push(new Point64(Math.round(x * S), Math.round(y * S))); ps.push(p); } return ps; };
const src = await import('./spike3-methods.mjs');
const polys = buildPolys('x', { weight: 20, width: 0.8, slant: 12, ...variants['flat-miter'] });
const before = JSON.stringify(polys);
const ref = toP64(src.methods.D(polys));
const refArea = Math.abs(Clipper.areaPaths(Clipper.Union(ref, undefined, FillRule.EvenOdd)));
for (const [m, fn] of Object.entries(src.methods)) {
  const out = fn(polys);
  const x = Math.abs(Clipper.areaPaths(Clipper.Xor(toP64(out), ref, FillRule.EvenOdd)));
  console.log(m, 'pct=', ((100 * x) / refArea).toFixed(3), ' 入力が変わったか:', JSON.stringify(polys) !== before);
}
