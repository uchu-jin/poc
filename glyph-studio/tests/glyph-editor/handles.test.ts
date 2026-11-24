import { describe, expect, it } from 'vitest';
import {
  dragTo,
  handlePosition,
  keyStep,
  shiftXOf,
  type HandleId,
} from '../../src/features/glyph-editor/handles';
import { buildGlyph } from '../../src/features/glyph-engine/buildGlyph';
import { crossSection, distToSegment } from '../../src/features/glyph-engine/geometry';
import { DEFAULT_PARAMS } from '../../src/features/glyph-engine/params';
import type { Params, Vec } from '../../src/features/glyph-engine/types';

const P = (p: Partial<Params> = {}): Params => ({ ...DEFAULT_PARAMS, ...p });
const pos = (id: HandleId, p: Params) => handlePosition(id, p, shiftXOf(p));
const deg = (r: number) => (r * 180) / Math.PI;

describe('dragTo（ドラッグ量 → パラメータ。FR-002・FR-003・FR-005）', () => {
  // 太さは「カーソルの位置にハンドルが来る太さ」を逆算する。ハンドルを「太さ X のときの位置」へ動かす
  const dragWeightTo = (to: number, from: Params, grid = 25, snap = true) => {
    const target = pos('weight', { ...from, weight: to });
    const start = pos('weight', from);
    return dragTo('weight', from, [target[0] - start[0], 0], grid, snap);
  };

  it('太さ：「115 の位置」→ 125、「112 の位置」→ 100、左へ大きく → 20、右へ大きく → 150', () => {
    expect(dragWeightTo(115, P()).weight).toBe(125);
    expect(dragWeightTo(112, P()).weight).toBe(100);
    expect(dragTo('weight', P(), [-500, 0], 25, true).weight).toBe(20);
    expect(dragTo('weight', P(), [500, 0], 25, true).weight).toBe(150);
  });

  it('太さ（吸着 OFF）：ハンドルを +3 → 93（太さ 1 あたり約 0.928 動く）', () => {
    expect(dragTo('weight', P(), [3, 0], 25, false).weight).toBe(93);
  });

  it('太さ（グリッド 10）：「103 の位置」→ 100', () => {
    expect(dragWeightTo(103, P(), 10).weight).toBe(100);
  });

  it.each([
    ['flat', 0, 1, 90],
    ['round', 0, 1, 90],
    ['slab', 0, 1, 90],
    ['flat', 15, 1, 90],
    ['flat', 0, 0.8, 90],
    ['flat', 0, 1.25, 90],
    ['flat', 0, 1, 20],
    ['flat', 0, 1, 150],
  ] as const)(
    '太さの逆算の精度（端 %s・傾き %s・幅 %s・横線の太さ %s）：決めた値でのハンドルがカーソルと 1 以内',
    (terminal, slant, width, hWeight) => {
      const from = P({ terminal, slant, width, hWeight });
      for (const dx of [-30, 7, 25]) {
        const start = pos('weight', from);
        const next = dragTo('weight', from, [dx, 0], 25, false);
        if (next.weight === 20 || next.weight === 150) continue;
        // 1 刻みに丸めるので、太さ 0.5 ぶん（ハンドル約 0.47）までずれる
        expect(Math.abs(pos('weight', next)[0] - (start[0] + dx))).toBeLessThan(1);
      }
    },
  );

  it('横線の太さ：上 +5 → 100、下 −100 → 20、上 +100 → 150、吸着 OFF で上 +1.5 → 93', () => {
    expect(dragTo('hWeight', P(), [0, 5], 25, true).hWeight).toBe(100);
    expect(dragTo('hWeight', P(), [0, -100], 25, true).hWeight).toBe(20);
    expect(dragTo('hWeight', P(), [0, 100], 25, true).hWeight).toBe(150);
    expect(dragTo('hWeight', P(), [0, 1.5], 25, false).hWeight).toBe(93);
  });

  it('幅：右 +25 → 1.05、+12 → 1.0、左 −200 → 0.8、右 +500 → 1.25、1.1 から +25 → 1.15、吸着 OFF で +3 → 1.006', () => {
    expect(dragTo('width', P(), [25, 0], 25, true).width).toBeCloseTo(1.05, 10);
    expect(dragTo('width', P(), [12, 0], 25, true).width).toBe(1);
    expect(dragTo('width', P(), [-200, 0], 25, true).width).toBe(0.8);
    expect(dragTo('width', P(), [500, 0], 25, true).width).toBe(1.25);
    expect(dragTo('width', P({ width: 1.1 }), [25, 0], 25, true).width).toBeCloseTo(1.15, 10);
    expect(dragTo('width', P(), [3, 0], 25, false).width).toBeCloseTo(1.006, 10);
  });

  it('傾き：右 +25 → atan(25/610)、左 −50 → 0、右 +1000 → 15、15° から −25、吸着 OFF で +1', () => {
    expect(dragTo('slant', P(), [25, 0], 25, true).slant).toBeCloseTo(deg(Math.atan(25 / 610)), 10);
    expect(dragTo('slant', P(), [-50, 0], 25, true).slant).toBe(0);
    expect(dragTo('slant', P(), [1000, 0], 25, true).slant).toBe(15);
    const from15 = 610 * Math.tan((15 * Math.PI) / 180);
    expect(dragTo('slant', P({ slant: 15 }), [-25, 0], 25, true).slant).toBeCloseTo(
      deg(Math.atan((from15 - 25) / 610)),
      10,
    );
    expect(dragTo('slant', P(), [1, 0], 25, false).slant).toBeCloseTo(deg(Math.atan(1 / 610)), 10);
  });

  it('動かさない → 変わらない。他のパラメータは変わらない', () => {
    const from = P({ xHeight: 450, terminal: 'slab', join: 'round', weight: 100 });
    for (const id of ['weight', 'hWeight', 'width', 'slant'] as const) {
      expect(dragTo(id, from, [0, 0], 25, true)).toEqual(from);
    }
    const moved = dragTo('width', from, [50, 50], 25, true);
    expect(moved).toMatchObject({
      xHeight: 450,
      terminal: 'slab',
      join: 'round',
      weight: 100,
      hWeight: 90,
      slant: 0,
    });
  });
});

