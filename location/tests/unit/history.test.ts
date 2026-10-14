import { describe, expect, it } from 'vitest';
import { mergeQueuedTexts, toApiMessages } from '../../src/domain/history';
import type { Message, MessageRole, MessageStatus } from '../../src/domain/types';

let n = 0;
function msg(role: MessageRole, text: string, status: MessageStatus = 'sent'): Message {
  n += 1;
  return { id: `m${n}`, role, text, ts: '2026-10-13T00:00:00.000Z', status };
}
function alternating(count: number, first: MessageRole = 'user'): Message[] {
  return Array.from({ length: count }, (_, i) => {
    const isFirst = i % 2 === 0;
    const other = first === 'user' ? 'assistant' : 'user';
    return msg(isFirst ? first : other, `t${i}`);
  });
}

describe('history', () => {
  it('U-hist-1: 20 are all sent, 21 drops the oldest', () => {
    expect(toApiMessages(alternating(20))).toHaveLength(20);
    const r = toApiMessages(alternating(21));
    expect(r.length).toBeLessThanOrEqual(20);
    expect(r[0]?.role).toBe('user');
    expect(r[r.length - 1]?.text).toBe('t20');
  });

  it('U-hist-2: notice/queued/streaming/error are excluded', () => {
    const r = toApiMessages([
      msg('user', 'a'),
      msg('notice', 'n'),
      msg('assistant', 'b', 'streaming'),
      msg('user', 'c', 'queued'),
      msg('assistant', 'd', 'error'),
      msg('assistant', 'e', 'partial'),
    ]);
    expect(r).toEqual([
      { role: 'user', text: 'a' },
      { role: 'assistant', text: 'e' },
    ]);
  });

  it('U-hist-3: queued user messages merge into one text', () => {
    const q = [msg('user', 'a', 'queued'), msg('user', 'b', 'queued'), msg('user', 'c', 'queued')];
    expect(mergeQueuedTexts(q)).toBe('a\nb\nc');
  });

  it('U-hist-4: leading assistant gets a synthetic user turn', () => {
    const r = toApiMessages([msg('assistant', 'hi'), msg('user', 'yo')]);
    expect(r).toEqual([
      { role: 'user', text: '（会話開始）' },
      { role: 'assistant', text: 'hi' },
      { role: 'user', text: 'yo' },
    ]);
  });

  it('U-hist-5: consecutive same-role messages are merged', () => {
    const r = toApiMessages([msg('user', 'a'), msg('user', 'b'), msg('assistant', 'c')]);
    expect(r).toEqual([
      { role: 'user', text: 'a\nb' },
      { role: 'assistant', text: 'c' },
    ]);
  });

  it('trimming that leaves an assistant first drops it when full', () => {
    const r = toApiMessages(alternating(22, 'assistant'));
    expect(r.length).toBeLessThanOrEqual(20);
    expect(r[0]?.role).toBe('user');
  });

  it('property: output always alternates, starts with user, within limit', () => {
    let seed = 12345;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const roles: MessageRole[] = ['user', 'assistant', 'notice'];
    const statuses: MessageStatus[] = ['sent', 'sent', 'partial', 'queued', 'streaming', 'error'];
    for (let t = 0; t < 50; t++) {
      const len = Math.floor(rnd() * 60);
      const input = Array.from({ length: len }, (_, i) =>
        msg(roles[Math.floor(rnd() * 3)] ?? 'user', `x${i}`, statuses[Math.floor(rnd() * 6)]),
      );
      const out = toApiMessages(input);
      expect(out.length).toBeLessThanOrEqual(20);
      if (out.length > 0) expect(out[0]?.role).toBe('user');
      for (let i = 1; i < out.length; i++) expect(out[i]?.role).not.toBe(out[i - 1]?.role);
    }
  });
});
