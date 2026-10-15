import { z } from 'zod';
import {
  CREDIT_HOSTS,
  IMAGE_HOSTS,
  MAX_IMAGE_WIDTH,
  type LatestImage,
  type SatelliteId,
} from '../../../shared/contract';

const TIMEOUT_MS = 8000;
const MAX_TEXT = 2048;

function isHttpsOn(hosts: readonly string[], raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && hosts.includes(url.hostname);
  } catch {
    return false;
  }
}

const text = z.string().min(1).max(MAX_TEXT);
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

const latestSchema = z.object({
  satelliteId: text,
  satelliteName: text,
  capturedAt: text.refine((v) => ISO_DATETIME.test(v) && !Number.isNaN(Date.parse(v))),
  images: z
    .array(
      z.object({
        url: text.refine((v) => isHttpsOn(IMAGE_HOSTS, v)),
        width: z.number().int().min(1).max(MAX_IMAGE_WIDTH),
      }),
    )
    .min(1)
    .max(5),
  credit: z.object({ text, url: z.string().max(MAX_TEXT) }),
}) satisfies z.ZodType<LatestImage>;

export interface ViewerImage extends Omit<LatestImage, 'credit'> {
  credit: { text: string; linkUrl: string | null };
}

export type LatestResult = { ok: true; image: ViewerImage } | { ok: false };

export interface LatestClientDeps {
  fetch: typeof fetch;
}

async function getJson(url: string, deps: LatestClientDeps): Promise<unknown> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error('timeout'));
    }, TIMEOUT_MS);
  });
  try {
    const request = deps
      .fetch(url, { cache: 'no-cache', signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`status ${res.status}`);
        return (await res.json()) as unknown;
      });
    return await Promise.race([request, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export async function fetchLatest(id: SatelliteId, deps: LatestClientDeps): Promise<LatestResult> {
  let body: unknown;
  try {
    body = await getJson(`/api/latest?satellite=${encodeURIComponent(id)}`, deps);
  } catch {
    return { ok: false };
  }
  const parsed = latestSchema.safeParse(body);
  if (!parsed.success || parsed.data.satelliteId !== id) return { ok: false };
  const { credit, ...rest } = parsed.data;
  return {
    ok: true,
    image: {
      ...rest,
      credit: {
        text: credit.text,
        linkUrl: isHttpsOn(CREDIT_HOSTS, credit.url) ? credit.url : null,
      },
    },
  };
}
