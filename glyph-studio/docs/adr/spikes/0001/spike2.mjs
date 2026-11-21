// ADR-0001 検証用スパイク その2（V-07）。src/ には混ぜない。
// 端の形（flat／round／slab セリフ）と角の丸み（miter／round join）を、案 A1（膨らませ＋polygon-clipping）と
// 案 B（合成しない）で表せるかを試す。骨格と膨らませは spike.mjs と同じ（spike.mjs は V-02〜V-05 の証跡なので変えない）。
import fs from 'node:fs';
import opentype from 'opentype.js';
import pc from 'polygon-clipping';

const L = (...pts) => ({ segs: pts });
const ellipse = (cx, cy, rx, ry) => {
  const k = 0.5523;
  return { closed: true, segs: [[cx, cy + ry],
    { c: [[cx + k * rx, cy + ry], [cx + rx, cy + k * ry], [cx + rx, cy]] },
    { c: [[cx + rx, cy - k * ry], [cx + k * rx, cy - ry], [cx, cy - ry]] },
    { c: [[cx - k * rx, cy - ry], [cx - rx, cy - k * ry], [cx - rx, cy]] },
    { c: [[cx - rx, cy + k * ry], [cx - k * rx, cy + ry], [cx, cy + ry]] }] };
};
export const SKEL = {
  A: [L([300, 700], [60, 0]), L([540, 0], [300, 700]), L([140, 230], [460, 230])],
  O: [ellipse(320, 350, 260, 350)],
  x: [L([60, 0], [460, 500]), L([60, 500], [460, 0])],
  8: [ellipse(300, 530, 190, 170), ellipse(300, 180, 230, 180)],
  g: [ellipse(260, 300, 200, 200), { segs: [[460, 500], [460, -50], { c: [[460, -250], [100, -250], [80, -120]] }] }],
  N: [L([80, 0], [80, 700]), L([80, 700], [480, 0]), L([480, 0], [480, 700])], // 頂点で線がつながる角が 2 つ
  '@': [ellipse(450, 300, 380, 380), ellipse(430, 300, 150, 170), { segs: [[580, 470], [580, 180], { c: [[580, 60], [760, 80], [790, 250]] }] }],
};
export const ORDER = ['A', 'N', 'x', 'O', '8', 'g', '@'];

