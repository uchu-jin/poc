// ADR-0001 検証用: spike4（案 D'）の 1 文字あたりの時間と点数を、条件ごとに測る
import { outlineD2 } from './spike4.mjs';
import { ORDER } from './spike2.mjs';
for (const v of [{ cap: 'flat', join: 'miter' }, { cap: 'round', join: 'round' }]) for (const w of [40, 140]) {
  const row = ORDER.map((c) => { const P = { weight: w, width: 1, slant: 0, ...v }; const t = performance.now(); const o = outlineD2(c, P); return `${c}:${(performance.now() - t).toFixed(1)}ms/${o.reduce((n, r) => n + r.length, 0)}点`; });
  console.log(`${v.cap}-${v.join} w=${w}`, row.join(' '));
}
