// 組み立て：URL を読み、Game を起動し、画面と window.__bonsai をつなぐ。
import './style.css';
import { progress } from './core/clock';
import { Game, parseMode } from './ui/app';
import { createBrokenScreen } from './ui/broken-save';
import { createDebugView } from './ui/debug-view';
import { createHud } from './ui/hud';
import { createLayout } from './ui/layout';
import { showRenderFailed } from './ui/render-failed';
import { createSeedScreen, randomSeed } from './ui/seed-button';
import type { SaveData } from './core/types';
import type { Renderer } from './render/renderer';
import type { PickResult } from './render/picking';
import type { CameraState } from './render/camera-controls';

declare global {
  interface Window {
    __bonsai: {
      advance(hours: number): number | null;
      plant(seed?: number): boolean;
      readonly state: SaveData | null;
      pickAt(clientX: number, clientY: number): PickResult;
      readonly camera: CameraState | null;
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

createLayout(root);
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
  const now = Date.now();
  const steps = game.tick(now);
  render(steps > 0);
  const d = game.data;
  scene3d?.frame(d, d ? progress(now, d.lastTickAt, mode.speed) : 0);
  if (scene3d && debugView) debugView.setStats(scene3d.stats);
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
  // 確認用：当たり判定の結果（後の手入れの機能が使う関数を、E2E から確かめるため）
  pickAt(clientX: number, clientY: number) {
    if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;
    return scene3d ? scene3d.pickAt(clientX, clientY) : null;
  },
  // 確認用：いまのカメラ（読むだけ。E2E でカメラの操作を確かめるため。テストレビュー P0-1）
  get camera() {
    return scene3d ? scene3d.camera : null;
  },
};

// 描画は動的 import。Three.js が読めない・WebGL を作れないときも、成長と保存は止めない（要件 6章 #10）
let scene3d: Renderer | null = null;
import('./render/renderer')
  .then((m) => m.createRenderer(root))
  .then((r) => {
    scene3d = r;
  })
  .catch((e: unknown) => {
    console.warn('3D を読み込めませんでした', e);
    showRenderFailed(root);
  });

game.boot(Date.now());
render(true);
start();
