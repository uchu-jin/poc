// 1 文字の組み立て：検査 → x ハイト → 幅 → 折れ線 → 膨らませ＋端・角 → 傾き → 合成 → 余白と文字幅
import { expandPolyline, strokeWidthAt } from './expand';
import { flattenSegment } from './flatten';
import { boundsOf, distToSegment, unit } from './geometry';
import { SIDE_BEARING, SPACE_WIDTH } from './metrics';
import { clampParams } from './params';
import { DEFAULT_SKELETONS, GLYPH_CHARS } from './skeletons';
import { capPolys, joinPolys, slabSize } from './terminals';
import { defaultMakeClipper, unionPolys, type MakeClipper } from './union';
import { validateSkeleton } from './validateSkeleton';
import { remapSkeleton } from './verticalRemap';
import type { BuildResult, Outline, Params, Point, Poly, Segment, Skeleton, Vec } from './types';

export type BuildOptions = {
  /** 既定の骨格の代わりに使う骨格（個別に直した骨格。基準の座標のまま渡す。FR-011） */
  skeleton?: unknown;
  makeClipper?: MakeClipper;
};

/** 区間の境目で向きがこれ以上曲がったら、線を分けて「角」として扱う（実装時の判断） */
const SPLIT_ANGLE_DEG = 20;
/** 端が他の線と重なるとみなす距離 */
const TOUCH_EPS = 2;

/** 線を角で分けたもの。両端の区間が直線かどうかも持つ（スラブは直線の端だけ） */
type Piece = { pts: Vec[]; closed: boolean; startIsLine: boolean; endIsLine: boolean };

const v = (p: Point): Vec => [p.x, p.y];

function segEndPoint(seg: Segment): Vec {
  return v(seg.to);
}
/** 区間の始まりの向き・終わりの向き */
function segTangents(from: Vec, seg: Segment): { start: Vec; end: Vec } {
  const to = v(seg.to);
  if (seg.kind === 'line') {
    const d = unit([to[0] - from[0], to[1] - from[1]]);
    return { start: d, end: d };
  }
  const c1 = v(seg.c1);
  const c2 = v(seg.c2);
  const pick = (a: Vec, b: Vec, c: Vec): Vec => {
    const d = unit([b[0] - a[0], b[1] - a[1]]);
    return d[0] === 0 && d[1] === 0 ? unit([c[0] - a[0], c[1] - a[1]]) : d;
  };
  return { start: pick(from, c1, to), end: unit(pick(to, c2, from).map((x) => -x) as Vec) };
}
const isSharp = (a: Vec, b: Vec) =>
  a[0] * b[0] + a[1] * b[1] < Math.cos((SPLIT_ANGLE_DEG * Math.PI) / 180);

function piecesOf(skeleton: Skeleton): Piece[] {
  const pieces: Piece[] = [];
  for (const stroke of skeleton.strokes) {
    const starts: Vec[] = [v(stroke.start)];
    for (const seg of stroke.segments) starts.push(segEndPoint(seg));
    const tan = stroke.segments.map((seg, i) => segTangents(starts[i]!, seg));
    const n = stroke.segments.length;
    // 角になる境目（区間 i の終わりと区間 i+1 の始まり）
    const cuts: number[] = [];
    for (let i = 0; i < n - 1; i++) if (isSharp(tan[i]!.end, tan[i + 1]!.start)) cuts.push(i);
    if (stroke.closed && isSharp(tan[n - 1]!.end, tan[0]!.start)) cuts.push(n - 1);

    const run = (from: number, count: number): Piece => {
      const pts: Vec[] = [starts[from]!];
      for (let k = 0; k < count; k++) {
        const i = (from + k) % n;
        for (const p of flattenSegment(pts[pts.length - 1]!, stroke.segments[i]!)) {
          const last = pts[pts.length - 1]!;
          if (last[0] !== p[0] || last[1] !== p[1]) pts.push(p);
        }
      }
      return {
        pts,
        closed: false,
        startIsLine: stroke.segments[from]!.kind === 'line',
        endIsLine: stroke.segments[(from + count - 1) % n]!.kind === 'line',
      };
    };

    if (stroke.closed && cuts.length === 0) {
      const p = run(0, n);
      const first = p.pts[0]!;
      const last = p.pts[p.pts.length - 1]!;
      if (Math.hypot(first[0] - last[0], first[1] - last[1]) < 1e-9) p.pts.pop();
      pieces.push({ ...p, closed: true });
    } else if (stroke.closed) {
      // 角から角までを 1 本ずつ。最後の角から一周して最初の角まで
      for (let c = 0; c < cuts.length; c++) {
        const from = (cuts[c]! + 1) % n;
        const to = cuts[(c + 1) % cuts.length]!;
        const count = ((to - from + n) % n) + 1;
        pieces.push(run(from, count));
      }
    } else {
      let from = 0;
      for (const c of [...cuts, n - 1]) {
        pieces.push(run(from, c - from + 1));
        from = c + 1;
      }
    }
  }
  return pieces.filter((p) => p.pts.length >= 2);
}

