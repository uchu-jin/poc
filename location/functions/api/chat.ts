import { MAX_BODY_BYTES } from '../../src/domain/chatRequest';
import {
  buildParams,
  classifyError,
  createSdkClient,
  resolveModel,
  ValidationError,
  type ChatModelClient,
} from '../_lib/anthropic';
import {
  checkOrigin,
  createMemoryRateLimiter,
  getClientIp,
  readBodyLimited,
  type RateLimiter,
} from '../_lib/guard';
import { chatRequestSchema } from '../_lib/schema';

export interface Env {
  ANTHROPIC_API_KEY: string;
  CLAUDE_MODEL?: string;
  ALLOWED_ORIGINS: string;
}

export interface ChatDeps {
  client: ChatModelClient;
  limiter: RateLimiter;
  now: () => Date;
  log: (entry: Record<string, unknown>) => void;
}

const enc = new TextEncoder();

function json(status: number, code: string): Response {
  return new Response(JSON.stringify({ code }), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export async function handleChat(request: Request, env: Env, deps: ChatDeps): Promise<Response> {
  const start = deps.now().getTime();
  const model = resolveModel(env.CLAUDE_MODEL);
  const ms = () => deps.now().getTime() - start;
  const fail = (status: number, code: string, extra: Record<string, unknown> = {}) => {
    deps.log({ status, ms: ms(), code, ...extra });
    return json(status, code);
  };

  if (!checkOrigin(request, env.ALLOWED_ORIGINS)) return fail(403, 'forbidden');
  if (!(await deps.limiter.limit(getClientIp(request)))) return fail(429, 'rate_limited');

  const body = await readBodyLimited(request, MAX_BODY_BYTES);
  if (!body.ok) return fail(413, 'payload_too_large');

  let params;
  try {
    const parsed = chatRequestSchema.safeParse(JSON.parse(body.text));
    if (!parsed.success) return fail(400, 'bad_request');
    params = buildParams(parsed.data, model, deps.now());
  } catch (e) {
    if (e instanceof SyntaxError || e instanceof ValidationError) return fail(400, 'bad_request');
    throw e;
  }

  const stream = deps.client.stream(params);
  const iterator = stream[Symbol.asyncIterator]();
  let first: IteratorResult<{ type: 'text'; text: string }>;
  let earlyFinal: Awaited<ReturnType<typeof stream.final>> | undefined;
  try {
    first = await iterator.next();
    if (first.done) earlyFinal = await stream.final();
  } catch (e) {
    const code = classifyError(e);
    return fail(code === 'rate_limited' ? 429 : 502, code, { model });
  }

  const send = (c: ReadableStreamDefaultController<Uint8Array>, data: object) =>
    c.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`));

  const sse = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        if (earlyFinal) {
          send(controller, { type: 'done', stop: earlyFinal.stopReason ?? 'end_turn' });
          deps.log({
            status: 200,
            ms: ms(),
            model,
            inputTokens: earlyFinal.inputTokens,
            outputTokens: earlyFinal.outputTokens,
          });
          return;
        }
        if (!first.done) send(controller, { type: 'delta', text: first.value.text });
        for (;;) {
          const r = await iterator.next();
          if (r.done) break;
          send(controller, { type: 'delta', text: r.value.text });
        }
        const fin = await stream.final();
        send(controller, { type: 'done', stop: fin.stopReason ?? 'end_turn' });
        deps.log({
          status: 200,
          ms: ms(),
          model,
          inputTokens: fin.inputTokens,
          outputTokens: fin.outputTokens,
        });
      } catch (e) {
        const code = classifyError(e);
        send(controller, { type: 'error', code });
        deps.log({ status: 200, ms: ms(), model, code });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(sse, {
    status: 200,
    headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store' },
  });
}

const limiter = createMemoryRateLimiter({ limit: 20, windowMs: 60_000, now: () => Date.now() });

export const onRequestPost = async (ctx: { request: Request; env: Env }): Promise<Response> =>
  handleChat(ctx.request, ctx.env, {
    client: createSdkClient(ctx.env.ANTHROPIC_API_KEY),
    limiter,
    now: () => new Date(),
    log: (e) => console.log(JSON.stringify(e)),
  });
