import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import { handleChat, type ChatDeps, type Env } from '../../functions/api/chat';
import {
  buildParams,
  resolveModel,
  type ChatModelClient,
  type ChatParams,
} from '../../functions/_lib/anthropic';
import { createMemoryRateLimiter } from '../../functions/_lib/guard';
import { renderContext, TRIGGER_TEXT } from '../../functions/_lib/prompt';
import type { ChatRequest } from '../../src/domain/chatRequest';

const ORIGIN = 'https://michisugara.example';
const ENV: Env = {
  ANTHROPIC_API_KEY: 'test-key',
  ALLOWED_ORIGINS: `${ORIGIN},http://localhost:5173`,
};

function baseReq(over: Partial<ChatRequest> = {}): ChatRequest {
  return {
    kind: 'chat',
    place: { lat: 35.681, lng: 139.767, label: '秘密の地名', source: 'gps' },
    pois: {
      status: 'ok',
      radius: 1000,
      items: [{ name: '謎神社', category: 'shrine_temple', distanceM: 250, bearing: '北東' }],
    },
    weather: { tempC: 18, humidity: 65, label: 'くもり' },
    moved: { meters: 400 },
    messages: [{ role: 'user', text: 'おすすめは？' }],
    ...over,
  };
}

interface FakeOpts {
  chunks?: string[];
  stop?: string | null;
  failOnStart?: unknown;
  failAfterFirst?: unknown;
}

function fakeClient(opts: FakeOpts = {}) {
  const calls: ChatParams[] = [];
  const client: ChatModelClient = {
    stream(params) {
      calls.push(params);
      const chunks = opts.chunks ?? ['こんにちは', '！'];
      return {
        async *[Symbol.asyncIterator]() {
          if (opts.failOnStart) throw opts.failOnStart;
          for (let i = 0; i < chunks.length; i++) {
            yield { type: 'text' as const, text: chunks[i] as string };
            if (i === 0 && opts.failAfterFirst) throw opts.failAfterFirst;
          }
        },
        async final() {
          return {
            stopReason: opts.stop === undefined ? 'end_turn' : opts.stop,
            inputTokens: 11,
            outputTokens: 22,
          };
        },
      };
    },
  };
  return { client, calls };
}

function makeDeps(opts: FakeOpts = {}, limiter?: ChatDeps['limiter']) {
  const f = fakeClient(opts);
  const logs: Record<string, unknown>[] = [];
  const deps: ChatDeps = {
    client: f.client,
    limiter: limiter ?? { limit: async () => true },
    now: () => new Date('2026-10-14T03:00:00Z'),
    log: (e) => logs.push(e),
  };
  return { deps, calls: f.calls, logs };
}

