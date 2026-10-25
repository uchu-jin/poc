// 保存データが読めないときの画面（FR-044）。元の文字列はそのまま文字として見せる（textContent・value）。
import { SAVE_KEY } from '../core/constants';

export interface BrokenScreen {
  show(info: { reason: string; raw: string; key: string } | null): void;
}

export function createBrokenScreen(root: HTMLElement, onRestart: () => void): BrokenScreen {
  const box = document.createElement('section');
  box.className = 'broken-screen';
  box.id = 'broken-screen';
  box.hidden = true;

  const title = document.createElement('h1');
  title.textContent = '保存データを読み込めませんでした';
  const reason = document.createElement('p');
  reason.className = 'broken-reason';
  const keyLine = document.createElement('p');
  keyLine.className = 'broken-key';
  const note = document.createElement('p');
  note.textContent =
    '保存データには何も書いていません。下の欄の文字列は、いまの保存データそのものです（コピーできます）。';
  const raw = document.createElement('textarea');
  raw.className = 'broken-raw';
  raw.readOnly = true;
  raw.rows = 6;
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = '退避して新しく始める';
  button.addEventListener('click', onRestart);

  box.append(title, reason, keyLine, note, raw, button);
  root.append(box);

  return {
    show(info) {
      box.hidden = !info;
      if (!info) return;
      reason.textContent = `理由：${info.reason}`;
      keyLine.textContent = `キー：${info.key || SAVE_KEY}`;
      raw.value = info.raw;
    },
  };
}
