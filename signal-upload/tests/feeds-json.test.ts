import { describe, expect, it } from 'vitest';
import feeds from '../public/api/feeds.json';
import { SOURCES } from '../src/data/sources';

describe('public/api/feeds.json', () => {
  it('src/data/sources.ts と同じ id と URL を持つ', () => {
    expect(feeds).toEqual(Object.fromEntries(SOURCES.map((s) => [s.id, s.url])));
  });
});