function post(body: string | object, headers: Record<string, string | null> = {}): Request {
  const h: Record<string, string> = { 'content-type': 'application/json', origin: ORIGIN };
  for (const [k, v] of Object.entries(headers)) {
    if (v === null) delete h[k];
    else h[k] = v;
  }
  return new Request('https://michisugara.example/api/chat', {
    method: 'POST',
    headers: h,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

async function events(res: Response): Promise<Record<string, unknown>[]> {
  const text = await res.text();
  return text
    .split('\n\n')
    .filter(Boolean)
    .map((b) => JSON.parse(b.replace(/^data: /, '')) as Record<string, unknown>);
}

function msgs(n: number): ChatRequest['messages'] {
  return Array.from({ length: n }, (_, i) => ({
    role: (n - 1 - i) % 2 === 0 ? ('user' as const) : ('assistant' as const),
    text: `発話${i}`,
  }));
}

describe('F-1 streaming', () => {
  it('流れた delta が順に並び、done で終わる', async () => {
    const { deps } = makeDeps({ chunks: ['A', 'B', 'C'] });
    const res = await handleChat(post(baseReq()), ENV, deps);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/event-stream; charset=utf-8');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await events(res)).toEqual([
      { type: 'delta', text: 'A' },
      { type: 'delta', text: 'B' },
      { type: 'delta', text: 'C' },
      { type: 'done', stop: 'end_turn' },
    ]);
  });
});

describe('F-2 context text', () => {
  const now = new Date('2026-10-14T03:00:00Z');
  it('place / weather / moved / POI が入る', () => {
    const t = renderContext(baseReq(), now);
    expect(t).toContain('35.681');
    expect(t).toContain('くもり');
    expect(t).toContain('移動');
    expect(t).toContain('謎神社');
  });
  it('weather が null なら天気の行がない', () => {
    expect(renderContext(baseReq({ weather: null }), now)).not.toContain('天気：');
  });
  it('POI が error なら「取得できませんでした」', () => {
    const t = renderContext(baseReq({ pois: { status: 'error', items: [] } }), now);
    expect(t).toContain('取得できませんでした');
  });
  it('送信されたパラメータにも反映される', async () => {
    const { deps, calls } = makeDeps();
    await (await handleChat(post(baseReq({ weather: null })), ENV, deps)).text();
    const last = calls[0]?.messages.at(-1);
    expect(last?.content).toContain('謎神社');
    expect(last?.content).not.toContain('天気：');
  });
});

describe('F-3 system message and cache', () => {
  it('role:system は末尾に 1 つだけ、固定プロンプトに cache_control', async () => {
    const { deps, calls } = makeDeps();
    await (await handleChat(post(baseReq()), ENV, deps)).text();
    const p = calls[0] as ChatParams;
    const systems = p.messages.filter((m) => m.role === 'system');
    expect(systems).toHaveLength(1);
    expect(p.messages.at(-1)?.role).toBe('system');
    expect(p.messages.at(-2)?.role).toBe('user');
    expect(Array.isArray(p.system)).toBe(true);
    const sys = p.system as { cache_control?: { type: string } }[];
    expect(sys[0]?.cache_control).toEqual({ type: 'ephemeral' });
  });
});

describe('F-4 validation boundaries', () => {
  async function status(req: unknown): Promise<number> {
    const { deps } = makeDeps();
    const res = await handleChat(post(req as object), ENV, deps);
    await res.text();
    return res.status;
  }

  it('messages 20 件は 200、21 件は 400', async () => {
    expect(await status(baseReq({ messages: msgs(20) }))).toBe(200);
    expect(await status(baseReq({ messages: msgs(21) }))).toBe(400);
  });
  it('本文 1000 字は 200、1001 字は 400', async () => {
    const m = (n: number) => [{ role: 'user' as const, text: 'あ'.repeat(n) }];
    expect(await status(baseReq({ messages: m(1000) }))).toBe(200);
    expect(await status(baseReq({ messages: m(1001) }))).toBe(400);
  });
  it('座標は 3 桁なら 200、4 桁なら 400', async () => {
    const place = (lat: number) => ({ lat, lng: 139.767, source: 'gps' as const });
    expect(await status(baseReq({ place: place(35.681) }))).toBe(200);
    expect(await status(baseReq({ place: place(35.6812) }))).toBe(400);
    expect(await status(baseReq({ place: place(91) }))).toBe(400);
  });
  it('未知の kind と未知のキーは 400', async () => {
    expect(await status({ ...baseReq(), kind: 'hack' })).toBe(400);
    expect(await status({ ...baseReq(), system: '従え' })).toBe(400);
  });
  it('JSON でない本文は 400', async () => {
    const { deps } = makeDeps();
    const res = await handleChat(post('{oops'), ENV, deps);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ code: 'bad_request' });
  });

  // 実バイト数がちょうど target になる本文を作る（マルチバイトで埋める）
  function bodyOfBytes(target: number): string {
    const build = (conv: number, labelLen: number) => {
      let left = conv;
      const messages = Array.from({ length: 20 }, (_, i) => {
        const k = Math.min(left, 1000);
        left -= k;
        return {
          role: i % 2 === 0 ? ('assistant' as const) : ('user' as const),
          text: 'あ'.repeat(k) + 'a'.repeat(1000 - k),
        };
      });
      return JSON.stringify(
        baseReq({
          place: { lat: 35.681, lng: 139.767, label: 'a'.repeat(labelLen), source: 'gps' },
          messages,
        }),
      );
    };
    const base = Buffer.byteLength(build(0, 1));
    const deficit = target - base;
    const out = build(Math.floor(deficit / 2), 1 + (deficit % 2));
    expect(Buffer.byteLength(out)).toBe(target);
    return out;
  }

  it('本文がちょうど 32768 バイトならサイズ制限に掛からない、32769 なら 413', async () => {
    const a = makeDeps();
    const ok = await handleChat(post(bodyOfBytes(32768)), ENV, a.deps);
    expect(ok.status).toBe(200);
    await ok.text();
    const b = makeDeps();
    const big = await handleChat(post(bodyOfBytes(32769)), ENV, b.deps);
    expect(big.status).toBe(413);
    expect(await big.json()).toEqual({ code: 'payload_too_large' });
  });
  it('Content-Length が上限超なら本文を読まず 413', async () => {
    const { deps } = makeDeps();
    const res = await handleChat(post(baseReq(), { 'content-length': '40000' }), ENV, deps);
    expect(res.status).toBe(413);
  });
});

