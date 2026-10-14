import { MAX_MESSAGES } from './chatRequest';
import type { ApiMessage } from './chatRequest';
import type { Message } from './types';

export const HISTORY_LIMIT = MAX_MESSAGES;

const SYNTHETIC_START: ApiMessage = { role: 'user', text: '（会話開始）' };

export function toApiMessages(messages: Message[], limit = HISTORY_LIMIT): ApiMessage[] {
  const merged: ApiMessage[] = [];
  for (const m of messages) {
    if (m.role === 'notice') continue;
    if (m.status !== 'sent' && m.status !== 'partial') continue;
    const last = merged[merged.length - 1];
    if (last && last.role === m.role) {
      last.text = `${last.text}\n${m.text}`;
    } else {
      merged.push({ role: m.role, text: m.text });
    }
  }
  if (merged.length === 0 || limit <= 0) return [];

  let result = merged.length > limit ? merged.slice(-limit) : merged;
  if (result[0]?.role === 'assistant') {
    result = result.length < limit ? [{ ...SYNTHETIC_START }, ...result] : result.slice(1);
  }
  return result;
}

export function mergeQueuedTexts(queued: Message[]): string {
  return queued
    .filter((m) => m.role === 'user')
    .map((m) => m.text)
    .join('\n');
}
