// A の変形画面：左に A のキャンバスと見本、右に設定欄、上に取り消し・やり直し・既定値に戻す
import { useEffect, type Dispatch } from 'react';
import type { EditorAction, EditorState } from './editorReducer';
import GlyphCanvas from './GlyphCanvas';
import { canRedo, canUndo } from './history';
import { shouldHandleShortcut } from './inputs';
import SampleLine from './SampleLine';
import SettingsPanel from './SettingsPanel';

export default function EditorPage({
  state,
  dispatch,
}: {
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
}) {
  // ⌘Z・⌘⇧Z（Ctrl も）。入力欄にフォーカスがあるときは受けない（FR-021）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = document.activeElement?.tagName ?? 'body';
      const action = shouldHandleShortcut(e, tag);
      if (!action) return;
      e.preventDefault();
      dispatch({ type: action });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dispatch]);

  return (
    <main className="editor">
      <header className="editor__header">
        <h1>glyph-studio</h1>
        <div className="toolbar">
          <button
            type="button"
            disabled={!canUndo(state.history)}
            onClick={() => dispatch({ type: 'undo' })}
          >
            取り消し
          </button>
          <button
            type="button"
            disabled={!canRedo(state.history)}
            onClick={() => dispatch({ type: 'redo' })}
          >
            やり直し
          </button>
          <button type="button" onClick={() => dispatch({ type: 'reset' })}>
            既定値に戻す
          </button>
          <a href="#preview">確認用の一覧</a>
        </div>
      </header>
      <section className="editor__main">
        <div className="editor__stage">
          <GlyphCanvas state={state} dispatch={dispatch} />
          <SampleLine params={state.live} />
          <p className="hint">
            丸いハンドルをドラッグして A を変形します。Tab で選んで矢印キーでも動かせます。⌘Z
            で取り消し、⌘⇧Z でやり直し。
          </p>
        </div>
        <SettingsPanel state={state} dispatch={dispatch} />
      </section>
    </main>
  );
}