const near = (a: Vec, b: Vec) => Math.hypot(a[0] - b[0], a[1] - b[1]) < TOUCH_EPS;

function onOtherPiece(p: Vec, self: number, pieces: Piece[]): boolean {
  return pieces.some((piece, j) => {
    if (j === self) return false;
    const pts = piece.pts;
    const m = piece.closed ? pts.length : pts.length - 1;
    for (let i = 0; i < m; i++)
      if (distToSegment(p, pts[i]!, pts[(i + 1) % pts.length]!) < TOUCH_EPS) return true;
    return false;
  });
}

type End = { piece: number; at: Vec; away: Vec; isLine: boolean };

/** スラブが隣の線までの空きの何割まで張り出してよいか（2026-11-23 作者が決定） */
const SLAB_ROOM_SHARE = 0.4;

/**
 * スラブを左右それぞれどこまで張り出してよいか。スラブの高さの範囲にある他の線を、太さの半分だけ太らせて
 * 障害物とし、縦線の端から障害物までの空きの 4 割まで（2 本の足のスラブが向かい合ってもくっつかない）
 */
function slabRoom(e: End, pieces: Piece[], w: { weight: number; hWeight: number }) {
  const out: Vec = [-e.away[0], -e.away[1]];
  const stemHalf = strokeWidthAt(out, w) / 2;
  const { thickness } = slabSize(w.weight);
  const y0 = out[1] < 0 ? e.at[1] : e.at[1] - thickness;
  const y1 = y0 + thickness;
  const hObs = Math.max(w.weight, w.hWeight) / 2;
  const lo = y0 - hObs;
  const hi = y1 + hObs;
  let freeL = Infinity;
  let freeR = Infinity;
  pieces.forEach((pc, j) => {
    if (j === e.piece) return;
    const pts = pc.pts;
    const m = pc.closed ? pts.length : pts.length - 1;
    for (let i = 0; i < m; i++) {
      const a = pts[i]!;
      const b = pts[(i + 1) % pts.length]!;
      // 線分のうち y が [lo, hi] に入る部分の x の範囲
      let t0 = 0;
      let t1 = 1;
      const dy = b[1] - a[1];
      if (dy === 0) {
        if (a[1] < lo || a[1] > hi) continue;
      } else {
        const ta = (lo - a[1]) / dy;
        const tb = (hi - a[1]) / dy;
        t0 = Math.max(0, Math.min(ta, tb));
        t1 = Math.min(1, Math.max(ta, tb));
        if (t0 > t1) continue;
      }
      const xa = a[0] + (b[0] - a[0]) * t0;
      const xb = a[0] + (b[0] - a[0]) * t1;
      const minX = Math.min(xa, xb) - hObs;
      const maxX = Math.max(xa, xb) + hObs;
      const x = e.at[0];
      if (maxX <= x) freeL = Math.min(freeL, x - stemHalf - maxX);
      else if (minX >= x) freeR = Math.min(freeR, minX - (x + stemHalf));
      else {
        freeL = 0;
        freeR = 0;
      }
    }
  });
  const room = (free: number) => stemHalf + Math.max(0, free) * SLAB_ROOM_SHARE;
  return { left: room(freeL), right: room(freeR) };
}

