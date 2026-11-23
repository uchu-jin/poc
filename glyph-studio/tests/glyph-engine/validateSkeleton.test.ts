import { describe, expect, it } from 'vitest';
import { validateSkeleton } from '../../src/features/glyph-engine/validateSkeleton';

const pt = (id: string, x: number, y: number) => ({ id, x, y });
const lineStroke = (prefix: string, pts: [number, number][]) => ({
  start: pt(`${prefix}0`, pts[0]![0], pts[0]![1]),
  segments: pts.slice(1).map(([x, y], i) => ({ kind: 'line', to: pt(`${prefix}${i + 1}`, x, y) })),
});
const ok = (v: unknown) => expect(validateSkeleton(v).ok).toBe(true);
const ng = (v: unknown) => expect(validateSkeleton(v).ok).toBe(false);

describe('validateSkeleton', () => {
  it('正常な骨格・下限ちょうど（線 1 本・点 2 つ）は合格', () => {
    ok({
      strokes: [
        lineStroke('a', [
          [0, 0],
          [0, 700],
        ]),
      ],
    });
    ok({
      strokes: [
        {
          start: pt('p0', 0, 0),
          segments: [
            { kind: 'cubic', c1: pt('p1', 0, 100), c2: pt('p2', 100, 200), to: pt('p3', 200, 200) },
          ],
        },
      ],
    });
  });

  it.each([
    [NaN, 0],
    [Infinity, 0],
    [0, -Infinity],
    [0.5, 0],
    [-251, 0],
    [1001, 0],
    [0, -251],
    [0, 1001],
  ])('座標 (%s, %s) は不正', (x, y) => {
    ng({
      strokes: [
        lineStroke('a', [
          [x, y],
          [0, 700],
        ]),
      ],
    });
  });

  it('座標の境界ちょうど（−250・1000）は合格', () => {
    ok({
      strokes: [
        lineStroke('a', [
          [-250, -250],
          [1000, 1000],
        ]),
      ],
    });
  });

  it('点の ID の重複は不正（線をまたいでも）', () => {
    ng({
      strokes: [
        lineStroke('a', [
          [0, 0],
          [0, 700],
        ]),
        lineStroke('a', [
          [100, 0],
          [100, 700],
        ]),
      ],
    });
  });

  it('未知の区間の種類は不正', () => {
    ng({ strokes: [{ start: pt('a', 0, 0), segments: [{ kind: 'arc', to: pt('b', 1, 1) }] }] });
  });

  it('線が 0 本・点が 1 つの線は不正', () => {
    ng({ strokes: [] });
    ng({ strokes: [{ start: pt('a', 0, 0), segments: [] }] });
  });

  it('線 16 本・点 64 個ちょうどは合格、線 17 本・点 65 個は不正', () => {
    const strokes = (n: number) =>
      Array.from({ length: n }, (_, i) =>
        lineStroke(`s${i}p`, [
          [i, 0],
          [i, 700],
        ]),
      );
    ok({ strokes: strokes(16) });
    ng({ strokes: strokes(17) });
    const many = (n: number) =>
      lineStroke(
        'p',
        Array.from({ length: n }, (_, i) => [i, i % 2 ? 100 : 0] as [number, number]),
      );
    ok({ strokes: [many(64)] });
    ng({ strokes: [many(65)] });
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['線の配列がない', {}],
    ['線の配列が配列でない', { strokes: 'x' }],
    ['区間が配列でない', { strokes: [{ start: pt('a', 0, 0), segments: 'x' }] }],
    ['始点がない', { strokes: [{ segments: [{ kind: 'line', to: pt('b', 0, 1) }] }] }],
    [
      '点に x がない',
      { strokes: [{ start: { id: 'a', y: 0 }, segments: [{ kind: 'line', to: pt('b', 0, 1) }] }] },
    ],
    [
      'x が文字列',
      {
        strokes: [
          { start: { id: 'a', x: '10', y: 0 }, segments: [{ kind: 'line', to: pt('b', 0, 1) }] },
        ],
      },
    ],
    [
      'ID が文字列でない',
      {
        strokes: [
          { start: { id: 1, x: 0, y: 0 }, segments: [{ kind: 'line', to: pt('b', 0, 1) }] },
        ],
      },
    ],
  ])('形が崩れたデータ（%s）は不正で、例外を投げない', (_, v) => {
    expect(() => validateSkeleton(v)).not.toThrow();
    ng(v);
  });
});
