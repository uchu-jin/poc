import { describe, expect, it } from 'vitest';
import {
  ELEVATION_MAX_DEG,
  ELEVATION_MIN_DEG,
  FRONT_AZIMUTH,
  INITIAL_ELEVATION_DEG,
  ZOOM_MAX,
  ZOOM_MIN,
  clampDistance,
  clampElevation,
  clampTargetY,
  fitDistance,
  wrapAzimuth,
} from '../../src/render/camera-math';

describe('定数', () => {
  it('要件どおりの値となる', () => {
    expect(ELEVATION_MIN_DEG).toBe(-10);
    expect(ELEVATION_MAX_DEG).toBe(80);
    expect(ZOOM_MIN).toBe(0.3);
    expect(ZOOM_MAX).toBe(3);
    expect(FRONT_AZIMUTH).toBe(0);
    expect(INITIAL_ELEVATION_DEG).toBe(15);
  });
});

describe('clampElevation', () => {
  it('−10 と 80 のときはそのままとなる', () => {
    expect(clampElevation(-10)).toBe(-10);
    expect(clampElevation(80)).toBe(80);
  });
  it('−10.1 のときは −10 に、80.1 のときは 80 にそろう', () => {
    expect(clampElevation(-10.1)).toBe(-10);
    expect(clampElevation(80.1)).toBe(80);
  });
  it('範囲内のときはそのままとなる', () => {
    expect(clampElevation(15)).toBe(15);
  });
});

describe('clampDistance', () => {
  const fit = 10;
  it('収まる距離の 0.3 倍と 3 倍のときはそのままとなる', () => {
    expect(clampDistance(3, fit)).toBeCloseTo(3, 10);
    expect(clampDistance(30, fit)).toBeCloseTo(30, 10);
  });
  it('0.29 倍のときは 0.3 倍に、3.01 倍のときは 3 倍にそろう', () => {
    expect(clampDistance(2.9, fit)).toBeCloseTo(3, 10);
    expect(clampDistance(30.1, fit)).toBeCloseTo(30, 10);
  });
});

describe('clampTargetY', () => {
  it('0 と木の高さちょうどのときはそのままとなる', () => {
    expect(clampTargetY(0, 5)).toBe(0);
    expect(clampTargetY(5, 5)).toBe(5);
  });
  it('−0.01 のときは 0 に、木の高さ +0.01 のときは木の高さにそろう', () => {
    expect(clampTargetY(-0.01, 5)).toBe(0);
    expect(clampTargetY(5.01, 5)).toBe(5);
  });
  it('種（木の高さが 0）のときも範囲が反転せず 0 となる', () => {
    expect(clampTargetY(1, 0)).toBe(0);
    expect(clampTargetY(-1, 0)).toBe(0);
  });
  it('木の高さが負のときも 0 となる', () => {
    expect(clampTargetY(1, -2)).toBe(0);
  });
});

describe('wrapAzimuth', () => {
  it('0 以上 360 未満に回り込む', () => {
    expect(wrapAzimuth(0)).toBe(0);
    expect(wrapAzimuth(360)).toBe(0);
    expect(wrapAzimuth(370)).toBeCloseTo(10, 10);
    expect(wrapAzimuth(-10)).toBeCloseTo(350, 10);
    expect(wrapAzimuth(-720)).toBe(0);
  });
});

describe('fitDistance', () => {
  it('半径が大きいほど遠くなる', () => {
    expect(fitDistance(2, 40)).toBeGreaterThan(fitDistance(1, 40));
  });
  it('radius / sin(fov/2) に余白 1.15 をかけた値となる', () => {
    const expected = (2 / Math.sin((40 * Math.PI) / 360)) * 1.15;
    expect(fitDistance(2, 40)).toBeCloseTo(expected, 10);
  });
  it('種（半径 0）のときも 0 にならず、鉢の半径 0.3 ぶんとなる', () => {
    expect(fitDistance(0, 40)).toBeGreaterThan(0);
    expect(fitDistance(0, 40)).toBeCloseTo(fitDistance(0.3, 40), 10);
  });
});
