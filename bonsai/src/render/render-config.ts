// 描画の切り替え（FR-039）：葉と新芽にごく薄い緑を入れるか。初期値はオフ（墨のモノクロ）
export const INK_ACCENT = false;

/** 30fps を保てないときに pixel ratio を下げる（SC-014。作者の回答 2026-10-25） */
export const FPS_FLOOR = 30;
export const FPS_WINDOW_MS = 5000;
export const MAX_PIXEL_RATIO = 2;
/** 前のフレームとの間がこれを超えたら fps の記録をやり直す（描画が絞られていた・止まっていたとみなす） */
export const FRAME_GAP_RESET_MS = 300;
