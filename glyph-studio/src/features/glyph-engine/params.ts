import type { Join, Params, Terminal } from './types';

type NumericKey = 'weight' | 'hWeight' | 'width' | 'slant' | 'xHeight';

/** 数値パラメータの [下限, 上限]（【要確認】初期値。組み合わせのテストで狭める。未確定事項 #4） */
export const PARAM_LIMITS: Record<NumericKey, [number, number]> = {
  weight: [20, 200],
  hWeight: [20, 200],
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

/** パラメータを上限・下限に丸める（FR-005）。未知の値・欠けた値は既定値にする */
export function clampParams(input: Partial<Record<keyof Params, unknown>>): Params {
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
