import { describe, expect, it } from 'vitest';
import { soilColor } from '../../src/render/soil-color';

const close = (a: number[], b: number[]) => {
  a.forEach((v, i) => expect(v).toBeCloseTo(b[i] as number, 10));
};

describe('soilColor', () => {
  it('水分 0 のとき薄い茶灰となる', () => {
    close(soilColor(0), [0.74, 0.69, 0.62]);
  });
  it('水分 100 のとき濃い茶灰となる', () => {
    close(soilColor(100), [0.35, 0.31, 0.27]);
  });
  it('水分 50 のとき中間となる', () => {
    close(soilColor(50), [0.545, 0.5, 0.445]);
  });
  it('水分 −1 のときは 0 と同じ、101 のときは 100 と同じとなる', () => {
    close(soilColor(-1), soilColor(0));
    close(soilColor(101), soilColor(100));
  });
});
