import { describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS, PARAM_LIMITS, clampParams } from '../../src/features/glyph-engine/params';

describe('clampParams（FR-005）', () => {
  it('範囲内・下限ちょうど・上限ちょうどはそのまま', () => {
    expect(clampParams({ weight: 120 }).weight).toBe(120);
    expect(clampParams({ weight: 20 }).weight).toBe(20);
    expect(clampParams({ weight: 200 }).weight).toBe(200);
  });

  it('下限の 1 つ下・上限の 1 つ上は丸める', () => {
    expect(clampParams({ weight: 19 }).weight).toBe(20);
    expect(clampParams({ weight: 201 }).weight).toBe(200);
    expect(clampParams({ hWeight: 19 }).hWeight).toBe(20);
    expect(clampParams({ hWeight: 201 }).hWeight).toBe(200);
    expect(clampParams({ slant: -1 }).slant).toBe(0);
    expect(clampParams({ slant: 16 }).slant).toBe(15);
    expect(clampParams({ width: 0.79 }).width).toBe(0.8);
    expect(clampParams({ width: 1.26 }).width).toBe(1.25);
    expect(clampParams({ xHeight: 419 }).xHeight).toBe(420);
    expect(clampParams({ xHeight: 581 }).xHeight).toBe(580);
  });

  it.each(['weight', 'hWeight', 'width', 'slant', 'xHeight'] as const)(
    '%s：NaN → 既定値、Infinity → 上限、−Infinity → 下限',
    (key) => {
      const [min, max] = PARAM_LIMITS[key];
      expect(clampParams({ [key]: NaN })[key]).toBe(DEFAULT_PARAMS[key]);
      expect(clampParams({ [key]: Infinity })[key]).toBe(max);
      expect(clampParams({ [key]: -Infinity })[key]).toBe(min);
    },
  );

  it('端の形・角の丸みに未知の値 → 既定値（平ら・尖り）', () => {
    const p = clampParams({ terminal: 'wavy' as never, join: 'bevel' as never });
    expect(p.terminal).toBe('flat');
    expect(p.join).toBe('miter');
  });

  it('逆コントラスト（横線の太さ > 太さ）を許す', () => {
    const p = clampParams({ weight: 40, hWeight: 160 });
    expect(p).toMatchObject({ weight: 40, hWeight: 160 });
  });

  it('指定しなかった値は既定値', () => {
    expect(clampParams({})).toEqual(DEFAULT_PARAMS);
  });
});
