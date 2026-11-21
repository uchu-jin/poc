// ADR-0001 検証用スパイク その4（V-10）。src/ には混ぜない。
// 案 D'：膨らませも clipper2-js 1.2.4 の InflatePaths に任せる（端：Butt／Round、角：Miter／Round）。スラブは長方形を足して Union。
import fs from 'node:fs';
import opentype from 'opentype.js';
import { Clipper, FillRule, Paths64, Path64, Point64, JoinType, EndType } from 'clipper2-js';
import { SKEL, ORDER, flatten, rect, key } from './spike2.mjs';
const S = 10;
const P64 = (rings) => { const ps = new Paths64(); for (const r of rings) { const p = new Path64(); for (const [x, y] of r) p.push(new Point64(Math.round(x * S), Math.round(y * S))); ps.push(p); } return ps; };
export function outlineD2(ch, P) {
  const strokes = SKEL[ch], h = P.weight / 2, tan = Math.tan((P.slant * Math.PI) / 180);
  const sx = ([x, y]) => [x * P.width, y];
  const join = P.join === 'round' ? JoinType.Round : JoinType.Miter;
  const end = P.cap === 'round' ? EndType.Round : EndType.Butt;
  // 線どうしがつながる端点は 1 本の折れ線にまとめると角（join）として扱える。ここでは簡単のため、
  // つながる端点を持つ線は Joined せず、角が round のときだけ円を足す（spike2 と同じ考え方）
  const count = new Map();
  for (const s of strokes) if (!s.closed) { const p = flatten(s); for (const e of [p[0], p[p.length - 1]]) count.set(key(e), (count.get(key(e)) || 0) + 1); }
  let acc = new Paths64();
  for (const s of strokes) {
    const pts = flatten(s).map(sx);
    const shared = !s.closed && [pts[0], pts[pts.length - 1]].some((e, i) => count.get(key(flatten(s)[i ? flatten(s).length - 1 : 0])) > 1);
    const e = s.closed ? EndType.Joined : (shared && P.cap !== 'round' ? EndType.Butt : end);
    const out = Clipper.InflatePaths(P64([pts]), h * S, join, e, 4);
    for (const p of out) acc.push(p);
    if (!s.closed) {
      const raw = flatten(s);
      for (const [idx, nb] of [[0, 1], [raw.length - 1, raw.length - 2]]) {
        const ep = pts[idx];
        if (count.get(key(raw[idx])) > 1) { if (P.join === 'round' && P.cap !== 'round') for (const p of Clipper.InflatePaths(P64([[ep, [ep[0] + 0.1, ep[1]]]]), h * S, JoinType.Round, EndType.Round)) acc.push(p); continue; }
        if (P.cap === 'slab') { const dir = Math.sign(ep[1] - pts[nb][1]) || 1, t = Math.max(P.weight * 0.45, 12), ext = P.weight * 1.4; for (const p of P64(rect(ep[0] - ext, ep[1] - (dir > 0 ? t : 0), ep[0] + ext, ep[1] + (dir > 0 ? 0 : t)))) acc.push(p); }
      }
    }
  }
  const u = Clipper.Union(acc, undefined, FillRule.NonZero);
  return u.map((p) => p.map((q) => [q.x / S + (q.y / S) * tan, q.y / S]));
}
if ((process.argv[1] ?? '').endsWith('spike4.mjs')) {
  const variants = { 'flat-miter': { cap: 'flat', join: 'miter' }, 'round-round': { cap: 'round', join: 'round' }, 'slab-miter': { cap: 'slab', join: 'miter' }, 'slab-round': { cap: 'slab', join: 'round' } };
  const n95 = Array.from({ length: 95 }, (_, i) => ORDER[i % ORDER.length]);
  let err = 0, n = 0; const t0 = performance.now();
  for (const v of Object.values(variants)) for (let w = 20; w <= 220; w += 2) for (const slant of [0, 12]) for (const width of [0.8, 1, 1.25]) for (const ch of ORDER) { n++; try { outlineD2(ch, { weight: w, width, slant, ...v }); } catch { err++; } }
  console.log(`総当たり ${n} 回: 例外 ${err} 件、平均 ${((performance.now() - t0) / n).toFixed(3)} ms`);
  for (const [vn, v] of Object.entries(variants)) {
    const P = { weight: 90, width: 1, slant: 0, ...v };
    let t = performance.now(); for (let i = 0; i < 200; i++) outlineD2('A', { ...P, weight: 40 + (i % 120) }); const perA = (performance.now() - t) / 200;
    t = performance.now(); for (const c of n95) outlineD2(c, P); const all = performance.now() - t;
    console.log(`${vn.padEnd(12)} A 1文字 ${perA.toFixed(3)} ms ／ 95文字 ${all.toFixed(1)} ms ／ リング数 ${ORDER.map((c) => `${c}:${outlineD2(c, P).length}`).join(' ')}`);
  }
  fs.mkdirSync('out2', { recursive: true });
  const glyphsFor = (P) => [new opentype.Glyph({ name: '.notdef', unicode: 0, advanceWidth: 600, path: new opentype.Path() }), ...ORDER.map((ch) => { const p = new opentype.Path(); for (const r of outlineD2(ch, P)) { r.forEach(([x, y], i) => (i ? p.lineTo(Math.round(x), Math.round(y)) : p.moveTo(Math.round(x), Math.round(y)))); p.close(); } return new opentype.Glyph({ name: 'g' + ch.charCodeAt(0), unicode: ch.charCodeAt(0), advanceWidth: Math.round(900 * P.width) + 60, path: p }); })];
  const names = [];
  for (const [vn, v] of Object.entries(variants)) for (const w of [40, 140]) {
    const name = `D2-${vn}-w${w}`; names.push(name);
    fs.writeFileSync(`out2/${name}.otf`, Buffer.from(new opentype.Font({ familyName: 'S4' + name.replace(/-/g, ''), styleName: 'Regular', unitsPerEm: 1000, ascender: 800, descender: -250, glyphs: glyphsFor({ weight: w, width: 1, slant: 8, ...v }) }).toArrayBuffer()));
  }
  fs.writeFileSync('out2/names.txt', names.join('\n'));
  console.log('out2/ に OTF:', names.join(' '));
}
