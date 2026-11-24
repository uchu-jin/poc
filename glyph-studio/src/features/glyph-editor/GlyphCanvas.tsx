// グリッドの上に A を描き、4 つのハンドルのドラッグとキーボードを受ける（FR-001〜FR-006・FR-023）
import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { ASCENDER, CAP_HEIGHT, DESCENDER } from '../glyph-engine/metrics';
import { PARAM_LIMITS } from '../glyph-engine/params';
import type { Outline, Vec } from '../glyph-engine/types';
import type { EditorAction, EditorState } from './editorReducer';
import { HANDLE_IDS, handlePosition, type HandleId } from './handles';

const X_MIN = 0;
const X_MAX = 1000;
const Y_MIN = DESCENDER;
const Y_MAX = 1000;

export const HANDLE_LABELS: Record<HandleId, string> = {
  weight: '太さ',
  hWeight: '横線の太さ',
  width: '幅',
  slant: '傾き',
};

export function formatValue(id: HandleId | 'xHeight', v: number): string {
  if (id === 'width') return v.toFixed(2);
  if (id === 'slant') return `${v.toFixed(1)}°`;
  return String(Math.round(v));
}

/** 1000 単位（y 上向き）の輪郭を SVG のパス（y 下向き）にする */
export function outlinePath(outline: Outline, dx = 0): string {
  return outline
    .map(
      (r) => 'M' + r.map(([x, y]) => `${(x + dx).toFixed(1)} ${(-y).toFixed(1)}`).join('L') + 'Z',
    )
    .join('');
}

function GridLines({ step, xHeight }: { step: number; xHeight: number }) {
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

export default function GlyphCanvas({
  state,
  dispatch,
}: {
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const frame = useRef<number | null>(null);
  const latest = useRef<Vec | null>(null);
  const dragging = useRef(false);
  const [focused, setFocused] = useState<HandleId | null>(null);
  const { live, view } = state;

  // 画面を閉じたときは、予約した描き直しを取り消す
  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );

  /** 画面の座標 → 1000 単位（y 上向き） */
  const toFont = (e: ReactPointerEvent): Vec | null => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return null;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return [pt.x, -pt.y];
  };

  const flush = () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    if (latest.current) dispatch({ type: 'dragMove', at: latest.current });
  };

  const onHandleDown = (id: HandleId) => (e: ReactPointerEvent) => {
    const at = toFont(e);
    if (!at) return;
    e.preventDefault();
    svgRef.current?.setPointerCapture(e.pointerId);
    dragging.current = true;
    latest.current = null;
    dispatch({ type: 'dragStart', handle: id, at });
  };

  const onMove = (e: ReactPointerEvent) => {
    if (!dragging.current) return;
    latest.current = toFont(e);
    // pointermove が速く来ても、描き直しは 1 フレーム 1 回にまとめる
    if (frame.current === null)
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        if (latest.current) dispatch({ type: 'dragMove', at: latest.current });
      });
  };

  const onUp = (e: ReactPointerEvent) => {
    if (!dragging.current) return;
    flush();
    dragging.current = false;
    dispatch({ type: 'dragEnd' });
    if (svgRef.current?.hasPointerCapture(e.pointerId))
      svgRef.current.releasePointerCapture(e.pointerId);
  };

  // 途中で切れたとき（pointercancel・lostpointercapture）は、ドラッグ前の値に戻す
  const onCancel = () => {
    if (!dragging.current) return;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    dragging.current = false;
    dispatch({ type: 'dragCancel' });
  };

  const active = state.drag?.handle ?? focused;

  return (
    <div className="canvas">
      <svg
        ref={svgRef}
        viewBox={`${X_MIN} ${-Y_MAX} ${X_MAX - X_MIN} ${Y_MAX - Y_MIN}`}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onCancel}
        onLostPointerCapture={onCancel}
        aria-label="A の変形キャンバス"
      >
        <GridLines step={state.grid} xHeight={live.xHeight} />
        {view && <path className="glyph" d={outlinePath(view.outline)} />}
        {view &&
          HANDLE_IDS.map((id) => {
            const [x, y] = handlePosition(id, live, view.shiftX);
            const [min, max] = PARAM_LIMITS[id];
            return (
              <g
                key={id}
                className={active === id ? 'handle handle--active' : 'handle'}
                role="slider"
                tabIndex={0}
                aria-label={HANDLE_LABELS[id]}
                aria-valuenow={live[id]}
                aria-valuemin={min}
                aria-valuemax={max}
                aria-valuetext={formatValue(id, live[id])}
                onPointerDown={onHandleDown(id)}
                onFocus={() => setFocused(id)}
                onBlur={() => setFocused((f) => (f === id ? null : f))}
                onKeyDown={(e) => {
                  if (!e.key.startsWith('Arrow')) return;
                  e.preventDefault();
                  dispatch({ type: 'key', handle: id, key: e.key });
                }}
              >
                <circle cx={x} cy={-y} r={18} />
              </g>
            );
          })}
        {view &&
          active &&
          (() => {
            const [x, y] = handlePosition(active, live, view.shiftX);
            return (
              <text className="handle-value" x={x + 28} y={-y - 24}>
                {HANDLE_LABELS[active]} {formatValue(active, live[active])}
              </text>
            );
          })()}
      </svg>
      {state.error && (
        <p className="canvas__error" role="alert">
          A を組めませんでした（直前の形を表示しています）：{state.error}
        </p>
      )}
    </div>
  );
}
