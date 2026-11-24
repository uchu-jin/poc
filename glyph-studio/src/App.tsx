import { useEffect, useState } from 'react';
import EditorPage from './features/glyph-editor/EditorPage';
import { useEditorState } from './features/glyph-editor/useEditorState';
import PreviewPage from './features/glyph-preview/PreviewPage';
import { routeOf } from './route';

const currentHash = () => window.location.hash;

export default function App() {
  // パラメータと履歴は App に置き、#preview と行き来しても消えないようにする
  const [state, dispatch] = useEditorState();
  const [hash, setHash] = useState(currentHash);
  useEffect(() => {
    const onChange = () => setHash(currentHash());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  if (routeOf(hash) === 'preview')
    return (
      <>
        <nav className="back">
          <a href="#">← A の変形画面に戻る</a>
        </nav>
        <PreviewPage />
      </>
    );
  return <EditorPage state={state} dispatch={dispatch} />;
}