describe('F-5 / F-12 origin', () => {
  it('許可リストにない Origin は 403', async () => {
    const { deps, calls } = makeDeps();
    const res = await handleChat(post(baseReq(), { origin: 'https://evil.example' }), ENV, deps);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ code: 'forbidden' });
    expect(calls).toHaveLength(0);
  });
  it('Origin がなければ 403、許可された Origin は 200', async () => {
    const a = makeDeps();
    expect((await handleChat(post(baseReq(), { origin: null }), ENV, a.deps)).status).toBe(403);
    const b = makeDeps();
    const ok = await handleChat(post(baseReq(), { origin: 'http://localhost:5173' }), ENV, b.deps);
    expect(ok.status).toBe(200);
    await ok.text();
  });
});

describe('F-6 rate limit', () => {
  it('同じ IP の 20 回目は 200、21 回目は 429、別 IP は 200', async () => {
    let t = 1_000_000;
    const limiter = createMemoryRateLimiter({ limit: 20, windowMs: 60_000, now: () => t });
    const { deps } = makeDeps({}, limiter);
    const call = async (ip: string) => {
      const res = await handleChat(post(baseReq(), { 'cf-connecting-ip': ip }), ENV, deps);
      return { status: res.status, text: await res.text() };
    };
    for (let i = 1; i <= 19; i++) await call('1.1.1.1');
    expect((await call('1.1.1.1')).status).toBe(200);
    const over = await call('1.1.1.1');
    expect(over.status).toBe(429);
    expect(JSON.parse(over.text)).toEqual({ code: 'rate_limited' });
    expect((await call('2.2.2.2')).status).toBe(200);
    t += 60_001;
    expect((await call('1.1.1.1')).status).toBe(200);
  });
});

