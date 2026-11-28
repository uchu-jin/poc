// A の上の 4 つのハンドル：位置（パラメータ → 座標）と、ドラッグ・キーからの新しいパラメータ（プラン a-editor）
import { buildGlyph } from '../glyph-engine/buildGlyph';
import { strokeWidthAt } from '../glyph-engine/expand';
import { PARAM_LIMITS } from '../glyph-engine/params';
import type { Params, Vec } from '../glyph-engine/types';
import type { MakeClipper } from '../glyph-engine/union';
import { snapDistance, snapValue } from './snap';

export type HandleId = 'weight' | 'hWeight' | 'width' | 'slant';
export const HANDLE_IDS: readonly HandleId[] = ['weight', 'hWeight', 'width', 'slant'];

// A の既定の骨格の点（skeletons/uppercase.ts）。A の骨格を個別に直したときの扱いは未確定事項 #10
const APEX: Vec = [300, 610];
const LEFT_FOOT: Vec = [50, 0];
const RIGHT_FOOT: Vec = [550, 0];
const BAR_Y = 200;
const BAR_CENTER_X = (132 + 468) / 2;
/** 太さのハンドルを置く高さ（右の斜線の中ほど） */
const WEIGHT_Y = APEX[1] / 2;
/** 骨格の左右の足の間隔 */
const FOOT_SPAN = RIGHT_FOOT[0] - LEFT_FOOT[0];
/** 二分探索の回数。範囲 130 を 2^12 で割って約 0.03（1 刻みに丸めるのに十分） */
const SOLVE_STEPS = 12;

const rad = (deg: number) => (deg * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const clamp = (v: number, [min, max]: [number, number]) => Math.min(max, Math.max(min, v));
/** 浮動小数の端数を落とす（往復で 0 に戻る、1.1 ＋ 0.05 が 1.15 になる。実装レビュー P2） */
const tidy = (v: number, digits: number) => {
  const k = 10 ** digits;
  const r = Math.round(v * k) / k;
  return r === 0 ? 0 : r;
};
/** 頂点の横のずれ（610 × tan 傾き）。端数を落としてから使う */
const slantOffset = (p: Params) => tidy(APEX[1] * Math.tan(rad(p.slant)), 9);
const slantFromOffset = (offset: number) =>
  clamp(tidy(deg(Math.atan(offset / APEX[1])), 12), PARAM_LIMITS.slant);
const tidyWidth = (w: number) => clamp(tidy(w, 6), PARAM_LIMITS.width);

/** buildGlyph と同じ順番：幅の拡大 → 傾き → shiftX */
function place([x, y]: Vec, p: Params, shiftX: number): Vec {
  return [x * p.width + y * Math.tan(rad(p.slant)) + shiftX, y];
}

/** パラメータ p の A の shiftX（組めなければ 0）。makeClipper は画面の状態と同じものを使う */
export function shiftXOf(p: Params, makeClipper?: MakeClipper): number {
  const r = buildGlyph('A', p, { makeClipper });
  return r.ok ? r.shiftX : 0;
}

/** ハンドルの位置（1000 単位、y は上向き）。shiftX は同じパラメータで組んだ A のもの */
export function handlePosition(id: HandleId, p: Params, shiftX: number): Vec {
  switch (id) {
    case 'weight': {
      // 右の斜線の中心線（幅で拡大したもの）の、y ＝ 305 での点から、外側の辺まで横に「太さの半分 ÷ ｜縦成分｜」
      const d: Vec = [(RIGHT_FOOT[0] - APEX[0]) * p.width, RIGHT_FOOT[1] - APEX[1]];
      const len = Math.hypot(d[0], d[1]);
      const t: Vec = [d[0] / len, d[1] / len];
      const half = strokeWidthAt(t, p) / 2;
      const cx = (APEX[0] + RIGHT_FOOT[0]) / 2;
      const [x, y] = place([cx, WEIGHT_Y], p, shiftX);
      return [x + half / Math.abs(t[1]), y];
    }
    case 'hWeight':
      return place([BAR_CENTER_X, BAR_Y + p.hWeight / 2], p, shiftX);
    case 'width':
      return place(RIGHT_FOOT, p, shiftX);
    case 'slant':
      return place(APEX, p, shiftX);
  }
}

/**
 * カーソルの横の位置 targetX にハンドルが来る太さを、上限・下限の間で二分探索する。
 * 位置は shiftX 込みで A を組んで求める（1 回の移動で A を約 15 回組む）
 */
function solveWeight(from: Params, targetX: number, makeClipper?: MakeClipper): number {
  const xAt = (weight: number) => {
    const p = { ...from, weight };
    return handlePosition('weight', p, shiftXOf(p, makeClipper))[0];
  };
  let [lo, hi] = PARAM_LIMITS.weight;
  if (targetX <= xAt(lo)) return lo;
  if (targetX >= xAt(hi)) return hi;
  for (let i = 0; i < SOLVE_STEPS; i++) {
    const mid = (lo + hi) / 2;
    if (xAt(mid) < targetX) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * ドラッグを始めたときのパラメータ from と、カーソルの移動量 delta（1000 単位、y は上向き）から、新しいパラメータを返す。
 * 太さ・横線の太さは値をグリッド刻みに、幅・傾きは動かした距離をグリッド刻みに丸める（FR-003）
 */
export function dragTo(
  id: HandleId,
  from: Params,
  [dx, dy]: Vec,
  grid: number,
  snap: boolean,
  makeClipper?: MakeClipper,
): Params {
  if (dx === 0 && dy === 0) return from;
  switch (id) {
    case 'weight': {
      const [min, max] = PARAM_LIMITS.weight;
      const startX = handlePosition('weight', from, shiftXOf(from, makeClipper))[0];
      const w = solveWeight(from, startX + dx, makeClipper);
      return { ...from, weight: snapValue(w, grid, min, max, snap) };
    }
    case 'hWeight': {
      const [min, max] = PARAM_LIMITS.hWeight;
      return { ...from, hWeight: snapValue(from.hWeight + 2 * dy, grid, min, max, snap) };
    }
    case 'width':
      return { ...from, width: tidyWidth(from.width + snapDistance(dx, grid, snap) / FOOT_SPAN) };
    case 'slant':
      return { ...from, slant: slantFromOffset(slantOffset(from) + snapDistance(dx, grid, snap)) };
  }
}

/** 矢印キーで 1 刻み動かす（右・上で増え、左・下で減る。FR-023）。対象外のキーは変えない */
export function keyStep(id: HandleId, key: string, p: Params, grid: number, snap: boolean): Params {
  const dir =
    key === 'ArrowRight' || key === 'ArrowUp'
      ? 1
      : key === 'ArrowLeft' || key === 'ArrowDown'
        ? -1
        : 0;
  if (dir === 0) return p;
  const step = (snap ? grid : 1) * dir;
  switch (id) {
    case 'weight':
      return { ...p, weight: clamp(p.weight + step, PARAM_LIMITS.weight) };
    case 'hWeight':
      return { ...p, hWeight: clamp(p.hWeight + step, PARAM_LIMITS.hWeight) };
    case 'width':
      return { ...p, width: tidyWidth(p.width + step / FOOT_SPAN) };
    case 'slant':
      return { ...p, slant: slantFromOffset(slantOffset(p) + step) };
  }
}
