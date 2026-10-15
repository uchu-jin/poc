export const MESSAGES = {
  loading: '読み込み中…',
  refreshFailed: '更新できませんでした（10分後に自動で再試行します）',
  loadFailed: '取得できませんでした（10分後に自動で再試行します）',
  stale: (minutes: number) => `${minutes}分前の画像です`,
  staleDays: (days: number) => `${days}日前の画像です`,
  epicNote: '公開まで1〜2日かかります',
  fullDisk: '全球',
  regionGroup: '見る範囲を選ぶ',
  zoomIn: '拡大',
  zoomOut: '縮小',
  satelliteGroup: '衛星を選ぶ',
  creditPrefix: '画像：',
} as const;
