import Anthropic from '@anthropic-ai/sdk';
import type { ApiMessage, ChatRequest } from '../../src/domain/chatRequest';
import { renderContext, SYSTEM_PROMPT, TRIGGER_TEXT } from './prompt';

export const MODEL_HAIKU = 'claude-haiku-5-5';
export const MODEL_SONNET = 'claude-sonnet-5-5';

export class ValidationError extends Error {}

export function resolveModel(envValue: string | undefined): string {
  return envValue === MODEL_SONNET ? MODEL_SONNET : MODEL_HAIKU;
}

export type ChatParams = Anthropic.Messages.MessageStreamParams;

function assembleTurns(req: ChatRequest): ApiMessage[] {
  const turns: ApiMessage[] = [];
  const push = (m: ApiMessage) => {
    const last = turns[turns.length - 1];
    if (last && last.role === m.role) last.text = `${last.text}\n${m.text}`;
    else turns.push({ ...m });
  };
  for (const m of req.messages) push(m);
  if (turns[0]?.role === 'assistant') turns.unshift({ role: 'user', text: '（会話開始）' });

  if (req.kind === 'chat') {
    const last = turns[turns.length - 1];
    if (!last || last.role !== 'user') {
      throw new ValidationError('chat requires the last turn to be a user turn');
    }
  } else {
    push({ role: 'user', text: TRIGGER_TEXT[req.kind] });
  }
  return turns;
}

export function buildParams(req: ChatRequest, model: string, now: Date): ChatParams {
  const turns = assembleTurns(req);
  const messages: Anthropic.Messages.MessageParam[] = [
    ...turns.map((t) => ({ role: t.role, content: t.text })),
    { role: 'system', content: renderContext(req, now) },
  ];
  return {
    model,
    max_tokens: 1024,
    thinking: model === MODEL_SONNET ? { type: 'between_tools' } : { type: 'disabled' },
    output_config: { effort: 'low' },
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages,
  };
}

export function classifyError(e: unknown): 'rate_limited' | 'upstream' {
  if (e instanceof Anthropic.RateLimitError) return 'rate_limited';
  if (e instanceof Anthropic.APIConnectionError) return 'upstream';
  return 'upstream';
}

export interface ModelFinal {
  stopReason: string | null;
  inputTokens: number;
  outputTokens: number;
}

export interface ChatModelStream extends AsyncIterable<{ type: 'text'; text: string }> {
  final(): Promise<ModelFinal>;
}

export interface ChatModelClient {
  stream(params: ChatParams): ChatModelStream;
}

export function createSdkClient(apiKey: string): ChatModelClient {
  const client = new Anthropic({ apiKey, maxRetries: 1, timeout: 20_000 });
  return {
    stream(params) {
      const s = client.messages.stream(params);
      return {
        async *[Symbol.asyncIterator]() {
          for await (const ev of s) {
            if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') {
              yield { type: 'text' as const, text: ev.delta.text };
            }
          }
        },
        async final() {
          const m = await s.finalMessage();
          return {
            stopReason: m.stop_reason,
            inputTokens: m.usage.input_tokens,
            outputTokens: m.usage.output_tokens,
          };
        },
      };
    },
  };
}
