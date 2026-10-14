export function checkOrigin(request: Request, allowedOriginsCsv: string | undefined): boolean {
  const origin = request.headers.get('Origin');
  if (!origin) return false;
  const allowed = (allowedOriginsCsv ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return allowed.includes(origin);
}

export interface RateLimiter {
  /** true = 許可 */
  limit(key: string): Promise<boolean>;
}

export function createMemoryRateLimiter(opts: {
  limit: number;
  windowMs: number;
  now: () => number;
}): RateLimiter {
  const buckets = new Map<string, { count: number; resetAt: number }>();
  return {
    async limit(key) {
      const t = opts.now();
      if (buckets.size > 5000) {
        for (const [k, b] of buckets) if (b.resetAt <= t) buckets.delete(k);
      }
      const b = buckets.get(key);
      if (!b || b.resetAt <= t) {
        buckets.set(key, { count: 1, resetAt: t + opts.windowMs });
        return true;
      }
      b.count += 1;
      return b.count <= opts.limit;
    },
  };
}

export function getClientIp(request: Request): string {
  return request.headers.get('CF-Connecting-IP') ?? 'unknown';
}

export async function readBodyLimited(
  request: Request,
  maxBytes: number,
): Promise<{ ok: true; text: string } | { ok: false }> {
  const declared = request.headers.get('Content-Length');
  if (declared !== null && Number(declared) > maxBytes) return { ok: false };
  if (!request.body) return { ok: true, text: '' };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return { ok: false };
    }
    chunks.push(value);
  }
  const all = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    all.set(c, offset);
    offset += c.byteLength;
  }
  return { ok: true, text: new TextDecoder().decode(all) };
}
