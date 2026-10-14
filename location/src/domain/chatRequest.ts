import type { Bearing8, PoiCategory } from './types';

export type ChatKind = 'greeting' | 'chat' | 'area_suggestion';

export type ApiMessage = { role: 'user' | 'assistant'; text: string };

export interface ChatRequest {
  kind: ChatKind;
  place: { lat: number; lng: number; label?: string; source: 'gps' | 'manual' };
  pois: {
    status: 'ok' | 'empty' | 'error' | 'pending';
    radius?: 1000 | 5000;
    items: { name: string; category: PoiCategory; distanceM: number; bearing: Bearing8 }[];
  };
  weather: { tempC: number; humidity: number; label: string } | null;
  moved?: { meters: number };
  messages: ApiMessage[];
}

export const MAX_MESSAGES = 20;
export const MAX_TEXT_CHARS = 1000;
export const MAX_POIS = 20;
export const MAX_BODY_BYTES = 32 * 1024;
