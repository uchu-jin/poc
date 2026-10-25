// 左上の表示（日数・段階・次のステップまで）と、画面の端の知らせ。文字はすべて textContent で入れる。
import { progress } from '../core/clock';
import { GROWTH_STEP_MS, STAGE_NAMES } from '../core/constants';
import { stageOf } from '../core/tree';
import type { Game } from './app';

export interface Hud {
  update(game: Game, now: number): void;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = className;
  return e;
}

function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function createHud(root: HTMLElement): Hud {
  const box = el('div', 'hud');
  box.id = 'hud';
  const day = el('div', 'hud-day');
  const stage = el('div', 'hud-stage');
  const next = el('div', 'hud-next');
  const speed = el('div', 'hud-speed');
  box.append(day, stage, next, speed);

  const notices = el('div', 'notices');
  notices.id = 'notices';
  notices.setAttribute('role', 'status');
  root.append(box, notices);

  let lastNotice = '';
  return {
    update(game, now) {
      const d = game.data;
      box.hidden = !d;
      if (d) {
        box.dataset.age = String(d.age);
        day.textContent = `${Math.floor(d.age / 24) + 1}日目`;
        stage.textContent = STAGE_NAMES[stageOf(d.age)];
        const step = GROWTH_STEP_MS / game.mode.speed;
        const remain = step * (1 - progress(now, d.lastTickAt, game.mode.speed));
        next.textContent = `次の成長まで ${formatRemaining(remain)}`;
      }
      speed.hidden = !game.mode.isSpeed;
      speed.textContent = game.mode.isSpeed ? `早送り ×${game.mode.speed}` : '';

      const lines = [game.mode.notice, game.warning].filter((x): x is string => !!x);
      const key = lines.join('\n');
      if (key !== lastNotice) {
        lastNotice = key;
        notices.replaceChildren(
          ...lines.map((t) => {
            const p = el('p', 'notice');
            p.textContent = t;
            return p;
          }),
        );
      }
    },
  };
}
