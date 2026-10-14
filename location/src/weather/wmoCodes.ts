export const WMO_LABELS: Record<number, string> = {
  0: '快晴',
  1: '晴れ',
  2: '晴れ時々くもり',
  3: 'くもり',
  45: '霧',
  48: '霧（着氷）',
  51: '弱い霧雨',
  53: '霧雨',
  55: '強い霧雨',
  56: '弱い着氷性の霧雨',
  57: '着氷性の霧雨',
  61: '弱い雨',
  63: '雨',
  65: '強い雨',
  66: '弱い着氷性の雨',
  67: '着氷性の雨',
  71: '弱い雪',
  73: '雪',
  75: '強い雪',
  77: '霧雪',
  80: '弱いにわか雨',
  81: 'にわか雨',
  82: '激しいにわか雨',
  85: '弱いにわか雪',
  86: '強いにわか雪',
  95: '雷雨',
  96: '雷雨（ひょう）',
  99: '激しい雷雨（ひょう）',
};

export function weatherLabel(code: number): string {
  return Object.prototype.hasOwnProperty.call(WMO_LABELS, code)
    ? (WMO_LABELS[code] ?? '不明')
    : '不明';
}
