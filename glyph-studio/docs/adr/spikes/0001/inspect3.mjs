// ADR-0001 検証用: spike3 で差が大きかった条件を、方式ごとに SVG に描いて見比べる
import fs from 'node:fs';
import pc from 'polygon-clipping';
import paper from 'paper/dist/paper-core.js';
import { Clipper, FillRule, Paths64, Path64, Point64 } from 'clipper2-js';
import { buildPolys, variants } from './spike2.mjs';
paper.setup(new paper.Size(1, 1));
const S = 10, sArea = (r) => r.reduce((a, p, i) => { const q = r[(i + 1) % r.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;
const toP64 = (rings) => { const ps = new Paths64(); for (const r of rings) { const p = new Path64(); for (const [x, y] of r) p.push(new Point64(Math.round(x * S), Math.round(y * S))); ps.push(p); } return ps; };
const norm = (polys) => polys.flatMap((poly) => poly.map((r, i) => ((sArea(r) > 0) === (i === 0) ? r : [...r].reverse())));
const M = {
  A1: (p) => pc.union(...p.map((q) => [q])).flatMap((x) => x.map((r) => r.slice(0, -1))),
  A1r: (p) => pc.union(...p.map((q) => [q.map((r) => r.map(([x, y]) => [Math.round(x), Math.round(y)]))])).flatMap((x) => x.map((r) => r.slice(0, -1))),
  A2: (p) => { let a = null; for (const poly of p) { const it = new paper.CompoundPath({ children: poly.map((r) => new paper.Path({ segments: r, closed: true })), insert: false }); it.fillRule = 'evenodd'; a = a ? a.unite(it, { insert: false }) : it; } return (a.children ? a.children : [a]).map((q) => q.segments.map((s) => [s.point.x, s.point.y])); },
  D: (p) => Clipper.Union(toP64(norm(p)), undefined, FillRule.NonZero).map((q) => q.map((pt) => [pt.x / S, pt.y / S])),
};
const cases = [['flat-miter', 'x', 20, 12, 0.8], ['slab-miter', 'g', 24, 12, 1], ['round-round', 'N', 20, 0, 1], ['round-round', 'A', 140, 0, 1], ['slab-round', 'A', 140, 0, 1]];
const cell = 260; let svg = '';
cases.forEach(([vn, ch, w, slant, width], row) => {
  const polys = buildPolys(ch, { weight: w, width, slant, ...variants[vn] });
  svg += `<text x="5" y="${row * cell + 20}" font-size="13">${vn} ${ch} w=${w} slant=${slant} width=${width}</text>`;
  Object.entries(M).forEach(([m, fn], col) => {
    let d = '', label = m;
    try { for (const r of fn(polys)) d += 'M' + r.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join('L') + 'Z'; label += ` rings=${fn(polys).length}`; } catch { label += ' 例外'; }
    const tx = col * cell + 40, ty = row * cell + 230;
    svg += `<text x="${tx}" y="${row * cell + 40}" font-size="12">${label}</text><path transform="translate(${tx},${ty}) scale(0.2,-0.2)" d="${d}" fill="black" fill-rule="evenodd"/>`;
  });
});
fs.writeFileSync('out2/inspect3.svg', `<svg xmlns="http://www.w3.org/2000/svg" width="${4 * cell + 60}" height="${cases.length * cell}" style="background:#fff"><rect width="100%" height="100%" fill="#fff"/>${svg}</svg>`);
