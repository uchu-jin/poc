// ADR-0001 検証用（V-14）: 差の測り方を clipper2-js の Xor から paper.js の exclude に変えて、V-08・V-13 の差を測り直す
import paper from 'paper/dist/paper-core.js';
import { ORDER, buildPolys, variants } from './spike2.mjs';
import { methods } from './spike3-methods.mjs';
import { E } from './spike5.mjs';
paper.setup(new paper.Size(1, 1));
const toPaper = (rings) => { const c = new paper.CompoundPath({ children: rings.map((r) => new paper.Path({ segments: r, closed: true })), insert: false }); c.fillRule = 'nonzero'; return c; };
const xorPct = (a, ref) => { const pa = toPaper(a), pr = toPaper(ref); return (100 * Math.abs(pa.exclude(pr, { insert: false }).area)) / Math.abs(pr.area); };
const ms = { A2: methods.A2, E };
const st = Object.fromEntries(Object.keys(ms).map((k) => [k, { bad: 0, worst: 0, at: '', fail: 0 }]));
let n = 0;
for (const [vn, v] of Object.entries(variants)) for (let w = 20; w <= 220; w += 2) for (const slant of [0, 12]) for (const width of [0.8, 1, 1.25]) for (const ch of ORDER) {
  n++;
  const polys = buildPolys(ch, { weight: w, width, slant, ...v });
  const d = methods.D(polys);
  for (const [k, fn] of Object.entries(ms)) {
    let pct;
    try { pct = xorPct(fn(polys), d); } catch { st[k].fail++; continue; }
    if (pct > 0.5) st[k].bad++;
    if (pct > st[k].worst) { st[k].worst = pct; st[k].at = `${vn} ${ch} w=${w} slant=${slant} width=${width}`; }
  }
}
console.log('試行数:', n, '（基準＝D、差＝paper.js の exclude の面積 ÷ D の面積）');
for (const [k, s] of Object.entries(st)) console.log(`${k} | D との差 >0.5% ${s.bad} 件 | 最大 ${s.worst.toFixed(3)}% (${s.at}) | 測れなかった ${s.fail}`);
// V-09 で赤い三角形が出た条件
const g = buildPolys('g', { weight: 24, width: 1, slant: 12, ...variants['slab-miter'] });
console.log('V-09 の条件（slab-miter g w=24 slant=12）: A2 と D の差', xorPct(methods.A2(g), methods.D(g)).toFixed(3), '%');