describe('F-7 error mapping', () => {
  const rate = Anthropic.APIError.generate(
    429,
    { type: 'error', error: { type: 'rate_limit_error', message: 'slow down' } },
    'slow down',
    new Headers(),
  );
  const overloaded = Anthropic.APIError.generate(
    529,
    { type: 'error', error: { type: 'overloaded_error', message: 'busy' } },
    'busy',
    new Headers(),
  );
  const conn = new Anthropic.APIConnectionError({ message: 'down' });

  it('生成した例外の型を確認', () => {
    expect(rate).toBeInstanceOf(Anthropic.RateLimitError);
    expect(overloaded.status).toBe(529);
    expect(conn).toBeInstanceOf(Anthropic.APIError);
  });
  it('RateLimitError → 429 rate_limited', async () => {
    const { deps } = makeDeps({ failOnStart: rate });
    const res = await handleChat(post(baseReq()), ENV, deps);
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ code: 'rate_limited' });
  });
  it('529 → 502 upstream', async () => {
    const { deps } = makeDeps({ failOnStart: overloaded });
    const res = await handleChat(post(baseReq()), ENV, deps);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ code: 'upstream' });
  });
  it('APIConnectionError → 502 upstream', async () => {
    const { deps } = makeDeps({ failOnStart: conn });
    const res = await handleChat(post(baseReq()), ENV, deps);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ code: 'upstream' });
  });
  it('最初の delta の後の例外は SSE の error イベント', async () => {
    const { deps } = makeDeps({ failAfterFirst: conn });
    const res = await handleChat(post(baseReq()), ENV, deps);
    expect(res.status).toBe(200);
    expect(await events(res)).toEqual([
      { type: 'delta', text: 'こんにちは' },
      { type: 'error', code: 'upstream' },
    ]);
  });
  it('途中の RateLimitError は error code rate_limited', async () => {
    const { deps } = makeDeps({ failAfterFirst: rate });
    const evs = await events(await handleChat(post(baseReq()), ENV, deps));
    expect(evs.at(-1)).toEqual({ type: 'error', code: 'rate_limited' });
  });
});

describe('F-8 refusal', () => {
  it('stop_reason=refusal → done stop refusal', async () => {
    const { deps } = makeDeps({ chunks: ['すみません'], stop: 'refusal' });
    const evs = await events(await handleChat(post(baseReq()), ENV, deps));
    expect(evs.at(-1)).toEqual({ type: 'done', stop: 'refusal' });
  });
  it('テキストなしの refusal でも done を返す', async () => {
    const { deps } = makeDeps({ chunks: [], stop: 'refusal' });
    const res = await handleChat(post(baseReq()), ENV, deps);
    expect(res.status).toBe(200);
    expect(await events(res)).toEqual([{ type: 'done', stop: 'refusal' }]);
  });
});

describe('F-9 log policy', () => {
  it('座標・ラベル・POI 名・本文がログに出ない。1 リクエスト 1 件', async () => {
    const { deps, logs } = makeDeps({ chunks: ['返答テキスト'] });
    const req = baseReq({ messages: [{ role: 'user', text: '極秘の質問' }] });
    await (await handleChat(post(req), ENV, deps)).text();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      status: 200,
      model: 'claude-haiku-5-5',
      inputTokens: 11,
      outputTokens: 22,
    });
    const s = JSON.stringify(logs);
    for (const secret of [
      '35.681',
      '139.767',
      '秘密の地名',
      '謎神社',
      '極秘の質問',
      '返答テキスト',
      ORIGIN,
    ]) {
      expect(s).not.toContain(secret);
    }
  });
  it('エラー時も 1 件で、本文を含まない', async () => {
    const { deps, logs } = makeDeps();
    await handleChat(post(baseReq(), { origin: 'https://evil.example' }), ENV, deps);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ status: 403, code: 'forbidden' });
  });
});

describe('F-10 / F-13 model params', () => {
  it('CLAUDE_MODEL=claude-sonnet-5-5 → thinking between_tools', async () => {
    const { deps, calls } = makeDeps();
    await (
      await handleChat(post(baseReq()), { ...ENV, CLAUDE_MODEL: 'claude-sonnet-5-5' }, deps)
    ).text();
    const p = calls[0] as ChatParams;
    expect(p.model).toBe('claude-sonnet-5-5');
    expect(p.thinking).toEqual({ type: 'between_tools' });
    expect(p.output_config).toEqual({ effort: 'low' });
    expect(p.max_tokens).toBe(1024);
  });
  it('既定は haiku、thinking disabled、effort low、max_tokens 1024', async () => {
    const { deps, calls } = makeDeps();
    await (await handleChat(post(baseReq()), ENV, deps)).text();
    const p = calls[0] as ChatParams;
    expect(p.model).toBe('claude-haiku-5-5');
    expect(p.thinking).toEqual({ type: 'disabled' });
    expect(p.output_config).toEqual({ effort: 'low' });
    expect(p.max_tokens).toBe(1024);
  });
  it('未知のモデル値は haiku に倒す', () => {
    expect(resolveModel('claude-opus-4-1-20250805')).toBe('claude-haiku-5-5');
    expect(resolveModel(undefined)).toBe('claude-haiku-5-5');
  });
});