describe('handlePosition（ハンドルの位置）', () => {
  const distToOutline = (pt: Vec, outline: Vec[][]) =>
    Math.min(
      ...outline.flatMap((r) => r.map((a, i) => distToSegment(pt, a, r[(i + 1) % r.length]!))),
    );
  const inside = (pt: Vec, outline: Vec[][]) =>
    crossSection(outline, pt[1]).some(([a, b]) => pt[0] >= a - 0.5 && pt[0] <= b + 0.5);

  it.each([
    [{}],
    [{ weight: 150, hWeight: 150 }],
    [{ weight: 20, hWeight: 20 }],
    [{ width: 0.8 }],
    [{ width: 1.25 }],
    [{ slant: 15 }],
    [{ weight: 40, hWeight: 150, slant: 15, width: 0.8, terminal: 'round' }],
  ] as Partial<Params>[][])(
    '%j：太さ・横線の太さは輪郭の辺の上、幅・傾きは骨格の点（輪郭の内側）',
    (over) => {
      const p = P(over);
      const r = buildGlyph('A', p);
      if (!r.ok) throw new Error(r.message);
      expect(distToOutline(handlePosition('weight', p, r.shiftX), r.outline)).toBeLessThan(2);
      expect(distToOutline(handlePosition('hWeight', p, r.shiftX), r.outline)).toBeLessThan(2);
      // 足は y ＝ 0 ちょうどで輪郭の下の辺の上にあるので、少し上で内側か確かめる
      const foot = handlePosition('width', p, r.shiftX);
      expect(inside([foot[0], foot[1] + 1], r.outline)).toBe(true);
      expect(inside(handlePosition('slant', p, r.shiftX), r.outline)).toBe(true);
    },
  );
});

describe('keyStep（キーボード。FR-023。グリッド 25）', () => {
  it('太さ：右・上 +25、左・下 −25、上限・下限で止まる', () => {
    expect(keyStep('weight', 'ArrowRight', P(), 25, true).weight).toBe(115);
    expect(keyStep('weight', 'ArrowUp', P(), 25, true).weight).toBe(115);
    expect(keyStep('weight', 'ArrowLeft', P(), 25, true).weight).toBe(65);
    expect(keyStep('weight', 'ArrowDown', P(), 25, true).weight).toBe(65);
    expect(keyStep('weight', 'ArrowRight', P({ weight: 150 }), 25, true).weight).toBe(150);
    expect(keyStep('weight', 'ArrowLeft', P({ weight: 20 }), 25, true).weight).toBe(20);
  });
  it('横線の太さ：上 +25、下 −25', () => {
    expect(keyStep('hWeight', 'ArrowUp', P(), 25, true).hWeight).toBe(115);
    expect(keyStep('hWeight', 'ArrowDown', P(), 25, true).hWeight).toBe(65);
  });
  it('幅：右 +0.05、上限 1.25 で右 → 1.25', () => {
    expect(keyStep('width', 'ArrowRight', P(), 25, true).width).toBeCloseTo(1.05, 10);
    expect(keyStep('width', 'ArrowRight', P({ width: 1.25 }), 25, true).width).toBe(1.25);
  });
  it('傾き：右でずれが +25、上限 15° で右 → 15°', () => {
    expect(keyStep('slant', 'ArrowRight', P(), 25, true).slant).toBeCloseTo(
      deg(Math.atan(25 / 610)),
      10,
    );
    expect(keyStep('slant', 'ArrowRight', P({ slant: 15 }), 25, true).slant).toBe(15);
  });
  it('吸着 OFF で 1 刻み、対象外のキーは変わらない', () => {
    expect(keyStep('weight', 'ArrowRight', P(), 25, false).weight).toBe(91);
    expect(keyStep('weight', 'Enter', P(), 25, true)).toEqual(P());
  });
});
