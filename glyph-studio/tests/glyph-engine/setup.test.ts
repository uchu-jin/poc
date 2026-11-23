import { describe, expect, it } from 'vitest';
import { unionPolys } from '../../src/features/glyph-engine/union';

// 実装順 1：Vite／Vitest で clipper-lib が読み込めることの確認
describe('clipper-lib の読み込み', () => {
  it('重なった正方形 2 つを合成すると、輪郭が 1 つで面積 17,500 になる', () => {
    const sq = (x: number, y: number, s: number): [number, number][] => [
      [x, y],
      [x + s, y],
      [x + s, y + s],
      [x, y + s],
    ];
    const r = unionPolys([[sq(0, 0, 100)], [sq(50, 50, 100)]]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.outline).toHaveLength(1);
    const ring = r.outline[0]!;
    const area =
      ring.reduce((a, p, i) => {
        const q = ring[(i + 1) % ring.length]!;
        return a + p[0] * q[1] - q[0] * p[1];
      }, 0) / 2;
    expect(Math.abs(area)).toBeCloseTo(17500, 6);
  });
});
