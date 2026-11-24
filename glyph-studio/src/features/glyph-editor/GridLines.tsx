// キャンバスの背景：グリッドの線（100 ごとに濃く）と、ベースライン・x ハイト・キャップハイト・アセンダーの線
import { ASCENDER, CAP_HEIGHT, DESCENDER } from '../glyph-engine/metrics';

/** キャンバスの範囲（1000 単位） */
export const X_MIN = 0;
export const X_MAX = 1000;
export const Y_MIN = DESCENDER;
export const Y_MAX = 1000;

export function GridLines({ step, xHeight }: { step: number; xHeight: number }) {
  const lines = [];
  for (let x = X_MIN; x <= X_MAX; x += step)
    lines.push(
      <line
        key={`x${x}`}
        className={x % 100 === 0 ? 'grid grid--major' : 'grid'}
        x1={x}
        x2={x}
        y1={-Y_MAX}
        y2={-Y_MIN}
      />,
    );
  for (let y = Math.ceil(Y_MIN / step) * step; y <= Y_MAX; y += step)
    lines.push(
      <line
        key={`y${y}`}
        className={y % 100 === 0 ? 'grid grid--major' : 'grid'}
        x1={X_MIN}
        x2={X_MAX}
        y1={-y}
        y2={-y}
      />,
    );
  const guide = (y: number, label: string) => (
    <g key={label}>
      <line className="guide-line" x1={X_MIN} x2={X_MAX} y1={-y} y2={-y} />
      <text className="guide-label" x={X_MAX - 8} y={-y - 8} textAnchor="end">
        {label}
      </text>
    </g>
  );
  return (
    <g aria-hidden="true">
      {lines}
      {guide(0, 'ベースライン')}
      {guide(xHeight, 'x ハイト')}
      {guide(CAP_HEIGHT, 'キャップハイト')}
      {guide(ASCENDER, 'アセンダー')}
    </g>
  );
}
