import type { ChatRequest } from '../domain/chatRequest';

export type ChatErrorCode =
  'rate_limited' | 'upstream' | 'bad_request' | 'forbidden' | 'payload_too_large' | 'network';

export type ChatOutcome =
  | { kind: 'done'; stop: string; text: string }
  | { kind: 'partial'; text: string }
  | { kind: 'error'; code: ChatErrorCode };

export const PARTIAL_NOTICE = '途中で切れました';

const KNOWN_CODES: readonly ChatErrorCode[] = [
  'rate_limited',
  'upstream',
  'bad_request',
  'forbidden',
  'payload_too_large',
];

function toCode(value: unknown): ChatErrorCode {
  return typeof value === 'string' && (KNOWN_CODES as readonly string[]).includes(value)
    ? (value as ChatErrorCode)
    : 'upstream';
}

export function errorMessage(code: ChatErrorCode | 'refusal'): string {
  if (code === 'rate_limited') return 'リクエストが多いです。少し待ってから試してください';
  if (code === 'refusal') return 'その話題にはお答えできません。別の質問をどうぞ';
  return '接続エラーが発生しました。もう一度送信してください';
}

type SseEvent =
  | { type: 'delta'; text: string }
  | { type: 'done'; stop: string }
  | { type: 'error'; code: ChatErrorCode };

function parseEvent(block: string): SseEvent | null {
  for (const line of block.split('\n')) {
    const l = line.endsWith('\r') ? line.slice(0, -1) : line;
    if (!l.startsWith('data:')) continue;
    const payload = l.slice(5).trimStart();
    try {
      const obj: unknown = JSON.parse(payload);
      if (typeof obj !== 'object' || obj === null) return null;
      const r = obj as Record<string, unknown>;
      if (r.type === 'delta' && typeof r.text === 'string') return { type: 'delta', text: r.text };
      if (r.type === 'done')
        return { type: 'done', stop: typeof r.stop === 'string' ? r.stop : '' };
      if (r.type === 'error') return { type: 'error', code: toCode(r.code) };
    } catch {
      return null;
    }
  }
  return null;
}

export async function streamChat(
  req: ChatRequest,
  opts: {
    fetch: typeof fetch;
    onDelta: (chunk: string) => void;
    signal?: AbortSignal;
    endpoint?: string;
  },
): Promise<ChatOutcome> {
  let res: Response;
  try {
    res = await opts.fetch(opts.endpoint ?? '/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(req),
      signal: opts.signal,
    });
  } catch {
    return { kind: 'error', code: 'network' };
  }

  if (!res.ok) {
    try {
      const body: unknown = await res.json();
      const code =
        typeof body === 'object' && body !== null ? (body as { code?: unknown }).code : undefined;
      return { kind: 'error', code: toCode(code) };
    } catch {
      return { kind: 'error', code: 'upstream' };
    }
  }

  let text = '';
  const fallback = (): ChatOutcome =>
    text ? { kind: 'partial', text } : { kind: 'error', code: 'network' };

  if (!res.body) return fallback();
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  const handle = (block: string): ChatOutcome | null => {
    const ev = parseEvent(block);
    if (!ev) return null;
    if (ev.type === 'delta') {
      text += ev.text;
      opts.onDelta(ev.text);
      return null;
    }
    if (ev.type === 'done') return { kind: 'done', stop: ev.stop, text };
    return text ? { kind: 'partial', text } : { kind: 'error', code: ev.code };
  };

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (value) buf += decoder.decode(value, { stream: true });
      if (done) buf += decoder.decode();
      buf = buf.replace(/\r\n/g, '\n');
      let idx: number;
      while ((idx = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        const out = handle(block);
        if (out) {
          void reader.cancel().catch(() => undefined);
          return out;
        }
      }
      if (done) {
        if (buf.trim()) {
          const out = handle(buf);
          if (out) return out;
        }
        return fallback();
      }
    }
  } catch {
    return fallback();
  }
}
