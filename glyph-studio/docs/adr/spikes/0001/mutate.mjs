// ADR-0001 検証用: clipper2-js の Xor / Union が入力の Paths64 を書き換えるかを確かめる
import { Clipper, FillRule, Paths64, Path64, Point64 } from 'clipper2-js';
const sq = (x, y, s) => { const p = new Path64(); for (const [a, b] of [[x, y], [x + s, y], [x + s, y + s], [x, y + s]]) p.push(new Point64(a, b)); return p; };
const A = new Paths64(); A.push(sq(0, 0, 100));
const B = new Paths64(); B.push(sq(50, 50, 100));
const snap = (ps) => JSON.stringify(ps.map((p) => p.map((q) => [q.x, q.y])));
for (const op of ['Union', 'Xor']) {
  const a0 = snap(A), b0 = snap(B);
  const r = op === 'Union' ? Clipper.Union(A, B, FillRule.NonZero) : Clipper.Xor(A, B, FillRule.EvenOdd);
  console.log(op, '結果の面積', Clipper.areaPaths(r), ' A が変わった:', snap(A) !== a0, ' B が変わった:', snap(B) !== b0);
}
console.log('A の今:', snap(A), ' B の今:', snap(B));
