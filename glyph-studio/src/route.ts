/** URL のハッシュから画面を決める。#preview（大文字・#/preview・後ろの ?… も同じ）なら確認用の一覧 */
export function routeOf(hash: string): 'preview' | 'editor' {
  const name = hash.replace(/^#\/?/, '').split('?')[0]!.toLowerCase();
  return name === 'preview' ? 'preview' : 'editor';
}