function shapesOf(skeleton: Skeleton, p: Params): Poly[] {
  const pieces = piecesOf(skeleton);
  const w = { weight: p.weight, hWeight: p.hWeight };
  const polys: Poly[] = pieces.map((pc) => expandPolyline(pc.pts, pc.closed, w));

  // 開いた線の両端。away は端から線に沿って離れる向き
  const ends: End[] = [];
  pieces.forEach((pc, i) => {
    if (pc.closed) return;
    const a = pc.pts[0]!;
    const b = pc.pts[pc.pts.length - 1]!;
    ends.push({
      piece: i,
      at: a,
      away: unit([pc.pts[1]![0] - a[0], pc.pts[1]![1] - a[1]]),
      isLine: pc.startIsLine,
    });
    const b1 = pc.pts[pc.pts.length - 2]!;
    ends.push({ piece: i, at: b, away: unit([b1[0] - b[0], b1[1] - b[1]]), isLine: pc.endIsLine });
  });

  const used = new Set<number>();
  ends.forEach((e, i) => {
    if (used.has(i)) return;
    const group = [i];
    ends.forEach((f, j) => {
      if (j !== i && !used.has(j) && near(e.at, f.at)) group.push(j);
    });
    group.forEach((g) => used.add(g));
    if (group.length >= 2) {
      // 線どうしがつながる点 → 角
      const half = (x: End) => strokeWidthAt(x.away, w) / 2;
      if (p.join === 'round') {
        polys.push(
          ...joinPolys(
            e.at,
            e.away,
            Math.max(...group.map((g) => half(ends[g]!))),
            e.away,
            0,
            'round',
          ),
        );
        return;
      }
      for (let a = 0; a < group.length; a++)
        for (let b = a + 1; b < group.length; b++) {
          const x = ends[group[a]!]!;
          const y = ends[group[b]!]!;
          polys.push(...joinPolys(x.at, x.away, half(x), y.away, half(y), 'miter'));
        }
      return;
    }
    // 他の線の上にある端（横棒の端など）には何も足さない
    if (onOtherPiece(e.at, e.piece, pieces)) return;
    const out: Vec = [-e.away[0], -e.away[1]];
    const room = p.terminal === 'slab' ? slabRoom(e, pieces, w) : undefined;
    polys.push(...capPolys(e.at, out, w, p.terminal, e.isLine, room));
  });
  return polys;
}

const isLowercase = (ch: string) => /^[a-z]$/.test(ch);

function scaleX(skeleton: Skeleton, k: number): Skeleton {
  const s = <T extends { x: number }>(pt: T): T => ({ ...pt, x: pt.x * k });
  return {
    strokes: skeleton.strokes.map((st) => ({
      ...st,
      start: s(st.start),
      segments: st.segments.map((seg) =>
        seg.kind === 'line'
          ? { kind: 'line', to: s(seg.to) }
          : { kind: 'cubic', c1: s(seg.c1), c2: s(seg.c2), to: s(seg.to) },
      ),
    })),
  };
}

const round1 = (x: number) => Math.round(x * 10) / 10;

export function buildGlyph(ch: string, params: Params, options: BuildOptions = {}): BuildResult {
  if (ch === ' ') return { ok: true, outline: [], advanceWidth: SPACE_WIDTH, bounds: null };
  const source = options.skeleton !== undefined ? options.skeleton : DEFAULT_SKELETONS[ch];
  if (source === undefined)
    return { ok: false, reason: 'invalid-skeleton', message: `「${ch}」の骨格がない` };
  const checked = validateSkeleton(source);
  if (!checked.ok) return { ok: false, reason: 'invalid-skeleton', message: checked.message };

  const p = clampParams(params);
  let skeleton = checked.skeleton;
  if (isLowercase(ch)) skeleton = remapSkeleton(skeleton, p.xHeight);
  skeleton = scaleX(skeleton, p.width);

  const tan = Math.tan((p.slant * Math.PI) / 180);
  const polys = shapesOf(skeleton, p).map((poly) =>
    poly.map((ring) => ring.map(([x, y]) => [x + y * tan, y] as Vec)),
  );

  const merged = unionPolys(polys, options.makeClipper ?? defaultMakeClipper);
  if (!merged.ok) return { ok: false, reason: 'union-failed', message: merged.message };
  if (merged.outline.length === 0)
    return { ok: false, reason: 'empty-outline', message: `「${ch}」の輪郭が空` };

  const b = boundsOf(merged.outline)!;
  const dx = SIDE_BEARING - b.minX;
  const outline: Outline = merged.outline.map((r) => r.map(([x, y]) => [round1(x + dx), y]));
  const bounds = boundsOf(outline)!;
  return {
    ok: true,
    outline,
    advanceWidth: round1(bounds.maxX - bounds.minX + SIDE_BEARING * 2),
    bounds,
  };
}

export type BuildAllOptions = { overrides?: Record<string, unknown>; makeClipper?: MakeClipper };

/** 62 字とスペースをまとめて組み立てる。1 文字の失敗は他の文字に影響しない */
export function buildGlyphs(
  params: Params,
  options: BuildAllOptions = {},
): Record<string, BuildResult> {
  const result: Record<string, BuildResult> = {};
  for (const ch of [...GLYPH_CHARS, ' ']) {
    const opts: BuildOptions = { makeClipper: options.makeClipper };
    if (options.overrides && ch in options.overrides) opts.skeleton = options.overrides[ch];
    result[ch] = buildGlyph(ch, params, opts);
  }
  return result;
}
