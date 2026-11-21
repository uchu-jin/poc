// ADR-0001 検証用スパイク その5（V-13）。src/ には混ぜない。
// 案 E：自前の膨らませ ＋ clipper-lib 6.4.2（Clipper 1 の JS 版、依存なし）で合成。
// V-08 と同じ 16,968 条件で D（clipper2-js 1.2.4）と比べる。差は D を基準に XOR の面積の割合（基準は毎回作り直す。V-12）。
import ClipperLib from 'clipper-lib';
import { Clipper, FillRule, Paths64, Path64, Point64 } from 'clipper2-js';
import { ORDER, buildPolys, variants } from './spike2.mjs';

const S = 10;
const sArea = (r) => r.reduce((a, p, i) => { const q = r[(i + 1) % r.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;
const normRings = (polys) => polys.flatMap((poly) => poly.map((r, i) => ((sArea(r) > 0) === (i === 0) ? r : [...r].reverse())));
const toP64 = (rings) => { const ps = new Paths64(); for (const r of rings) { const p = new Path64(); for (const [x, y] of r) p.push(new Point64(Math.round(x * S), Math.round(y * S))); ps.push(p); } return ps; };
const toCL = (rings) => rings.map((r) => r.map(([x, y]) => ({ X: Math.round(x * S), Y: Math.round(y * S) })));

export const D = (polys) => Clipper.Union(toP64(normRings(polys)), undefined, FillRule.NonZero).map((p) => p.map((pt) => [pt.x / S, pt.y / S]));
export const E = (polys) => {
  const c = new ClipperLib.Clipper();
  c.AddPaths(toCL(normRings(polys)), ClipperLib.PolyType.ptSubject, true);
  const sol = new ClipperLib.Paths();
  const ok = c.Execute(ClipperLib.ClipType.ctUnion, sol, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
  if (!ok) throw new Error('Execute が false');
  return sol.map((p) => p.map((pt) => [pt.X / S, pt.Y / S]));
};

if ((process.argv[1] ?? '').endsWith('spike5.mjs')) {
  // 入力を書き換えるか（V-12 と同じ確かめ方）
  {
    const polys = buildPolys('x', { weight: 20, width: 0.8, slant: 12, ...variants['flat-miter'] });
    const inp = toCL(normRings(polys)); const before = JSON.stringify(inp);
    const c = new ClipperLib.Clipper(); c.AddPaths(inp, ClipperLib.PolyType.ptSubject, true);
    const sol = new ClipperLib.Paths(); c.Execute(ClipperLib.ClipType.ctXor, sol, ClipperLib.PolyFillType.pftEvenOdd, ClipperLib.PolyFillType.pftEvenOdd);
    const c2 = new ClipperLib.Clipper(); c2.AddPaths(inp, ClipperLib.PolyType.ptSubject, true); c2.Execute(ClipperLib.ClipType.ctUnion, new ClipperLib.Paths(), 1, 1);
    console.log('clipper-lib: Xor・Union のあと入力が変わったか:', JSON.stringify(inp) !== before);
  }
  const params = [];
  for (const [vn, v] of Object.entries(variants)) for (let w = 20; w <= 220; w += 2) for (const slant of [0, 12]) for (const width of [0.8, 1, 1.25]) for (const ch of ORDER) params.push({ vn, ch, P: { weight: w, width, slant, ...v } });
  const st = { D: { err: 0, ms: 0 }, E: { err: 0, ms: 0, bad: 0, worst: 0, worstAt: '', errSamples: [] } };
  for (const { vn, ch, P } of params) {
    const polys = buildPolys(ch, P);
    let t = performance.now(); let d = null; try { d = D(polys); } catch { st.D.err++; } st.D.ms += performance.now() - t;
    t = performance.now(); let e = null; try { e = E(polys); } catch (err) { st.E.err++; if (st.E.errSamples.length < 3) st.E.errSamples.push(`${vn} ${ch} w=${P.weight}: ${err.message}`); } st.E.ms += performance.now() - t;
    if (!d || !e) continue;
    const refArea = Math.abs(Clipper.areaPaths(Clipper.Union(toP64(d), undefined, FillRule.EvenOdd)));
    const x = Math.abs(Clipper.areaPaths(Clipper.Xor(toP64(e), toP64(d), FillRule.EvenOdd)));
    const pct = (100 * x) / refArea;
    if (pct > 0.5) st.E.bad++;
    if (pct > st.E.worst) { st.E.worst = pct; st.E.worstAt = `${vn} ${ch} w=${P.weight} slant=${P.slant} width=${P.width}`; }
  }
  console.log('試行数（方式ごと）:', params.length);
  console.log(`D | 例外 ${st.D.err} | 平均 ${(st.D.ms / params.length).toFixed(3)} ms`);
  console.log(`E | 例外 ${st.E.err} | 平均 ${(st.E.ms / params.length).toFixed(3)} ms | D との差 >0.5% ${st.E.bad} 件 | 最大の差 ${st.E.worst.toFixed(4)}% (${st.E.worstAt})`);
  if (st.E.errSamples.length) console.log('E の例外の例:', st.E.errSamples.join(' ／ '));
  // 速さ（V-02 と同じ形：A 1文字 200 回、95 文字）
  const n95 = Array.from({ length: 95 }, (_, i) => ORDER[i % ORDER.length]);
  for (const [name, fn] of [['D', D], ['E', E]]) for (const vn of ['flat-miter', 'round-round']) {
    const P = { weight: 90, width: 1, slant: 0, ...variants[vn] };
    for (let i = 0; i < 20; i++) fn(buildPolys('A', P));
    let t = performance.now(); for (let i = 0; i < 200; i++) fn(buildPolys('A', { ...P, weight: 40 + (i % 120) })); const perA = (performance.now() - t) / 200;
    t = performance.now(); for (const c of n95) fn(buildPolys(c, P)); const all = performance.now() - t;
    console.log(`${name} ${vn.padEnd(11)} A 1文字 ${perA.toFixed(3)} ms ／ 95文字 ${all.toFixed(1)} ms（膨らませ込み）`);
  }
}
