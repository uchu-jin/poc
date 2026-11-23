import { describe, expect, it } from 'vitest';
import { signedArea } from '../../src/features/glyph-engine/geometry';
import { unionPolys, type MakeClipper } from '../../src/features/glyph-engine/union';
import type { Poly, Ring } from '../../src/features/glyph-engine/types';

const sq = (x: number, y: number, s: number): Ring => [
  [x, y],
  [x + s, y],
  [x + s, y + s],
  [x, y + s],
];
const totalArea = (rings: Ring[]) => rings.reduce((a, r) => a + signedArea(r), 0);

describe('unionPolys', () => {
  it('重なった正方形 2 つ → 1 つの輪郭', () => {
    const r = unionPolys([[sq(0, 0, 100)], [sq(50, 50, 100)]]);
    expect(r.ok && r.outline.length).toBe(1);
  });

  it('向きが逆の正方形が重なっても、向きを揃えるので打ち消し合わない', () => {
    const r = unionPolys([[sq(0, 0, 100)], [[...sq(50, 50, 100)].reverse()]]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.outline).toHaveLength(1);
    expect(totalArea(r.outline)).toBeCloseTo(17500);
  });

  it('外側と穴のある図形 → 穴が残る（外側は反時計回り、穴は時計回り）', () => {
    const r = unionPolys([[sq(0, 0, 300), sq(100, 100, 100)]]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.outline).toHaveLength(2);
    expect(r.outline.filter((ring) => signedArea(ring) > 0)).toHaveLength(1);
    expect(r.outline.filter((ring) => signedArea(ring) < 0)).toHaveLength(1);
    expect(totalArea(r.outline)).toBeCloseTo(80000);
  });

  it('渡した配列は書き換えない', () => {
    const polys: Poly[] = [[[...sq(50, 50, 100)].reverse()], [sq(0, 0, 100)]];
    const before = JSON.stringify(polys);
    unionPolys(polys);
    expect(JSON.stringify(polys)).toBe(before);
  });

  it('返す座標は 1000 単位で、小数第 1 位まで', () => {
    const r = unionPolys([[sq(0.04, 0.26, 100.31)]]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    for (const [x, y] of r.outline.flat()) {
      expect(Math.abs(x * 10 - Math.round(x * 10))).toBeLessThan(1e-9);
      expect(Math.abs(y * 10 - Math.round(y * 10))).toBeLessThan(1e-9);
    }
    expect(Math.max(...r.outline.flat().map((p) => p[0]))).toBeCloseTo(100.4, 6);
  });

  it('Execute が false を返すクリッパー → 合成に失敗', () => {
    const failing: MakeClipper = () => ({ AddPaths: () => true, Execute: () => false });
    expect(unionPolys([[sq(0, 0, 10)]], failing).ok).toBe(false);
  });

  it('例外を投げるクリッパー → 合成に失敗（例外は外に出さない）', () => {
    const throwing: MakeClipper = () => ({
      AddPaths: () => {
        throw new Error('RangeTest');
      },
      Execute: () => true,
    });
    const r = unionPolys([[sq(0, 0, 10)]], throwing);
    expect(r.ok).toBe(false);
  });
});
