// ADR-0001 検証用スパイク その3（V-08）。src/ には混ぜない。
// 合成ライブラリの頑健さ：端の形・角の丸みを含めてパラメータを細かく振り、例外の数と形の正しさを比べる。
//   A1  : polygon-clipping 0.15.7（浮動小数のまま）
//   A1r : polygon-clipping 0.15.7（座標を整数に丸めてから合成）
//   A2  : paper.js 0.12.18
//   D   : clipper2-js 1.2.4（座標を 10 倍して整数で合成。NonZero）
// 形の正しさ：D の結果を基準に、各方式の結果との XOR の面積 ÷ 基準の面積（%）を出す。
import pc from 'polygon-clipping';
import paper from 'paper/dist/paper-core.js';
import { Clipper, FillRule, Paths64, Path64, Point64 } from 'clipper2-js';
import { ORDER, buildPolys, variants } from './spike2.mjs';

paper.setup(new paper.Size(1, 1));
const S = 10; // clipper の整数スケール（0.1 単位）
const sArea = (r) => r.reduce((a, p, i) => { const q = r[(i + 1) % r.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;
const toP64 = (rings) => { const ps = new Paths64(); for (const r of rings) { const p = new Path64(); for (const [x, y] of r) p.push(new Point64(Math.round(x * S), Math.round(y * S))); ps.push(p); } return ps; };
const normRings = (polys) => polys.flatMap((poly) => poly.map((r, i) => ((sArea(r) > 0) === (i === 0) ? r : [...r].reverse())));

const methods = {
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

const params = [];
for (const [vn, v] of Object.entries(variants)) for (let w = 20; w <= 220; w += 2) for (const slant of [0, 12]) for (const width of [0.8, 1, 1.25]) for (const ch of ORDER) params.push({ vn, ch, P: { weight: w, width, slant, ...v } });
console.log('試行数（方式ごと）:', params.length);

const stats = Object.fromEntries(Object.keys(methods).map((m) => [m, { err: 0, errSamples: [], ms: 0, bad: 0, worst: 0, worstAt: '' }]));
for (const { vn, ch, P } of params) {
  const polys = buildPolys(ch, P);
  // 注意: clipper2-js 1.2.4 の Xor は clip に渡した Paths64 を書き換えることがある（V-08）。毎回作り直す
  let refRings = null;
  try { refRings = methods.D(polys); } catch {}
  const ref = refRings && toP64(refRings);
  const refArea = ref ? Math.abs(Clipper.areaPaths(Clipper.Union(toP64(refRings), undefined, FillRule.EvenOdd))) : 0;
  for (const [m, fn] of Object.entries(methods)) {
    const st = stats[m];
    const t = performance.now();
    let out;
    try { out = fn(polys); } catch (e) { st.err++; if (st.errSamples.length < 3) st.errSamples.push(`${vn} ${ch} w=${P.weight} slant=${P.slant} width=${P.width}`); continue; } finally { st.ms += performance.now() - t; }
    if (!ref || m === 'D') continue;
    const x = Math.abs(Clipper.areaPaths(Clipper.Xor(toP64(out), toP64(refRings), FillRule.EvenOdd)));
    const pct = (100 * x) / refArea;
    if (pct > 0.5) st.bad++;
    if (pct > st.worst) { st.worst = pct; st.worstAt = `${vn} ${ch} w=${P.weight} slant=${P.slant} width=${P.width}`; }
  }
}
console.log('（修正版：Xor の基準を毎回作り直す）');
console.log('method | 例外 | 平均ms | D との差 >0.5% の数 | 最大の差% (どこで)');
for (const [m, st] of Object.entries(stats)) {
  console.log(`${m.padEnd(6)} | ${String(st.err).padStart(4)} | ${(st.ms / params.length).toFixed(3)} | ${String(st.bad).padStart(5)} | ${st.worst.toFixed(3)} (${st.worstAt})`);
  if (st.errSamples.length) console.log('        例外の例:', st.errSamples.join(' ／ '));
}