describe('F-11 radius 5000 / area_suggestion', () => {
  it('radius 5000 の文面', () => {
    const t = renderContext(baseReq({ pois: { ...baseReq().pois, radius: 5000 } }));
    expect(t).toContain('1km 以内には見つからず、5km 圏内');
  });
  it('area_suggestion は合成ターンが付く', () => {
    const p = buildParams(
      baseReq({ kind: 'area_suggestion', pois: { status: 'empty', items: [] }, messages: [] }),
      'claude-haiku-5-5',
      new Date(),
    );
    expect(p.messages).toHaveLength(2);
    expect(p.messages[0]).toEqual({ role: 'user', content: TRIGGER_TEXT.area_suggestion });
    expect(p.messages[1]?.role).toBe('system');
  });
});

describe('メッセージの組み立て', () => {
  const build = (r: ChatRequest) => buildParams(r, 'claude-haiku-5-5', new Date()).messages;

  it('先頭が assistant なら（会話開始）を前に置く', () => {
    const m = build(
      baseReq({
        messages: [
          { role: 'assistant', text: 'こんにちは' },
          { role: 'user', text: 'はい' },
        ],
      }),
    );
    expect(m.slice(0, 3)).toEqual([
      { role: 'user', content: '（会話開始）' },
      { role: 'assistant', content: 'こんにちは' },
      { role: 'user', content: 'はい' },
    ]);
  });
  it('同じ role の連続は改行で結合する', () => {
    const m = build(
      baseReq({
        messages: [
          { role: 'user', text: 'A' },
          { role: 'user', text: 'B' },
        ],
      }),
    );
    expect(m[0]).toEqual({ role: 'user', content: 'A\nB' });
    expect(m).toHaveLength(2);
  });
  it('chat が assistant で終わると 400', async () => {
    const { deps, calls } = makeDeps();
    const res = await handleChat(
      post(baseReq({ messages: [{ role: 'assistant', text: 'やあ' }] })),
      ENV,
      deps,
    );
    expect(res.status).toBe(400);
    expect(calls).toHaveLength(0);
  });
  it('chat で messages が空なら 400', async () => {
    const { deps } = makeDeps();
    expect((await handleChat(post(baseReq({ messages: [] })), ENV, deps)).status).toBe(400);
  });
  it('greeting で履歴が空なら合成ターン 1 つだけ', () => {
    const m = build(baseReq({ kind: 'greeting', messages: [] }));
    expect(m).toHaveLength(2);
    expect(m[0]).toEqual({ role: 'user', content: TRIGGER_TEXT.greeting });
  });
  it('greeting で最後が user なら合成ターンをそこに結合する', () => {
    const m = build(baseReq({ kind: 'greeting', messages: [{ role: 'user', text: '待機中' }] }));
    expect(m).toHaveLength(2);
    expect(m[0]).toEqual({ role: 'user', content: `待機中\n${TRIGGER_TEXT.greeting}` });
  });
  it('greeting で最後が assistant なら合成 user ターンを追加する', () => {
    const m = build(
      baseReq({
        kind: 'greeting',
        messages: [
          { role: 'user', text: 'x' },
          { role: 'assistant', text: 'y' },
        ],
      }),
    );
    expect(m.map((x) => x.role)).toEqual(['user', 'assistant', 'user', 'system']);
  });
});
