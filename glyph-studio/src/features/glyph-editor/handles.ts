// A の上の 4 つのハンドル：位置（パラメータ → 座標）と、ドラッグ・キーからの新しいパラメータ（プラン a-editor）
import { buildGlyph } from '../glyph-engine/buildGlyph';
import { strokeWidthAt } from '../glyph-engine/expand';
import { PARAM_LIMITS } from '../glyph-engine/params';
import type { Params, Vec } from '../glyph-engine/types';
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

const rad = (deg: number) => (deg * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const clamp = (v: number, [min, max]: [number, number]) => Math.min(max, Math.max(min, v));

/** buildGlyph と同じ順番：幅の拡大 → 傾き → shiftX */
function place([x, y]: Vec, p: Params, shiftX: number): Vec {
  return [x * p.width + y * Math.tan(rad(p.slant)) + shiftX, y];
}

/** パラメータ p の A の shiftX（組めなければ 0） */
export function shiftXOf(p: Params): number {
  const r = buildGlyph('A', p);
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

/** 表示用の値（太さ・横線の太さは単位、幅は倍率、傾きは度） */
export function handleValue(id: HandleId, p: Params): number {
  return p[id];
}

/** 太さのハンドルの横の位置（shiftX 込み） */
const weightHandleX = (p: Params) => handlePosition('weight', p, shiftXOf(p))[0];

/** カーソルの横の位置 targetX にハンドルが来る太さを、上限・下限の間で二分探索する（20 回） */
function solveWeight(from: Params, targetX: number): number {
  let [lo, hi] = PARAM_LIMITS.weight;
  if (targetX <= weightHandleX({ ...from, weight: lo })) return lo;
  if (targetX >= weightHandleX({ ...from, weight: hi })) return hi;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    if (weightHandleX({ ...from, weight: mid }) < targetX) lo = mid;
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
): Params {
  if (dx === 0 && dy === 0) return from;
  switch (id) {
    case 'weight': {
      const [min, max] = PARAM_LIMITS.weight;
      const w = solveWeight(from, weightHandleX(from) + dx);
      return { ...from, weight: snapValue(w, grid, min, max, snap) };
    }
    case 'hWeight': {
      const [min, max] = PARAM_LIMITS.hWeight;
      return { ...from, hWeight: snapValue(from.hWeight + 2 * dy, grid, min, max, snap) };
    }
    case 'width':
      return {
        ...from,
        width: clamp(from.width + snapDistance(dx, grid, snap) / FOOT_SPAN, PARAM_LIMITS.width),
      };
    case 'slant': {
      const offset = APEX[1] * Math.tan(rad(from.slant)) + snapDistance(dx, grid, snap);
      return { ...from, slant: clamp(deg(Math.atan(offset / APEX[1])), PARAM_LIMITS.slant) };
    }
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
      return { ...p, width: clamp(p.width + step / FOOT_SPAN, PARAM_LIMITS.width) };
    case 'slant': {
      const offset = APEX[1] * Math.tan(rad(p.slant)) + step;
      return { ...p, slant: clamp(deg(Math.atan(offset / APEX[1])), PARAM_LIMITS.slant) };
    }
  }
}
