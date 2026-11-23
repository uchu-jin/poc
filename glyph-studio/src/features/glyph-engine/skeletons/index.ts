import type { Skeleton } from '../types';
import { DIGIT_HOLES, DIGITS } from './digits';
import { LOWERCASE, LOWERCASE_HOLES } from './lowercase';
import { UPPERCASE, UPPERCASE_HOLES } from './uppercase';

/** 骨格を持つ文字（英数 62 字）。スペースは骨格を持たない特別な文字として buildGlyph で扱う */
export const GLYPH_CHARS: readonly string[] = [
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  ...'abcdefghijklmnopqrstuvwxyz',
  ...'0123456789',
];

/** 既定の骨格（AI の下書き。作者が確認用ページで確かめる） */
export const DEFAULT_SKELETONS: Readonly<Record<string, Skeleton>> = {
  ...UPPERCASE,
  ...LOWERCASE,
  ...DIGITS,
};

/** 各文字の想定される穴の数（【要確認】AI の下書き。作者が確認用ページで確かめる） */
export const EXPECTED_HOLES: Readonly<Record<string, number>> = {
  ...UPPERCASE_HOLES,
  ...LOWERCASE_HOLES,
  ...DIGIT_HOLES,
};
