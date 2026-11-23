import type { Skeleton } from '../types';

/** 骨格を持つ文字（英数 62 字）。スペースは骨格を持たない特別な文字として buildGlyph で扱う */
export const GLYPH_CHARS: readonly string[] = [
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  ...'abcdefghijklmnopqrstuvwxyz',
  ...'0123456789',
];

/** 既定の骨格（実装順 9 で 62 字を下書きする） */
export const DEFAULT_SKELETONS: Readonly<Record<string, Skeleton>> = {};

/** 各文字の想定される穴の数（【要確認】AI の下書き。作者が確認用ページで確かめる） */
export const EXPECTED_HOLES: Readonly<Record<string, number>> = {};
