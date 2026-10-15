import { SourceError, type SourceDeps } from './types';

export const SOURCE_TIMEOUT_MS = 5000;
export const MAX_BODY_BYTES = 16 * 1024;

export async function withTimeout<T>(
  run: (signal: AbortSignal) => Promise<T>,
  ms: number = SOURCE_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  // abort を無視する処理（本文の読み込みが止まった場合など）でも、時間で打ち切る
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new SourceError('timeout'));
    }, ms);
  });
  try {
    return await Promise.race([run(controller.signal), timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function send(url: string, method: string, deps: SourceDeps): Promise<Response> {
  try {
    // リダイレクト先は許可リストの外かもしれないので追わない
    return await deps.fetch(url, { method, signal: deps.signal, redirect: 'manual' });
  } catch {
    throw new SourceError(deps.signal.aborted ? 'timeout' : 'upstream');
  }
}

async function discard(res: Response): Promise<void> {
  try {
    await res.body?.cancel();
  } catch {
    // 読み捨てに失敗しても結果は変わらない
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
  if (!res.ok) {
    await discard(res);
    throw new SourceError('upstream', `status ${res.status}`);
  }
  const text = await readLimited(res, deps);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new SourceError('invalid', 'not json');
  }
}

export async function headOk(url: string, deps: SourceDeps): Promise<boolean> {
  const res = await send(url, 'HEAD', deps);
  await discard(res);
  if (res.ok) return true;
  // 未公開のファイルに 403 を返す CDN もあるので、404・403・3xx は「まだ無い」とみなす
  if (res.status === 404 || res.status === 403 || (res.status >= 300 && res.status < 400)) {
    return false;
  }
  throw new SourceError('upstream', `status ${res.status}`);
}
