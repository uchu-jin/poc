import { MAX_ZOOM, type Tiles } from '../../../shared/contract';
import { CIRA_HOST, toCiraTimestamp } from './ciraTimes';

/** CIRA SLIDER の全球画像の、ある撮影時刻の画像フォルダ（末尾は /） */
export function ciraImageryBase(sliderSat: string, capturedAt: Date): string {
  const ts = toCiraTimestamp(capturedAt);
  const day = `${ts.slice(0, 4)}/${ts.slice(4, 6)}/${ts.slice(6, 8)}`;
  return `https://${CIRA_HOST}/data/imagery/${day}/${sliderSat}---full_disk/geocolor/${ts}/`;
}

export function ciraTiles(sliderSat: string, capturedAt: Date, tileSize: number): Tiles {
  return { baseUrl: ciraImageryBase(sliderSat, capturedAt), tileSize, maxZoom: MAX_ZOOM };
}
