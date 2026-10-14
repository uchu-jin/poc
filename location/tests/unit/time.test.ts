import { describe, expect, it } from 'vitest';
import { formatHHMM, nowIso } from '../../src/domain/time';

describe('time', () => {
  it('U-ctx-1: nowIso is ISO 8601 and roundtrips', () => {
    const s = nowIso(new Date('2026-10-13T01:02:03.456Z'));
    expect(s).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(new Date(s).toISOString()).toBe(s);
    expect(nowIso()).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('U-ctx-2: formatHHMM in a fixed time zone', () => {
    expect(formatHHMM('2026-10-13T00:05:00Z', 'Asia/Tokyo')).toBe('09:05');
    expect(formatHHMM('2026-10-13T14:59:00Z', 'Asia/Tokyo')).toBe('23:59');
  });
});
