// グリッドの上に A を描き、4 つのハンドルのドラッグとキーボードを受ける（FR-001〜FR-006・FR-023）
import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { PARAM_LIMITS } from '../glyph-engine/params';
import type { Vec } from '../glyph-engine/types';
import type { EditorAction, EditorState } from './editorReducer';
import { HANDLE_IDS, handlePosition, type HandleId } from './handles';
import { formatValue, HANDLE_LABELS } from './labels';
import { outlinePath } from './svgPath';

import { GridLines, X_MAX, X_MIN, Y_MAX, Y_MIN } from './GridLines';

/**
 * 値の表示の位置（ハンドルからのずれ。SVG の座標で y は下向き）。隣のハンドルに重ならない向きに出す
 * （横線の太さは左、幅は下。実装レビュー P2）
 */
const LABEL_OFFSET: Record<HandleId, [number, number]> = {
  weight: [28, -24],
  hWeight: [-28, -24],
  width: [28, 56],
  slant: [28, -24],
};

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
  /** ドラッグ中のポインターの ID（2 本目のポインターは無視する。実装レビュー P1） */
  const dragging = useRef<number | null>(null);
  const [focused, setFocused] = useState<HandleId | null>(null);
  const { live, view } = state;

  // 画面を閉じたときは、予約した描き直しを取り消す
  // ドラッグ中に #preview へ移ったときは、ドラッグも取り消す（状態は App にあるので残ってしまう）
  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      if (dragging.current !== null) dispatch({ type: 'dragCancel' });
    },
    [dispatch],
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
    // 左ボタン（タッチ・ペンは 0）だけ。ドラッグ中の 2 本目は無視する
    if (e.button !== 0 || dragging.current !== null) return;
    const at = toFont(e);
    if (!at) return;
    e.preventDefault();
    svgRef.current?.setPointerCapture(e.pointerId);
    dragging.current = e.pointerId;
    latest.current = null;
    dispatch({ type: 'dragStart', handle: id, at });
  };

  const onMove = (e: ReactPointerEvent) => {
    if (dragging.current !== e.pointerId) return;
    latest.current = toFont(e);
    // pointermove が速く来ても、描き直しは 1 フレーム 1 回にまとめる
    if (frame.current === null)
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        if (latest.current) dispatch({ type: 'dragMove', at: latest.current });
      });
  };

  const onUp = (e: ReactPointerEvent) => {
    if (dragging.current !== e.pointerId) return;
    flush();
    dragging.current = null;
    dispatch({ type: 'dragEnd' });
    if (svgRef.current?.hasPointerCapture(e.pointerId))
      svgRef.current.releasePointerCapture(e.pointerId);
  };

  // 途中で切れたとき（pointercancel・lostpointercapture）は、ドラッグ前の値に戻す
  const onCancel = (e: ReactPointerEvent) => {
    if (dragging.current !== e.pointerId) return;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    dragging.current = null;
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
              <text
                className="handle-value"
                x={x + LABEL_OFFSET[active][0]}
                y={-y + LABEL_OFFSET[active][1]}
                textAnchor={LABEL_OFFSET[active][0] < 0 ? 'end' : 'start'}
              >
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
