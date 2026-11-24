import { useReducer } from 'react';
import { createEditorReducer, initEditorState } from './editorReducer';

const reducer = createEditorReducer();

/** A の変形画面の状態。App に置き、#preview と行き来しても消えないようにする */
export function useEditorState() {
  return useReducer(reducer, undefined, () => initEditorState());
}
