// ADR-0001 検証用（V-16）: 案 E（自前の膨らませ＋clipper-lib）を Vite でバンドルし、ブラウザで速さと結果を測る
import ClipperLib from 'clipper-lib';
import { ORDER, buildPolys, variants } from '../spike2.mjs';
const S = 10;
const sArea = (r) => r.reduce((a, p, i) => { const q = r[(i + 1) % r.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;
const norm = (polys) => polys.flatMap((poly) => poly.map((r, i) => ((sArea(r) > 0) === (i === 0) ? r : [...r].reverse())));
const E = (polys) => {
  const c = new ClipperLib.Clipper();
  c.AddPaths(norm(polys).map((r) => r.map(([x, y]) => ({ X: Math.round(x * S), Y: Math.round(y * S) }))), ClipperLib.PolyType.ptSubject, true);
  const sol = new ClipperLib.Paths();
  if (!c.Execute(ClipperLib.ClipType.ctUnion, sol, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero)) throw new Error('Execute false');
  return sol.map((p) => p.map((pt) => [pt.X / S, pt.Y / S]));
};
const lines = [`userAgent: ${navigator.userAgent}`];
const n95 = Array.from({ length: 95 }, (_, i) => ORDER[i % ORDER.length]);
const result = {};
for (const vn of Object.keys(variants)) {
  const P = { weight: 90, width: 1, slant: 0, ...variants[vn] };
  for (let i = 0; i < 20; i++) E(buildPolys('A', P));
  const per = []; for (let i = 0; i < 200; i++) { const t = performance.now(); E(buildPolys('A', { ...P, weight: 40 + (i % 120) })); per.push(performance.now() - t); }
  per.sort((a, b) => a - b);
  const t = performance.now(); for (const c of n95) E(buildPolys(c, P)); const all = performance.now() - t;
  lines.push(`${vn.padEnd(11)} A 1文字 平均 ${(per.reduce((a, b) => a + b) / per.length).toFixed(3)} ms・最大 ${per[per.length - 1].toFixed(3)} ms ／ 95文字 ${all.toFixed(1)} ms`);
}
// Node（spike5 の E）と同じ結果か：代表条件のリング数と点数
const sig = ORDER.map((c) => { const o = E(buildPolys(c, { weight: 90, width: 1, slant: 8, ...variants['round-round'] })); return `${c}:${o.length}/${o.reduce((n, r) => n + r.length, 0)}`; }).join(' ');
lines.push(`round-round w=90 slant=8 リング/点数: ${sig}`);
document.getElementById('out').textContent = lines.join('\n');
window.__bench = lines;
