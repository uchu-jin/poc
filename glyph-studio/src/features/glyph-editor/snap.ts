// 値・距離をグリッド刻みに丸める（FR-003・FR-005）

const noNegZero = (x: number) => (x === 0 ? 0 : x);

/**
 * 値をグリッド刻みに丸める。候補は「範囲の中の刻みの値」と「上限・下限ちょうど」で、いちばん近いものを選ぶ（ちょうど半分は大きい側）。
 * 吸着が OFF のときは 1 刻み。数値でない値は下限にする
 */
export function snapValue(
  v: number,
  step: number,
  min: number,
  max: number,
  snap: boolean,
): number {
  if (!Number.isFinite(v)) return Number.isNaN(v) ? min : v > 0 ? max : min;
  const c = Math.min(max, Math.max(min, v));
  if (!snap) return Math.min(max, Math.max(min, Math.round(c)));
  const candidates = [Math.floor(c / step) * step, Math.ceil(c / step) * step, min, max].filter(
    (x) => x >= min && x <= max,
  );
  let best = candidates[0]!;
  for (const x of candidates) {
    const d = Math.abs(x - c);
    const bd = Math.abs(best - c);
    // ちょうど半分は大きい側（snapDistance の「0 から遠い側」とそろえる）
    if (d < bd || (d === bd && x > best)) best = x;
  }
  return best;
}

/** 距離をグリッド刻みに丸める（ちょうど半分は 0 から遠い側。左右対称）。吸着が OFF のときは 1 刻み */
export function snapDistance(d: number, step: number, snap: boolean): number {
  const unit = snap ? step : 1;
  return noNegZero(Math.sign(d) * Math.round(Math.abs(d) / unit) * unit);
}
