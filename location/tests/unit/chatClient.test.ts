import { describe, expect, it } from 'vitest';
import { errorMessage, PARTIAL_NOTICE, streamChat } from '../../src/chat/client';
import type { ChatRequest } from '../../src/domain/chatRequest';

const req: ChatRequest = {
  kind: 'chat',
  place: { lat: 35.681, lng: 139.767, source: 'gps' },
  pois: { status: 'empty', items: [] },
  weather: null,
  messages: [{ role: 'user', text: 'こんにちは' }],
};

const enc = new TextEncoder();
const sse = (o: object): string => `data: ${JSON.stringify(o)}\n\n`;

function streamOf(chunks: Uint8Array[], failAfter = false): Response {
  let i = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(c) {
      const next = chunks[i];
      if (next) {
        i++;
        c.enqueue(next);
      } else if (failAfter) c.error(new Error('boom'));
      else c.close();
    },
  });
  return new Response(body, { status: 200 });
}

function splitBytes(bytes: Uint8Array, size: number): Uint8Array[] {
  const out: Uint8Array[] = [];
  for (let i = 0; i < bytes.length; i += size) out.push(bytes.slice(i, i + size));
  return out;
}

const run = (res: Response | Error, deltas: string[] = []) =>
  streamChat(req, {
    fetch: (async () => {
      if (res instanceof Error) throw res;
      return res;
    }) as typeof fetch,
    onDelta: (c) => deltas.push(c),
  });

describe('streamChat', () => {
  it('done path with deltas split at every chunk size, including mid-multibyte', async () => {
    const full =
      sse({ type: 'delta', text: '東京' }) +
      sse({ type: 'delta', text: 'タワー🗼' }) +
      sse({ type: 'done', stop: 'end_turn' });
    for (const size of [1, 2, 3, 5, 7, 1000]) {
      const deltas: string[] = [];
      const out = await run(streamOf(splitBytes(enc.encode(full), size)), deltas);
      expect(out).toEqual({ kind: 'done', stop: 'end_turn', text: '東京タワー🗼' });
      expect(deltas.join('')).toBe('東京タワー🗼');
    }
  });

  it('sends POST JSON to the endpoint', async () => {
    let seen: { url: string; init?: RequestInit } | undefined;
    const f = (async (url: string, init?: RequestInit) => {
      seen = { url, init };
      return streamOf([enc.encode(sse({ type: 'done', stop: 'end_turn' }))]);
    }) as unknown as typeof fetch;
    await streamChat(req, { fetch: f, onDelta: () => undefined, endpoint: '/x' });
    expect(seen?.url).toBe('/x');
    expect(seen?.init?.method).toBe('POST');
    expect(new Headers(seen?.init?.headers).get('content-type')).toBe('application/json');
    expect(JSON.parse(String(seen?.init?.body))).toEqual(req);
  });

  it('refusal done passes stop', async () => {
    const out = await run(streamOf([enc.encode(sse({ type: 'done', stop: 'refusal' }))]));
    expect(out).toEqual({ kind: 'done', stop: 'refusal', text: '' });
  });

  it('ignores unknown events and malformed lines', async () => {
    const body =
      'data: {oops\n\n' +
      sse({ type: 'ping' }) +
      ': comment\n\n' +
      sse({ type: 'delta', text: 'a' }) +
      sse({ type: 'done', stop: 'end_turn' });
    expect(await run(streamOf([enc.encode(body)]))).toEqual({
      kind: 'done',
      stop: 'end_turn',
      text: 'a',
    });
  });

  it.each([
    [429, { code: 'rate_limited' }, 'rate_limited'],
    [403, { code: 'forbidden' }, 'forbidden'],
    [413, { code: 'payload_too_large' }, 'payload_too_large'],
    [400, { code: 'bad_request' }, 'bad_request'],
    [502, { code: 'upstream' }, 'upstream'],
    [500, { code: 'weird' }, 'upstream'],
  ])('HTTP %i -> %s', async (status, body, code) => {
    const out = await run(new Response(JSON.stringify(body), { status }));
    expect(out).toEqual({ kind: 'error', code });
  });

  it('non-JSON error body -> upstream', async () => {
    expect(await run(new Response('<html>', { status: 502 }))).toEqual({
      kind: 'error',
      code: 'upstream',
    });
  });

  it('fetch rejection -> network', async () => {
    expect(await run(new TypeError('Failed to fetch'))).toEqual({ kind: 'error', code: 'network' });
  });

  it('error event after text -> partial', async () => {
    const body = sse({ type: 'delta', text: 'abc' }) + sse({ type: 'error', code: 'upstream' });
    expect(await run(streamOf([enc.encode(body)]))).toEqual({ kind: 'partial', text: 'abc' });
  });

  it('error event before text -> error code', async () => {
    const body = sse({ type: 'error', code: 'rate_limited' });
    expect(await run(streamOf([enc.encode(body)]))).toEqual({
      kind: 'error',
      code: 'rate_limited',
    });
  });

  it('stream ends without done after text -> partial (E-11)', async () => {
    expect(await run(streamOf([enc.encode(sse({ type: 'delta', text: 'xy' }))]))).toEqual({
      kind: 'partial',
      text: 'xy',
    });
  });

  it('read throwing after text -> partial', async () => {
    expect(await run(streamOf([enc.encode(sse({ type: 'delta', text: 'xy' }))], true))).toEqual({
      kind: 'partial',
      text: 'xy',
    });
  });

  it('stream ends without any data -> network', async () => {
    expect(await run(streamOf([]))).toEqual({ kind: 'error', code: 'network' });
  });
});

describe('errorMessage', () => {
  it('maps codes to Japanese text', () => {
    expect(errorMessage('rate_limited')).toBe('リクエストが多いです。少し待ってから試してください');
    expect(errorMessage('refusal')).toBe('その話題にはお答えできません。別の質問をどうぞ');
    for (const c of [
      'upstream',
      'bad_request',
      'forbidden',
      'payload_too_large',
      'network',
    ] as const) {
      expect(errorMessage(c)).toBe('接続エラーが発生しました。もう一度送信してください');
    }
    expect(PARTIAL_NOTICE).toBe('途中で切れました');
  });
});
