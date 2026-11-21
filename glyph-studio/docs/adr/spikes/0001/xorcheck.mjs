// ADR-0001 検証用: spike3 の「差」の測り方（clipper2-js の Xor）が正しいかを確かめる
import pc from 'polygon-clipping';
import { Clipper, FillRule, Paths64, Path64, Point64 } from 'clipper2-js';
import { buildPolys, variants } from './spike2.mjs';
const S = 10, sArea = (r) => r.reduce((a, p, i) => { const q = r[(i + 1) % r.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;
const toP64 = (rings) => { const ps = new Paths64(); for (const r of rings) { const p = new Path64(); for (const [x, y] of r) p.push(new Point64(Math.round(x * S), Math.round(y * S))); ps.push(p); } return ps; };
const norm = (polys) => polys.flatMap((poly) => poly.map((r, i) => ((sArea(r) > 0) === (i === 0) ? r : [...r].reverse())));
const polys = buildPolys('x', { weight: 20, width: 0.8, slant: 12, ...variants['flat-miter'] });
const D = Clipper.Union(toP64(norm(polys)), undefined, FillRule.NonZero);
const A1r = toP64(pc.union(...polys.map((q) => [q.map((r) => r.map(([x, y]) => [Math.round(x), Math.round(y)]))])).flatMap((x) => x.map((r) => r.slice(0, -1))));
const ring = (ps) => ps.map((p) => `${p.length}点 area=${(Clipper.area(p) / S / S).toFixed(0)}`).join(', ');
console.log('D   :', ring(D));
console.log('A1r :', ring(A1r));
console.log('Xor(D, D)  area:', Clipper.areaPaths(Clipper.Xor(D, D, FillRule.EvenOdd)) / S / S);
console.log('Xor(A1r, D) area:', Clipper.areaPaths(Clipper.Xor(A1r, D, FillRule.EvenOdd)) / S / S);
console.log('Xor(A1r, D) NonZero area:', Clipper.areaPaths(Clipper.Xor(A1r, D, FillRule.NonZero)) / S / S);
// polygon-clipping で同じ差を測る（別の実装で突き合わせ）
const toPC = (ps) => ps.map((p) => [p.map((pt) => [pt.x / S, pt.y / S])]);
const x = pc.xor(toPC(D), toPC(A1r));
console.log('polygon-clipping xor area:', x.reduce((a, poly) => a + poly.reduce((b, r, i) => b + (i ? -1 : 1) * Math.abs(sArea(r)), 0), 0).toFixed(1));
// spike3 と同じ式で基準の面積を出す
const ref = toP64(D.map((p) => p.map((pt) => [pt.x / S, pt.y / S])));
console.log('spike3 式の refArea:', Math.abs(Clipper.areaPaths(Clipper.Union(ref, undefined, FillRule.EvenOdd))), ' Clipper.areaPaths(ref):', Clipper.areaPaths(ref));
