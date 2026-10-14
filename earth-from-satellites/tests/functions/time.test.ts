import { describe, expect, it } from 'vitest';
import { parseCiraTimestamp } from '../../functions/_lib/sources/ciraTimes';
import { toStarTimestamp } from '../../functions/_lib/sources/noaaStar';
import { SATELLITE_IDS, SATELLITES } from '../../functions/_lib/satellites';

describe('parseCiraTimestamp', () => {
  it('YYYYMMDDhhmmss の数値のとき UTC の日時になる', () => {
    expect(parseCiraTimestamp(20261014143020)?.toISOString()).toBe('2026-10-14T14:30:20.000Z');
  });

  it.each([
    ['13月', 20261314143020],
    ['0月', 20260014143020],
    ['2月30日', 20260230143020],
    ['25時', 20261014253020],
    ['60分', 20261014146020],
    ['13桁', 2026101414302],
    ['15桁', 202610141430200],
    ['小数', 20261014143020.5],
    ['負数', -20261014143020],
  ])('%s のとき null になる', (_label, value) => {
    expect(parseCiraTimestamp(value)).toBeNull();
  });
});

describe('toStarTimestamp', () => {
  it('UTC の日時を YYYYDDDHHMM（通算日）に変換し、秒は切り捨てる', () => {
    expect(toStarTimestamp(new Date('2026-10-14T14:30:20Z'))).toBe('20262871430');
  });

  it('1月1日は 001 になる', () => {
    expect(toStarTimestamp(new Date('2026-01-01T00:00:00Z'))).toBe('20260010000');
  });

  it('平年の12月31日は 365 になる', () => {
    expect(toStarTimestamp(new Date('2026-12-31T23:59:59Z'))).toBe('20263652359');
  });

  it('うるう年の12月31日は 366 になる', () => {
    expect(toStarTimestamp(new Date('2028-12-31T05:07:00Z'))).toBe('20283660507');
  });
});

describe('SATELLITES', () => {
  it('許可リストは3衛星だけで、それぞれ表示名とクレジットを持つ', () => {
    expect([...SATELLITE_IDS]).toEqual(['himawari9', 'goes-east', 'goes-west']);
    for (const id of SATELLITE_IDS) {
      expect(SATELLITES[id].name.length).toBeGreaterThan(0);
      expect(SATELLITES[id].credit.text.length).toBeGreaterThan(0);
      expect(SATELLITES[id].credit.url).toMatch(/^https:\/\//);
    }
  });
});
