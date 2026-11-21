// ADR-0001 検証用スパイク。src/ には混ぜない。
// 骨格（中心線）＋パラメータ → 輪郭 を 3 方式で作り、速度・点数・OTF の書き出しを比べる。
//   A1: 自前の膨らませ → polygon-clipping で合成
//   A2: 自前の膨らませ → paper.js で合成
//   B : 自前の膨らませ → 合成しない（向きを揃えない B-raw / 揃える B-norm）
import fs from 'node:fs';
import opentype from 'opentype.js';
import pc from 'polygon-clipping';
import paper from 'paper/dist/paper-core.js';

paper.setup(new paper.Size(1, 1));

// ---- 骨格: stroke = { closed?, segs: [[x,y] | {c:[[x,y],[x,y],[x,y]]}] } ----
const L = (...pts) => ({ segs: pts });
const ellipse = (cx, cy, rx, ry) => {
  const k = 0.5523;
  return {
    closed: true,
    segs: [
      [cx, cy + ry],
      { c: [[cx + k * rx, cy + ry], [cx + rx, cy + k * ry], [cx + rx, cy]] },
      { c: [[cx + rx, cy - k * ry], [cx + k * rx, cy - ry], [cx, cy - ry]] },
      { c: [[cx - k * rx, cy - ry], [cx - rx, cy - k * ry], [cx - rx, cy]] },
      { c: [[cx - rx, cy + k * ry], [cx - k * rx, cy + ry], [cx, cy + ry]] },
    ],
  };
};
const SKEL = {
  // A: 左の斜線は上→下、右の斜線は下→上（向きをわざと逆にして重なりの塗りを試す）
  A: [L([300, 700], [60, 0]), L([540, 0], [300, 700]), L([140, 230], [460, 230])],
  O: [ellipse(320, 350, 260, 350)],
  8: [ellipse(300, 530, 190, 170), ellipse(300, 180, 230, 180)],
  x: [L([60, 0], [460, 500]), L([60, 500], [460, 0])],
  g: [ellipse(260, 300, 200, 200), { segs: [[460, 500], [460, -50], { c: [[460, -250], [100, -250], [80, -120]] }] }],
  '@': [ellipse(450, 300, 380, 380), ellipse(430, 300, 150, 170), { segs: [[580, 470], [580, 180], { c: [[580, 60], [760, 80], [790, 250]] }] }],
};

// ---- 骨格をポリラインにする ----
function flatten(stroke, steps = 16) {
  const pts = [];
  let cur = null;
  for (const s of stroke.segs) {
    if (Array.isArray(s)) { pts.push(s); cur = s; continue; }
    const [p1, p2, p3] = s.c;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps, u = 1 - t;
      pts.push([
        u * u * u * cur[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
        u * u * u * cur[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
      ]);
    }
    cur = p3;
  }
  if (stroke.closed) pts.pop();
  return pts;
}

// ---- ポリラインを太さ w で膨らませる（miter、上限あり） ----
function offsetSide(pts, d, closed) {
  const n = pts.length, out = [];
  const nrm = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [-dy / l, dx / l]; };
  for (let i = 0; i < n; i++) {
    const prev = closed ? pts[(i - 1 + n) % n] : pts[i - 1];
    const next = closed ? pts[(i + 1) % n] : pts[i + 1];
    let nx, ny;
    if (!prev) [nx, ny] = nrm(pts[i], next);
    else if (!next) [nx, ny] = nrm(prev, pts[i]);
    else {
      const a = nrm(prev, pts[i]), b = nrm(pts[i], next);
      let mx = a[0] + b[0], my = a[1] + b[1];
      const ml = Math.hypot(mx, my) || 1; mx /= ml; my /= ml;
      const cos = mx * a[0] + my * a[1];
      const s = 1 / Math.max(cos, 0.25); // miter の上限 4 倍
      nx = mx * s; ny = my * s;
    }
    out.push([pts[i][0] + nx * d, pts[i][1] + ny * d]);
  }
  return out;
}
const area = (r) => { let a = 0; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };

// 1 本の線 → 輪郭のリング群（開いた線は1リング、閉じた線は外側＋内側の2リング）
function expandStroke(stroke, P) {
  const pts = flatten(stroke).map(([x, y]) => [x * P.width, y]);
  const h = P.weight / 2;
  if (stroke.closed) {
    const outer = offsetSide(pts, h, true), inner = offsetSide(pts, -h, true);
    return [[outer, inner]]; // polygon with hole
  }
  const left = offsetSide(pts, h, false), right = offsetSide(pts, -h, false).reverse();
  return [[[...left, ...right]]];
}
const slant = (P) => ([x, y]) => [x + y * Math.tan((P.slant * Math.PI) / 180), y];

