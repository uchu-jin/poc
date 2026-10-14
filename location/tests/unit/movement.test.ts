import { describe, expect, it } from 'vitest';
import { haversineMeters } from '../../src/domain/geo';
import { acceptFix, checkMovement, shouldSwitchToGps } from '../../src/domain/movement';

const M_PER_DEG_LAT = (6371008.8 * Math.PI) / 180;
const anchor = { lat: 35, lng: 139 };
const north = (m: number) => ({ lat: anchor.lat + m / M_PER_DEG_LAT, lng: anchor.lng });

describe('movement', () => {
  it('U-mv-1: 299 m is not a move, 300 m is', () => {
    expect(haversineMeters(anchor, north(300.001))).toBeCloseTo(300.001, 6);
    expect(checkMovement(anchor, north(299)).moved).toBe(false);
    expect(checkMovement(anchor, north(300.001)).moved).toBe(true);
  });

  it('U-mv-2: accuracy 100 accepted, 100.1 rejected', () => {
    expect(acceptFix(100, true)).toBe(true);
    expect(acceptFix(100.1, true)).toBe(false);
    expect(acceptFix(undefined, true)).toBe(true);
  });

  it('U-mv-3: poor accuracy accepted when no location yet', () => {
    expect(acceptFix(500, false)).toBe(true);
  });

  it('U-mv-4: switch to GPS only from manual/restored with accepted fix', () => {
    expect(shouldSwitchToGps('manual', true)).toBe(true);
    expect(shouldSwitchToGps('restored', true)).toBe(true);
    expect(shouldSwitchToGps('gps', true)).toBe(false);
    expect(shouldSwitchToGps('manual', false)).toBe(false);
  });

  it('U-mv-5: alternating +-50 m jitter never moves', () => {
    for (let i = 0; i < 20; i++) {
      const p = north(i % 2 === 0 ? 50 : -50);
      expect(checkMovement(anchor, p).moved).toBe(false);
    }
  });

  it('U-mv-6: null anchor counts as moved', () => {
    expect(checkMovement(null, anchor).moved).toBe(true);
  });
});
