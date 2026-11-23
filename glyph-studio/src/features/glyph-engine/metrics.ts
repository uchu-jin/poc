// 縦の寸法と余白の定数（1 em = 1000 単位）

export const UPM = 1000;
export const CAP_HEIGHT = 700;
/** 小文字の骨格を書くときの基準の x ハイト。x ハイトのパラメータはここからの伸び縮み */
export const BASE_X_HEIGHT = 500;
export const ASCENDER = 750;
export const DESCENDER = -250;

/** 輪郭の左右に足す余白（【要確認】初期値。プラン skeleton-outline） */
export const SIDE_BEARING = 60;
/** スペースの幅（【要確認】初期値） */
export const SPACE_WIDTH = 250;

/** 骨格の座標として受け付ける範囲 */
export const COORD_MIN = -250;
export const COORD_MAX = 1000;
/** 1 文字あたりの線の数・1 本あたりの点の数の上限（仮置き） */
export const MAX_STROKES = 16;
export const MAX_POINTS_PER_STROKE = 64;
/**
 * 1 文字を折れ線にしたときの点の数の上限（直線の区間 1、曲線の区間 16、線ごとに始点 1）。既定の 62 字の
 * 最大は 130（8）。上限の中のどんな骨格でも組み立てが重くなりすぎないように（実装レビュー P1-2）
 */
export const MAX_FLAT_POINTS = 400;

/** 曲線 1 本を折れ線にするときの分割数（ADR-0001） */
export const CURVE_STEPS = 16;
