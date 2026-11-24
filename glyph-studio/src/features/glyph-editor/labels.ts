// ハンドルの名前と、値の表示の書き方（キャンバスと設定欄で使う）
import type { HandleId } from './handles';

export const HANDLE_LABELS: Record<HandleId, string> = {
  weight: '太さ',
  hWeight: '横線の太さ',
  width: '幅',
  slant: '傾き',
};

export function formatValue(id: HandleId | 'xHeight', v: number): string {
  if (id === 'width') return v.toFixed(2);
  if (id === 'slant') return `${v.toFixed(1)}°`;
  return String(Math.round(v));
}
