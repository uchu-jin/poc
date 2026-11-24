// 横の設定欄：グリッド・吸着・x ハイト・端の形・角の丸み・値の表示（FR-002・FR-004）
import { useState, type Dispatch } from 'react';
import { PARAM_LIMITS } from '../glyph-engine/params';
import type { Join, Terminal } from '../glyph-engine/types';
import type { EditorAction, EditorState, GridSize } from './editorReducer';
import { formatValue, HANDLE_LABELS } from './GlyphCanvas';
import { HANDLE_IDS } from './handles';

const GRIDS: GridSize[] = [10, 25, 50];
const TERMINALS: [Terminal, string][] = [
  ['flat', '平ら'],
  ['round', '丸'],
  ['slab', 'スラブ'],
];
const JOINS: [Join, string][] = [
  ['miter', '尖り'],
  ['round', '丸'],
];

export default function SettingsPanel({
  state,
  dispatch,
}: {
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
}) {
  const { live } = state;
  const [xText, setXText] = useState(String(live.xHeight));
  const [editing, setEditing] = useState(false);
  const [xMin, xMax] = PARAM_LIMITS.xHeight;

  const commitText = () => {
    setEditing(false);
    dispatch({ type: 'xHeightText', text: xText });
  };
  const commitSlider = () => {
    if (live.xHeight !== state.history.present.xHeight) dispatch({ type: 'commit' });
  };

  return (
    <aside className="settings" aria-label="設定">
      <fieldset>
        <legend>グリッド</legend>
        <div className="segmented">
          {GRIDS.map((g) => (
            <label key={g}>
              <input
                type="radio"
                name="grid"
                checked={state.grid === g}
                onChange={() => dispatch({ type: 'grid', grid: g })}
              />
              {g}
            </label>
          ))}
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={state.snap}
            onChange={(e) => dispatch({ type: 'snap', snap: e.target.checked })}
          />
          グリッドに吸着
        </label>
      </fieldset>

      <fieldset>
        <legend>x ハイト</legend>
        <input
          type="range"
          min={xMin}
          max={xMax}
          step={1}
          value={live.xHeight}
          aria-label="x ハイト"
          onChange={(e) =>
            dispatch({ type: 'set', patch: { xHeight: Number(e.target.value) }, commit: false })
          }
          onPointerUp={commitSlider}
          onKeyUp={commitSlider}
        />
        <input
          type="text"
          inputMode="numeric"
          className="number"
          aria-label="x ハイトの数値"
          // 編集していないときは今の値（取り消し・スライダー・既定値に戻すに追従）、編集中は打った文字
          value={editing ? xText : String(live.xHeight)}
          onFocus={() => {
            setXText(String(live.xHeight));
            setEditing(true);
          }}
          onChange={(e) => setXText(e.target.value)}
          onBlur={commitText}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
        />
      </fieldset>

      <fieldset>
        <legend>端の形</legend>
        <div className="segmented">
          {TERMINALS.map(([t, label]) => (
            <button
              key={t}
              type="button"
              aria-pressed={live.terminal === t}
              onClick={() => dispatch({ type: 'set', patch: { terminal: t }, commit: true })}
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>角の丸み</legend>
        <div className="segmented">
          {JOINS.map(([j, label]) => (
            <button
              key={j}
              type="button"
              aria-pressed={live.join === j}
              onClick={() => dispatch({ type: 'set', patch: { join: j }, commit: true })}
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>今の値</legend>
        <dl className="values">
          {HANDLE_IDS.map((id) => (
            <div key={id}>
              <dt>{HANDLE_LABELS[id]}</dt>
              <dd>{formatValue(id, live[id])}</dd>
            </div>
          ))}
          <div>
            <dt>x ハイト</dt>
            <dd>{live.xHeight}</dd>
          </div>
          <div>
            <dt>端の形</dt>
            <dd>{TERMINALS.find(([t]) => t === live.terminal)?.[1]}</dd>
          </div>
          <div>
            <dt>角の丸み</dt>
            <dd>{JOINS.find(([j]) => j === live.join)?.[1]}</dd>
          </div>
        </dl>
      </fieldset>
    </aside>
  );
}
