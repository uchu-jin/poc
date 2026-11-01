// 組み立て：URL を読み、Game を起動し、画面と window.__bonsai をつなぐ。
import './style.css';
import { Game, parseMode } from './ui/app';
import { createBrokenScreen } from './ui/broken-save';
import { createDebugView } from './ui/debug-view';
import { createHud } from './ui/hud';
import { createSeedScreen, randomSeed } from './ui/seed-button';
import type { SaveData } from './core/types';

declare global {
  interface Window {
    __bonsai: {
      advance(hours: number): number | null;
      plant(seed?: number): boolean;
      readonly state: SaveData | null;
    };
  }
}

const mode = parseMode(location.search);
const debug = new URLSearchParams(location.search).has('debug');
const game = new Game(mode, {
  storage: () => window.localStorage,
  randomSeed,
  confirm: (msg) => window.confirm(msg),
});

const root = document.createElement('div');
root.className = 'app';
document.body.append(root);

const hud = createHud(root);
const seedScreen = createSeedScreen(root, () => {
  game.plant(Date.now());
  render(true);
});
const brokenScreen = createBrokenScreen(root, () => {
  game.backupAndRestart(Date.now());
  render(true);
});
const debugView = debug ? createDebugView(root) : null;

function render(treeChanged: boolean): void {
  const now = Date.now();
  seedScreen.show(game.status === 'needSeed');
  brokenScreen.show(game.broken ? { ...game.broken, key: mode.key } : null);
  hud.update(game, now);
  if (treeChanged) debugView?.draw(game.data);
}

let frame = 0;
function loop(): void {
  const steps = game.tick(Date.now());
  render(steps > 0);
  frame = requestAnimationFrame(loop);
}

function start(): void {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(loop);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    cancelAnimationFrame(frame);
    game.persist();
  } else {
    game.onVisible(Date.now());
    render(true);
    start();
  }
});
window.addEventListener('pagehide', () => game.persist());

// 確認用（FR-014）。公開しないため dist にも残す
window.__bonsai = {
  advance(hours: number) {
    const n = game.advanceHours(hours);
    if (n === null) console.warn('__bonsai.advance: 0 以上 10000 以下の数を渡してください');
    else render(true);
    return n;
  },
  plant(seed?: number) {
    const ok = game.replant(Date.now(), seed);
    if (!ok)
      console.warn('__bonsai.plant: ?speed の木だけに、0〜4294967295 の整数の seed で使えます');
    else render(true);
    return ok;
  },
  get state() {
    return game.data ? structuredClone(game.data) : null;
  },
};

game.boot(Date.now());
render(true);
start();
