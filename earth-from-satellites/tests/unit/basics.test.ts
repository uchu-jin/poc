import { describe, expect, it } from 'vitest';
import { SATELLITE_IDS, SATELLITE_NAMES } from '../../shared/contract';
import { staleMinutes } from '../../src/features/viewer/freshness';
import { formatCapturedAt } from '../../src/features/viewer/format';
import { loadSatellite, saveSatellite } from '../../src/features/viewer/storage';

describe('contract', () => {
  it('衛星は3つで、すべてに表示名がある', () => {
    expect([...SATELLITE_IDS]).toEqual(['himawari9', 'goes-east', 'goes-west']);
    expect(SATELLITE_NAMES).toEqual({
      himawari9: 'ひまわり9号',
      'goes-east': 'GOES-East',
      'goes-west': 'GOES-West',
    });
  });
});

describe('staleMinutes', () => {
  const now = new Date('2026-10-14T16:00:00Z');
  it.each([
    ['59分59秒前', '2026-10-14T15:00:01Z', null],
    ['ちょうど60分前', '2026-10-14T15:00:00Z', 60],
    ['61分30秒前', '2026-10-14T14:58:30Z', 61],
    ['未来', '2026-10-14T16:05:00Z', null],
    ['読めない値', 'not-a-date', null],
  ])('%s のとき %s', (_label, iso, expected) => {
    expect(staleMinutes(iso, now)).toBe(expected);
  });
});

describe('formatCapturedAt', () => {
  it('Asia/Tokyo では JST を添えて表示する', () => {
    expect(formatCapturedAt('2026-10-14T15:30:00Z', 'Asia/Tokyo')).toBe('2026/10/15 0:30 JST');
  });
  it('UTC では UTC を添えて表示する', () => {
    expect(formatCapturedAt('2026-10-14T15:30:00Z', 'UTC')).toBe('2026/10/14 15:30 UTC');
  });
});

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      data.set(k, v);
    },
  };
}

const throwing = {
  getItem: (): string | null => {
    throw new Error('denied');
  },
  setItem: (): void => {
    throw new Error('quota');
  },
};

describe('storage', () => {
  it('保存した衛星を読み戻せる', () => {
    const s = memoryStorage();
    saveSatellite(() => s, 'goes-west');
    expect(loadSatellite(() => s)).toBe('goes-west');
  });

  it.each([
    ['未保存', () => memoryStorage()],
    ['許可外の値', () => memoryStorage({ 'earth-from-satellites:satellite': 'meteosat' })],
    ['getItem が例外を投げる', () => throwing],
    [
      'storage の取得自体が例外を投げる',
      () => {
        throw new Error('SecurityError');
      },
    ],
  ])('%s のとき himawari9 に戻る', (_label, getStorage) => {
    expect(loadSatellite(getStorage)).toBe('himawari9');
  });

  it('setItem が例外を投げても、例外が外に出ない', () => {
    expect(() => saveSatellite(() => throwing, 'goes-east')).not.toThrow();
  });
});
