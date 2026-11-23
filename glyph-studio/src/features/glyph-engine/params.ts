import type { Join, Params, Terminal } from './types';

type NumericKey = 'weight' | 'hWeight' | 'width' | 'slant' | 'xHeight';

/**
 * 数値パラメータの [下限, 上限]（未確定事項 #4）。太さ・横線の太さの上限は、組み合わせのテスト
 * （上限・下限の 32 通り × 端と角の 6 通り × 62 字）が通る 150 まで狭めた。160 では e の尾と横線の間が閉じる
 */
export const PARAM_LIMITS: Record<NumericKey, [number, number]> = {
  weight: [20, 150],
  hWeight: [20, 150],
  width: [0.8, 1.25],
  slant: [0, 15],
  xHeight: [420, 580],
};

export const DEFAULT_PARAMS: Params = {
  weight: 90,
  hWeight: 90,
  width: 1,
  slant: 0,
  xHeight: 500,
  terminal: 'flat',
  join: 'miter',
};

const TERMINALS: readonly Terminal[] = ['flat', 'round', 'slab'];
const JOINS: readonly Join[] = ['miter', 'round'];

function clampNumber(v: unknown, key: NumericKey): number {
  const [min, max] = PARAM_LIMITS[key];
  if (typeof v !== 'number' || Number.isNaN(v)) return DEFAULT_PARAMS[key];
  return Math.min(max, Math.max(min, v));
}

/** パラメータを上限・下限に丸める（FR-005）。未知の値・欠けた値・null は既定値にする */
export function clampParams(raw: unknown): Params {
  // 保存データから来る null や配列なども受け付ける（実装レビュー P1-3）
  const input: Partial<Record<keyof Params, unknown>> =
    typeof raw === 'object' && raw !== null ? (raw as Partial<Record<keyof Params, unknown>>) : {};
  return {
    weight: clampNumber(input.weight, 'weight'),
    hWeight: clampNumber(input.hWeight, 'hWeight'),
    width: clampNumber(input.width, 'width'),
    slant: clampNumber(input.slant, 'slant'),
    xHeight: clampNumber(input.xHeight, 'xHeight'),
    terminal: TERMINALS.includes(input.terminal as Terminal)
      ? (input.terminal as Terminal)
      : DEFAULT_PARAMS.terminal,
    join: JOINS.includes(input.join as Join) ? (input.join as Join) : DEFAULT_PARAMS.join,
  };
}
