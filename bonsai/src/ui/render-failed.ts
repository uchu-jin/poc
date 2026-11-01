// Three.js が読めない・WebGL を作れないときの知らせ（要件 6章 #10：和紙の画面に一言）。成長と保存は止めない。

export const MSG_RENDER_FAILED =
  '3D の部品を読み込めませんでした。ネットにつないで開き直してください';

export function showRenderFailed(root: HTMLElement): void {
  if (root.querySelector('#render-failed')) return;
  const p = document.createElement('p');
  p.id = 'render-failed';
  p.className = 'render-failed';
  p.textContent = MSG_RENDER_FAILED;
  root.append(p);
}