export function flatten(stroke, steps = 16) {
  const pts = []; let cur = null;
  for (const s of stroke.segs) {
    if (Array.isArray(s)) { pts.push(s); cur = s; continue; }
    const [p1, p2, p3] = s.c;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps, u = 1 - t;
      pts.push([u*u*u*cur[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t*t*t*p3[0], u*u*u*cur[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t*t*t*p3[1]]);
    }
    cur = p3;
  }
  if (stroke.closed) pts.pop();
  return pts;
}
export function offsetSide(pts, d, closed) {
  const n = pts.length, out = [];
  const nrm = (a, b) => { const dx = b[0]-a[0], dy = b[1]-a[1], l = Math.hypot(dx, dy) || 1; return [-dy/l, dx/l]; };
  for (let i = 0; i < n; i++) {
    const prev = closed ? pts[(i-1+n)%n] : pts[i-1], next = closed ? pts[(i+1)%n] : pts[i+1];
    let nx, ny;
    if (!prev) [nx, ny] = nrm(pts[i], next);
    else if (!next) [nx, ny] = nrm(prev, pts[i]);
    else { const a = nrm(prev, pts[i]), b = nrm(pts[i], next); let mx = a[0]+b[0], my = a[1]+b[1]; const ml = Math.hypot(mx, my) || 1; mx /= ml; my /= ml;
      const s = 1 / Math.max(mx*a[0] + my*a[1], 0.25); nx = mx*s; ny = my*s; }
    out.push([pts[i][0] + nx*d, pts[i][1] + ny*d]);
  }
  return out;
}
export const circle = ([cx, cy], r, n = 24) => [Array.from({ length: n }, (_, i) => [cx + r*Math.cos((2*Math.PI*i)/n), cy + r*Math.sin((2*Math.PI*i)/n)])];
export const rect = (x0, y0, x1, y1) => [[[x0, y0], [x1, y0], [x1, y1], [x0, y1]]];
export const key = ([x, y]) => `${Math.round(x)},${Math.round(y)}`;

// P = { weight, width, slant, cap: 'flat'|'round'|'slab', join: 'miter'|'round' }
export function buildPolys(ch, P) {
  const strokes = SKEL[ch];
  const h = P.weight / 2;
  const sx = ([x, y]) => [x * P.width, y];
  const polys = [];
  // 端点の出現回数（2 回以上＝線どうしがつながる角）
  const count = new Map();
  for (const s of strokes) if (!s.closed) { const p = flatten(s); for (const e of [p[0], p[p.length-1]]) count.set(key(e), (count.get(key(e)) || 0) + 1); }
  for (const s of strokes) {
    const pts = flatten(s).map(sx);
    if (s.closed) { polys.push([offsetSide(pts, h, true), offsetSide(pts, -h, true)]); continue; }
    polys.push([[...offsetSide(pts, h, false), ...offsetSide(pts, -h, false).reverse()]]);
    const raw = flatten(s);
    for (const [idx, nb] of [[0, 1], [raw.length - 1, raw.length - 2]]) {
      const shared = count.get(key(raw[idx])) > 1;
      const e = pts[idx];
      if (shared) { if (P.join === 'round') polys.push(circle(e, h)); continue; } // 角：丸める
      if (P.cap === 'round') polys.push(circle(e, h));
      if (P.cap === 'slab') {
        // 端の向きに関係なく水平のスラブ。線の終わりから外へ、太さの 0.45 倍の厚み・太さの 1.4 倍の張り出し
        const dir = Math.sign(e[1] - pts[nb][1]) || 1, t = Math.max(P.weight * 0.45, 12), ext = P.weight * 1.4;
        const yEnd = e[1] + dir * 0; polys.push(rect(e[0] - ext, yEnd - (dir > 0 ? t : 0), e[0] + ext, yEnd + (dir > 0 ? 0 : t)));
      }
    }
  }
  const tan = Math.tan((P.slant * Math.PI) / 180);
  return polys.map((poly) => poly.map((ring) => ring.map(([x, y]) => [x + y * tan, y])));
}
export function outlineA1(ch, P) { return pc.union(...buildPolys(ch, P).map((p) => [p])).flatMap((poly) => poly.map((r) => r.slice(0, -1))); }
const area = (r) => r.reduce((a, p, i) => { const q = r[(i+1)%r.length]; return a + p[0]*q[1] - q[0]*p[1]; }, 0) / 2;
export function outlineBnorm(ch, P) { return buildPolys(ch, P).flatMap((poly) => poly.map((r, i) => ((area(r) > 0) === (i === 0) ? r : [...r].reverse()))); }

export function toPath(rings) { const p = new opentype.Path(); for (const r of rings) { r.forEach(([x, y], i) => (i ? p.lineTo(Math.round(x), Math.round(y)) : p.moveTo(Math.round(x), Math.round(y)))); p.close(); } return p; }
export function makeFont(name, fn, P) {
  const glyphs = [new opentype.Glyph({ name: '.notdef', unicode: 0, advanceWidth: 600, path: new opentype.Path() }), new opentype.Glyph({ name: 'space', unicode: 32, advanceWidth: 300, path: new opentype.Path() })];
  for (const ch of ORDER) glyphs.push(new opentype.Glyph({ name: 'g' + ch.charCodeAt(0), unicode: ch.charCodeAt(0), advanceWidth: Math.round(900 * P.width) + 60, path: toPath(fn(ch, P)) }));
  return Buffer.from(new opentype.Font({ familyName: name, styleName: 'Regular', unitsPerEm: 1000, ascender: 800, descender: -250, glyphs }).toArrayBuffer());
}

export const variants = {
  'flat-miter': { cap: 'flat', join: 'miter' },
  'round-round': { cap: 'round', join: 'round' },
  'slab-miter': { cap: 'slab', join: 'miter' },
  'slab-round': { cap: 'slab', join: 'round' },
};
if ((globalThis.process?.argv?.[1] ?? '').endsWith('spike2.mjs')) {
const ninetyFive = Array.from({ length: 95 }, (_, i) => ORDER[i % ORDER.length]);
console.log('variant      | A1: A 1文字ms | A1: 95文字ms | A1 リング数 ' + ORDER.join('/') + ' (w=40 → 90 → 160)');
for (const [vn, v] of Object.entries(variants)) {
  const P = { weight: 90, width: 1, slant: 0, ...v };
  for (let i = 0; i < 20; i++) outlineA1('A', P);
  let t = performance.now(); for (let i = 0; i < 200; i++) outlineA1('A', { ...P, weight: 40 + (i % 120) }); const perA = (performance.now() - t) / 200;
  t = performance.now(); for (const c of ninetyFive) outlineA1(c, P); const all = performance.now() - t;
  const rings = [40, 90, 160].map((w) => ORDER.map((c) => outlineA1(c, { ...P, weight: w }).length).join('/')).join(' → ');
  console.log(`${vn.padEnd(12)} | ${perA.toFixed(3).padStart(13)} | ${all.toFixed(1).padStart(12)} | ${rings}`);
}
fs.mkdirSync('out2', { recursive: true });
for (const [vn, v] of Object.entries(variants)) for (const w of [40, 140]) {
  const P = { weight: w, width: 1, slant: 0, ...v };
  for (const [m, fn] of [['A1', outlineA1], ['Bnorm', outlineBnorm]]) {
    const name = `${m}-${vn}-w${w}`; const buf = makeFont('S2' + name.replace(/-/g, ''), fn, P);
    fs.writeFileSync(`out2/${name}.otf`, buf);
  }
}
console.log('out2/ に', fs.readdirSync('out2').length, '個の OTF');
}
