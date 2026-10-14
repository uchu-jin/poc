export type LocationSource = 'gps' | 'manual' | 'restored';
export interface LatLng {
  lat: number;
  lng: number;
}
export interface AppLocation extends LatLng {
  accuracy?: number;
  source: LocationSource;
  label?: string;
  at: string;
}
export type MessageRole = 'user' | 'assistant' | 'notice';
export type MessageStatus = 'sent' | 'queued' | 'streaming' | 'partial' | 'error';
export interface Message {
  id: string;
  role: MessageRole;
  text: string;
  ts: string;
  status: MessageStatus;
  badge?: 'ai-suggestion';
}
export type PoiCategory = 'shrine_temple' | 'museum' | 'viewpoint' | 'restaurant';
export type Bearing8 = '北' | '北東' | '東' | '南東' | '南' | '南西' | '西' | '北西';
export interface Poi extends LatLng {
  id: string;
  name: string;
  category: PoiCategory;
  distanceM: number;
  bearing: Bearing8;
}
export interface Weather {
  tempC: number;
  humidity: number;
  code: number;
  label: string;
  fetchedAt: string;
}
export type GpsStatus = 'acquiring' | 'ok' | 'denied' | 'unavailable' | 'timeout' | 'manual';
export type PoiState =
  | { kind: 'loading' }
  | { kind: 'ok'; radius: 1000 | 5000; pois: Poi[] }
  | { kind: 'empty' }
  | { kind: 'error' }
  | { kind: 'timeout-pending' };
