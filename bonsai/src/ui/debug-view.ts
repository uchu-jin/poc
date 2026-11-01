// ?debug のときだけ右の端に小さく出す、正面（z 方向）から見た簡易な 2D の横姿と数値。成長の調整用。
// 3D の fps と pixel ratio もここに出す（SC-014 の計測用。ink-render のプラン）。
import type { SaveData } from '../core/types';

export interface DebugView {
  draw(data: SaveData | null): void;
  setStats(s: {
    fps: number;
    pixelRatio: number;
    drawCalls: number;
    rebuilds: number;
    geometries: number;
  }): void;
}

export function createDebugView(root: HTMLElement): DebugView {
  const wrap = document.createElement('div');
  wrap.className = 'debug';
  wrap.id = 'debug';
  const canvas = document.createElement('canvas');
  canvas.width = 560;
  canvas.height = 560;
  canvas.className = 'debug-canvas';
  const stats = document.createElement('pre');
  stats.className = 'debug-stats';
  const perf = document.createElement('pre');
  perf.className = 'debug-perf';
  perf.id = 'debug-perf';
  wrap.append(canvas, stats, perf);
  let lastPerf = 0;
  root.append(wrap);
  const ctx = canvas.getContext('2d');

  return {
    setStats(s) {
      const now = performance.now();
      if (now - lastPerf < 500) return;
      lastPerf = now;
      perf.textContent = `fps ${s.fps.toFixed(0)}\npixel ratio ${s.pixelRatio}\n描画の呼び出し ${s.drawCalls}\n作り直し ${s.rebuilds}\nGPU の形 ${s.geometries}`;
    },
    draw(data) {
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!data) {
        stats.textContent = '';
        return;
      }
      const byId = new Map(data.nodes.map((n) => [n.id, n]));
      let minX = -0.25;
      let maxX = 0.25;
      let maxY = 0.3;
      const tips = data.nodes.map((n) => {
        const t: [number, number] = [
          n.pos[0] + n.dir[0] * n.length,
          n.pos[1] + n.dir[1] * n.length,
        ];
        minX = Math.min(minX, t[0]);
        maxX = Math.max(maxX, t[0]);
        maxY = Math.max(maxY, t[1]);
        return t;
      });
      const margin = 24;
      const span = Math.max(maxX - minX, maxY) * 1.1;
      const scale = (canvas.width - margin * 2) / span;
      const cx = canvas.width / 2 - ((minX + maxX) / 2) * scale;
      const groundY = canvas.height - margin;
      const px = (x: number): number => cx + x * scale;
      const py = (y: number): number => groundY - y * scale;

      // 鉢の縁の目安（直径1）
      ctx.strokeStyle = '#8a8070';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px(-0.5), groundY);
      ctx.lineTo(px(0.5), groundY);
      ctx.stroke();

      ctx.strokeStyle = '#2a2622';
      ctx.lineCap = 'round';
      data.nodes.forEach((n, i) => {
        if (n.length <= 0) return;
        const t = tips[i]!;
        ctx.lineWidth = Math.max(0.6, n.radius * 2 * scale);
        ctx.beginPath();
        ctx.moveTo(px(n.pos[0]), py(n.pos[1]));
        ctx.lineTo(px(t[0]), py(t[1]));
        ctx.stroke();
      });

      ctx.fillStyle = 'rgba(70, 90, 60, 0.45)';
      let leaves = 0;
      data.nodes.forEach((n, i) => {
        const shown = n.leaves.filter((l) => l.regrowAt === null);
        leaves += n.leaves.length;
        if (shown.length === 0) return;
        const t = tips[i]!;
        const r = Math.max(1.5, 0.01 * scale * (shown[0]?.size ?? 1));
        ctx.beginPath();
        ctx.arc(px(t[0]), py(t[1]), r, 0, Math.PI * 2);
        ctx.fill();
      });

      const buds = data.nodes.filter((n) => n.bud).length;
      const root0 = byId.get(0);
      stats.textContent = [
        `seed ${data.seed}`,
        `age ${data.age}`,
        `節 ${data.nodes.length}`,
        `葉 ${leaves}`,
        `頂芽 ${buds}`,
        `水分 ${data.water}`,
        `根元の太さ ${root0 ? root0.radius.toFixed(4) : '-'}`,
      ].join('\n');
    },
  };
}
