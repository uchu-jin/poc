// ADR-0001 検証用: spike3 の方式定義だけを取り出したもの（one3.mjs から使う）
import pc from 'polygon-clipping';
import paper from 'paper/dist/paper-core.js';
import { Clipper, FillRule, Paths64, Path64, Point64 } from 'clipper2-js';
paper.setup(new paper.Size(1, 1));
const S = 10; // clipper の整数スケール（0.1 単位）
const sArea = (r) => r.reduce((a, p, i) => { const q = r[(i + 1) % r.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;
const toP64 = (rings) => { const ps = new Paths64(); for (const r of rings) { const p = new Path64(); for (const [x, y] of r) p.push(new Point64(Math.round(x * S), Math.round(y * S))); ps.push(p); } return ps; };
const normRings = (polys) => polys.flatMap((poly) => poly.map((r, i) => ((sArea(r) > 0) === (i === 0) ? r : [...r].reverse())));

export const methods = {
  A1: (polys) => pc.union(...polys.map((p) => [p])).flatMap((poly) => poly.map((r) => r.slice(0, -1))),
  A1r: (polys) => pc.union(...polys.map((p) => [p.map((r) => r.map(([x, y]) => [Math.round(x), Math.round(y)]))])).flatMap((poly) => poly.map((r) => r.slice(0, -1))),
  A2: (polys) => {
    let acc = null;
    for (const poly of polys) {
      const item = new paper.CompoundPath({ children: poly.map((r) => new paper.Path({ segments: r, closed: true })), insert: false });
      item.fillRule = 'evenodd';
      acc = acc ? acc.unite(item, { insert: false }) : item;
    }
    return (acc.children ? acc.children : [acc]).map((p) => p.segments.map((s) => [s.point.x, s.point.y]));
  },
  D: (polys) => Clipper.Union(toP64(normRings(polys)), undefined, FillRule.NonZero).map((p) => p.map((pt) => [pt.x / S, pt.y / S])),
};