function buildPolys(ch, P) {
  return SKEL[ch].flatMap((s) => expandStroke(s, P)).map((poly) => poly.map((ring) => ring.map(slant(P))));
}

// ---- 方式ごとの輪郭（リングの配列）----
function outlineA1(ch, P) {
  const mp = pc.union(...buildPolys(ch, P).map((p) => [p]));
  return mp.flatMap((poly) => poly.map((ring) => ring.slice(0, -1)));
}
function outlineA2(ch, P) {
  let acc = null;
  for (const poly of buildPolys(ch, P)) {
    const item = new paper.CompoundPath({ children: poly.map((r) => new paper.Path({ segments: r, closed: true })), insert: false });
    item.fillRule = 'evenodd';
    acc = acc ? acc.unite(item, { insert: false }) : item;
  }
  const paths = acc.children ? acc.children : [acc];
  return paths.map((p) => p.segments.map((s) => [s.point.x, s.point.y]));
}
function outlineB(ch, P, normalize) {
  return buildPolys(ch, P).flatMap((poly) =>
    poly.map((ring, i) => {
      if (!normalize) return ring;
      const wantCCW = i === 0; // 外側は反時計回り（y 上向き）、穴は時計回り
      return (area(ring) > 0) === wantCCW ? ring : [...ring].reverse();
    }),
  );
}

// ---- OTF ----
function toPath(rings) {
  const p = new opentype.Path();
  for (const r of rings) { r.forEach(([x, y], i) => (i ? p.lineTo(Math.round(x), Math.round(y)) : p.moveTo(Math.round(x), Math.round(y)))); p.close(); }
  return p;
}
function makeFont(name, fn, P) {
  const glyphs = [new opentype.Glyph({ name: '.notdef', unicode: 0, advanceWidth: 600, path: new opentype.Path() }),
    new opentype.Glyph({ name: 'space', unicode: 32, advanceWidth: 300, path: new opentype.Path() })];
  for (const ch of Object.keys(SKEL)) {
    glyphs.push(new opentype.Glyph({ name: 'g' + ch.charCodeAt(0), unicode: ch.charCodeAt(0), advanceWidth: Math.round(900 * P.width) + 60, path: toPath(fn(ch, P)) }));
  }
  const font = new opentype.Font({ familyName: name, styleName: 'Regular', unitsPerEm: 1000, ascender: 800, descender: -250, glyphs });
  return Buffer.from(font.toArrayBuffer());
}

// ---- 計測 ----
const P = { weight: 90, width: 1, slant: 0 };
const methods = { A1: (c, p) => outlineA1(c, p), A2: (c, p) => outlineA2(c, p), 'B-raw': (c, p) => outlineB(c, p, false), 'B-norm': (c, p) => outlineB(c, p, true) };
const chars = Object.keys(SKEL);
const ninetyFive = Array.from({ length: 95 }, (_, i) => chars[i % chars.length]);

console.log('method  | A 1文字 平均ms | 95文字 ms | 点数(A/O/8/x/g/@)');
for (const [name, fn] of Object.entries(methods)) {
  for (let i = 0; i < 20; i++) fn('A', P); // warm up
  let t = performance.now();
  for (let i = 0; i < 200; i++) fn('A', { ...P, weight: 40 + (i % 120) });
  const perA = (performance.now() - t) / 200;
  t = performance.now();
  for (const c of ninetyFive) fn(c, P);
  const all = performance.now() - t;
  const pts = chars.map((c) => fn(c, P).reduce((n, r) => n + r.length, 0)).join('/');
  console.log(`${name.padEnd(7)} | ${perA.toFixed(3).padStart(13)} | ${all.toFixed(1).padStart(9)} | ${pts}`);
}

// 太さの上下限での合成結果（穴が潰れていないか: リング数）
for (const w of [20, 90, 160, 220]) {
  const p = { ...P, weight: w };
  console.log(`weight=${w}: A1 リング数`, chars.map((c) => `${c}:${outlineA1(c, p).length}`).join(' '));
}

fs.mkdirSync('out', { recursive: true });
for (const [name, fn] of Object.entries(methods)) {
  const buf = makeFont('Spike' + name.replace('-', ''), fn, { weight: 90, width: 1, slant: 10 });
  fs.writeFileSync(`out/${name}.otf`, buf);
  const back = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  console.log(`${name}.otf ${buf.length} bytes, 読み戻し glyphs=${back.glyphs.length}, outlinesFormat=${back.outlinesFormat}, A advance=${back.charToGlyph('A').advanceWidth}`);
}
