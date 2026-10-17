// 画面とサーバーの両方が参照する取り決め。純粋な定数・型と、副作用のない検証・組み立ての関数だけを置く

export const SATELLITE_IDS = ['himawari9', 'goes-east', 'goes-west', 'epic'] as const;
export type SatelliteId = (typeof SATELLITE_IDS)[number];

export const DEFAULT_SATELLITE: SatelliteId = 'himawari9';

/** 撮影した衛星（カメラ）の名前。画像の説明やクレジットの近くに出す */
export const SATELLITE_NAMES: Record<SatelliteId, string> = {
  himawari9: 'ひまわり9号',
  'goes-east': 'GOES-East',
  'goes-west': 'GOES-West',
  epic: 'DSCOVR（EPIC）',
};

/** 選択ボタンの文言 */
export const SATELLITE_LABELS: Record<SatelliteId, string> = {
  himawari9: 'ひまわり9号',
  'goes-east': 'GOES-East',
  'goes-west': 'GOES-West',
  epic: '宇宙から',
};

/** 画像の配信元のホスト。サーバーの URL の組み立てと、許可リストの両方がここを参照する */
export const HOSTS = {
  cira: 'slider.cira.colostate.edu',
  star: 'cdn.star.nesdis.noaa.gov',
  epic: 'epic.gsfc.nasa.gov',
} as const;
const CIRA = HOSTS.cira;
const STAR = HOSTS.star;
const EPIC = HOSTS.epic;

/** 衛星ごとに、画像を取ってよいホスト */
export const IMAGE_HOSTS_BY_SATELLITE: Record<SatelliteId, readonly string[]> = {
  himawari9: [CIRA],
  'goes-east': [STAR],
  'goes-west': [STAR],
  epic: [EPIC],
};
export const CREDIT_HOSTS: readonly string[] = [
  'satlib.cira.colostate.edu',
  'www.star.nesdis.noaa.gov',
  EPIC,
];
export const MAX_IMAGE_WIDTH = 2000;

export interface Geometry {
  /** 衛星直下の経度（東経を正） */
  subLon: number;
  /** 全球画像の走査角の範囲（±rad） */
  scanExtent: number;
  /** 走査の軸（GOES は x、ひまわりなど CGMS の定義は y） */
  sweep: 'x' | 'y';
}

export type GeostationaryId = Exclude<SatelliteId, 'epic'>;

// 機体が交代したら、ここと functions/_lib/satellites.ts を直す
// 【要確認】ひまわりの scanExtent は、CIRA の切り出し範囲を手動スモークで確かめる
export const GEOSTATIONARY: Record<GeostationaryId, Geometry> = {
  himawari9: { subLon: 140.7, scanExtent: 0.1518, sweep: 'y' },
  'goes-east': { subLon: -75.2, scanExtent: 0.151844, sweep: 'x' },
  'goes-west': { subLon: -137.2, scanExtent: 0.151844, sweep: 'x' },
};

export const MIN_TILE_SIZE = 600;
export const MAX_TILE_SIZE = 700;
export const MAX_ZOOM = 4;
/** CIRA SLIDER の全球の拡大タイルの基点。完全一致で確かめる（末尾の14桁は撮影時刻） */
export const TILE_BASE_URL =
  /^https:\/\/slider\.cira\.colostate\.edu\/data\/imagery\/\d{4}\/\d{2}\/\d{2}\/[a-z0-9-]+---full_disk\/geocolor\/(\d{14})\/$/;

export interface ImageVariant {
  url: string;
  width: number;
}

export interface Credit {
  text: string;
  url: string;
}

export interface Tiles {
  baseUrl: string;
  tileSize: number;
  maxZoom: number;
}

export interface LatestImage {
  satelliteId: string;
  satelliteName: string;
  capturedAt: string;
  images: ImageVariant[];
  credit: Credit;
  tiles?: Tiles;
}

export function isSatelliteId(value: unknown): value is SatelliteId {
  return typeof value === 'string' && (SATELLITE_IDS as readonly string[]).includes(value);
}

/** https で、ホストが許可リストのどれかである URL か */
export function isHttpsUrlOn(hosts: readonly string[], raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && hosts.includes(url.hostname);
  } catch {
    return false;
  }
}

export function isAllowedImageUrl(satelliteId: string, raw: string): boolean {
  return isSatelliteId(satelliteId) && isHttpsUrlOn(IMAGE_HOSTS_BY_SATELLITE[satelliteId], raw);
}

/** CIRA SLIDER の撮影時刻の書き方（UTC の YYYYMMDDhhmmss） */
export function ciraStamp(date: Date): string {
  return date.toISOString().replace(/\D/g, '').slice(0, 14);
}

/** tiles が取り決めに合っていれば、baseUrl に含まれる撮影時刻（14桁）を返す */
export function checkTiles(tiles: Tiles): string | null {
  const match = TILE_BASE_URL.exec(tiles.baseUrl);
  if (!match?.[1]) return null;
  const { tileSize, maxZoom } = tiles;
  if (!Number.isInteger(tileSize) || tileSize < MIN_TILE_SIZE || tileSize > MAX_TILE_SIZE) {
    return null;
  }
  if (!Number.isInteger(maxZoom) || maxZoom < 0 || maxZoom > MAX_ZOOM) return null;
  return match[1];
}

export function tileUrl(baseUrl: string, z: number, row: number, col: number): string {
  const count = 2 ** z;
  const ok =
    [z, row, col].every(Number.isInteger) &&
    z >= 0 &&
    z <= MAX_ZOOM &&
    row >= 0 &&
    row < count &&
    col >= 0 &&
    col < count;
  if (!ok) throw new RangeError(`tile out of range: ${z}/${row}/${col}`);
  const pad = (n: number, w: number) => String(n).padStart(w, '0');
  return `${baseUrl}${pad(z, 2)}/${pad(row, 3)}_${pad(col, 3)}.png`;
}
