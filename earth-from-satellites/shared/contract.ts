// 画面とサーバーの両方が参照する取り決め。純粋な定数と型だけを置く

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

const CIRA = 'slider.cira.colostate.edu';
const STAR = 'cdn.star.nesdis.noaa.gov';
const EPIC = 'epic.gsfc.nasa.gov';

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

export function isAllowedImageUrl(satelliteId: string, raw: string): boolean {
  if (!isSatelliteId(satelliteId)) return false;
  try {
    const url = new URL(raw);
    return (
      url.protocol === 'https:' && IMAGE_HOSTS_BY_SATELLITE[satelliteId].includes(url.hostname)
    );
  } catch {
    return false;
  }
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
