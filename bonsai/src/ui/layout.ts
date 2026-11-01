// 画面の配置（FR-034）：後の機能で中身を入れる枠を、場所だけ用意する（作者の回答 2026-10-25）。
// 左上の日数などは hud.ts が持つ。文字は textContent で入れる。

export interface Layout {
  score: HTMLElement;
  water: HTMLElement;
  toolbar: HTMLElement;
  settings: HTMLElement;
}

function frame(root: HTMLElement, id: string, label: string): HTMLElement {
  const el = document.createElement('div');
  el.id = id;
  el.className = `frame ${id}`;
  const note = document.createElement('span');
  note.className = 'frame-note';
  note.textContent = label;
  el.append(note);
  root.append(el);
  return el;
}

export function createLayout(root: HTMLElement): Layout {
  return {
    score: frame(root, 'frame-score', '樹形の評価'),
    water: frame(root, 'frame-water', '水分'),
    toolbar: frame(root, 'frame-toolbar', '道具'),
    settings: frame(root, 'frame-settings', '設定'),
  };
}
