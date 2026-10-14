import { SourceError, type SourceDeps } from './types';

export const SOURCE_TIMEOUT_MS = 5000;
export const MAX_BODY_BYTES = 64 * 1024;

export async function withTimeout<T>(
  run: (signal: AbortSignal) => Promise<T>,
  ms: number = SOURCE_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

async function send(url: string, method: string, deps: SourceDeps): Promise<Response> {
  try {
    return await deps.fetch(url, { method, signal: deps.signal });
  } catch {
    throw new SourceError(deps.signal.aborted ? 'timeout' : 'upstream');
  }
}

async function readLimited(res: Response, deps: SourceDeps): Promise<string> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new SourceError('invalid', 'body too large');
      }
      chunks.push(value);
    }
  } catch (e) {
    if (e instanceof SourceError) throw e;
    throw new SourceError(deps.signal.aborted ? 'timeout' : 'upstream');
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

export async function fetchJson(url: string, deps: SourceDeps): Promise<unknown> {
  const res = await send(url, 'GET', deps);
  if (!res.ok) throw new SourceError('upstream', `status ${res.status}`);
  const text = await readLimited(res, deps);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new SourceError('invalid', 'not json');
  }
}

export async function headOk(url: string, deps: SourceDeps): Promise<boolean> {
  const res = await send(url, 'HEAD', deps);
  if (res.status === 404) return false;
  if (!res.ok) throw new SourceError('upstream', `status ${res.status}`);
  return true;
}
