// ADR-0002 の検証用ページ：今の仕組みと案を、同じ種・同じ水やりで並べて描く。
import { createTree, step } from '../../../../src/core/tree';
import { createDebugView } from '../../../../src/ui/debug-view';
import type { SaveData } from '../../../../src/core/types';
import { stepProposal } from './tree-proposal';

const NOW = Date.UTC(2026, 9, 24);
const SEEDS = [9, 12345, 777];
const DAYS = [7, 30, 100];

/** 仮の水やり：12時間ごとに水分を70に戻す（水やりの機能ができるまでの代わり。両方に同じく効かせる） */
function grow(seed: number, hours: number, stepper: (d: SaveData) => void): SaveData {
  const t = createTree(seed, NOW);
  for (let h = 0; h < hours; h++) {
    if (h % 12 === 0) t.water = 70;
    stepper(t);
  }
  return t;
}

const root = document.getElementById('grid')!;
for (const [label, stepper] of [
  ['調整後（src/core/tree.ts）', step],
  ['調整前（ADR-0002 の試作。V-02 の値）', stepProposal],
] as const) {
  const h = document.createElement('h2');
  h.textContent = label;
  root.append(h);
  for (const seed of SEEDS) {
    const row = document.createElement('div');
    row.className = 'row';
    root.append(row);
    for (const day of DAYS) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      const cap = document.createElement('p');
      cap.textContent = `seed ${seed}・${day}日目`;
      cell.append(cap);
      row.append(cell);
      createDebugView(cell).draw(grow(seed, (day - 1) * 24, stepper));
    }
  }
}
