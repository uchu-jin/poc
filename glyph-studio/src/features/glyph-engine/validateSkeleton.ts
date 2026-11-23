// 骨格データの検査。既定データのテストと、buildGlyph の入口の両方で使う。
// 個別に直した骨格はのちに保存データから入ってくるので、形から疑って調べる（docs/rules/security.md）
import { COORD_MAX, COORD_MIN, MAX_POINTS_PER_STROKE, MAX_STROKES } from './metrics';
import type { Point, Segment, Skeleton, Stroke } from './types';

export type ValidateResult = { ok: true; skeleton: Skeleton } | { ok: false; message: string };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

class Invalid extends Error {}

function point(v: unknown, ids: Set<string>): Point {
  if (!isObject(v)) throw new Invalid('点がオブジェクトでない');
  const { id, x, y } = v;
  if (typeof id !== 'string' || id === '') throw new Invalid('点の ID が文字列でない');
  for (const c of [x, y])
    if (typeof c !== 'number' || !Number.isInteger(c) || c < COORD_MIN || c > COORD_MAX)
      throw new Invalid(`点 ${id} の座標が ${COORD_MIN}〜${COORD_MAX} の整数でない`);
  if (ids.has(id)) throw new Invalid(`点の ID ${id} が重複している`);
  ids.add(id);
  return { id, x: x as number, y: y as number };
}

function segment(v: unknown, ids: Set<string>): Segment {
  if (!isObject(v)) throw new Invalid('区間がオブジェクトでない');
  if (v.kind === 'line') return { kind: 'line', to: point(v.to, ids) };
  if (v.kind === 'cubic')
    return { kind: 'cubic', c1: point(v.c1, ids), c2: point(v.c2, ids), to: point(v.to, ids) };
  throw new Invalid('未知の区間の種類');
}

function stroke(v: unknown, ids: Set<string>): Stroke {
  if (!isObject(v)) throw new Invalid('線がオブジェクトでない');
  if (!Array.isArray(v.segments) || v.segments.length === 0)
    throw new Invalid('線の区間が 1 つ以上の配列でない');
  const points =
    1 +
    v.segments.reduce(
      (n: number, s: unknown) => n + (isObject(s) && s.kind === 'cubic' ? 3 : 1),
      0,
    );
  if (points > MAX_POINTS_PER_STROKE)
    throw new Invalid(`線の点が ${MAX_POINTS_PER_STROKE} 個を超える`);
  const result: Stroke = {
    start: point(v.start, ids),
    segments: v.segments.map((s) => segment(s, ids)),
  };
  if (v.closed === true) result.closed = true;
  return result;
}

export function validateSkeleton(v: unknown): ValidateResult {
  try {
    if (!isObject(v) || !Array.isArray(v.strokes)) throw new Invalid('線の配列がない');
    if (v.strokes.length === 0) throw new Invalid('線が 0 本');
    if (v.strokes.length > MAX_STROKES) throw new Invalid(`線が ${MAX_STROKES} 本を超える`);
    const ids = new Set<string>();
    return { ok: true, skeleton: { strokes: v.strokes.map((s) => stroke(s, ids)) } };
  } catch (e) {
    if (e instanceof Invalid) return { ok: false, message: e.message };
    return { ok: false, message: '骨格データを読めない' };
  }
}
