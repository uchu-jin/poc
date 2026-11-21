// ADR-0001 検証用: D（clipper2-js）と E（clipper-lib）で差が出た所を描く。差の多い条件を一覧にし、上位 3 件を SVG に
import fs from 'node:fs';
import { Clipper, FillRule, Paths64, Path64, Point64 } from 'clipper2-js';
import { ORDER, buildPolys, variants } from './spike2.mjs';
import { D, E } from './spike5.mjs';
const S = 10;
const toP64 = (rings) => { const ps = new Paths64(); for (const r of rings) { const p = new Path64(); for (const [x, y] of r) p.push(new Point64(Math.round(x * S), Math.round(y * S))); ps.push(p); } return ps; };
const area = (rings) => Math.abs(Clipper.areaPaths(Clipper.Union(toP64(rings), undefined, FillRule.EvenOdd))) / S / S;
const hits = [];
for (const [vn, v] of Object.entries(variants)) for (let w = 20; w <= 220; w += 2) for (const slant of [0, 12]) for (const width of [0.8, 1, 1.25]) for (const ch of ORDER) {
  const P = { weight: w, width, slant, ...v }, polys = buildPolys(ch, P), d = D(polys), e = E(polys);
  const x = Math.abs(Clipper.areaPaths(Clipper.Xor(toP64(e), toP64(d), FillRule.EvenOdd))) / S / S;
  const pct = (100 * x) / area(d);
  if (pct > 0.5) hits.push({ vn, ch, w, slant, width, pct, aD: area(d), aE: area(e), rD: d.length, rE: e.length });
}
const byKey = {}; for (const h of hits) { const k = `${h.vn} ${h.ch}`; byKey[k] = (byKey[k] || 0) + 1; }
console.log('差 >0.5% の内訳（端・角 文字: 件数）:', JSON.stringify(byKey));
console.log('面積 D>E（E が欠けている）:', hits.filter((h) => h.aD > h.aE).length, '件 ／ E>D（E が余分に塗る）:', hits.filter((h) => h.aE > h.aD).length, '件');
hits.sort((a, b) => b.pct - a.pct);
const d2 = (rings) => rings.map((r) => 'M' + r.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join('L') + 'Z').join('');
let svg = '';
hits.slice(0, 3).forEach((h, i) => {
  const polys = buildPolys(h.ch, { weight: h.w, width: h.width, slant: h.slant, ...variants[h.vn] });
  const d = D(polys), e = E(polys);
  const onlyD = Clipper.Difference(toP64(d), toP64(e), FillRule.EvenOdd).map((p) => p.map((q) => [q.x / S, q.y / S]));
  const onlyE = Clipper.Difference(toP64(e), toP64(d), FillRule.EvenOdd).map((p) => p.map((q) => [q.x / S, q.y / S]));
  console.log(`#${i + 1} ${h.vn} ${h.ch} w=${h.w} slant=${h.slant} width=${h.width} 差 ${h.pct.toFixed(2)}% 面積 D=${h.aD.toFixed(0)} E=${h.aE.toFixed(0)} リング D=${h.rD} E=${h.rE}`);
  const tx = 40 + i * 420;
  svg += `<text x="${tx}" y="20" font-size="13">#${i + 1} ${h.vn} ${h.ch} w=${h.w} slant=${h.slant} width=${h.width}</text>`;
  svg += `<g transform="translate(${tx},360) scale(0.33,-0.33)"><path d="${d2(d)}" fill="#bbb" fill-rule="evenodd"/><path d="${d2(onlyD)}" fill="red"/><path d="${d2(onlyE)}" fill="orange"/><path d="${d2(polys.flat())}" fill="none" stroke="blue" stroke-width="2"/></g>`;
});
fs.writeFileSync('out2/diff5.svg', `<svg xmlns="http://www.w3.org/2000/svg" width="1300" height="480"><rect width="100%" height="100%" fill="#fff"/>${svg}<text x="40" y="470" font-size="13">灰=D の結果、赤=D だけが塗る所、橙=E だけが塗る所、青=合成前の線の輪郭</text></svg>`);
