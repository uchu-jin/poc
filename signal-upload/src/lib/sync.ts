import type { Source, Studio } from '../types';
import { sanitizeCustom, sanitizeStudios } from './sources';

// public/api/sync.php に保存する内容。localStorage の4つのキーと同じ形
export type SyncData = {
  customSources: Source[];
  removedSources: string[];
  customStudios: Studio[];
  removedStudios: string[];
};

const strings = (raw: unknown) =>
  Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string') : [];

export function sanitizeSyncData(raw: unknown): SyncData {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  return {
    customSources: sanitizeCustom(r.customSources),
    removedSources: strings(r.removedSources),
    customStudios: sanitizeStudios(r.customStudios),
    removedStudios: strings(r.removedStudios),
  };
}

// 読み間違えやすい I・O・0・1 を除いた32文字で16桁(sync.php と同じ)
export function normalizeCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return /^[A-HJ-NP-Z2-9]{16}$/.test(code) ? code : null;
}

export const formatCode = (code: string) => code.match(/.{1,4}/g)?.join('-') ?? code;
