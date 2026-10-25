// mulberry32。state は常に 0〜2^32−1 の符号なし整数に保つ。
export class Rng {
  private s: number;

  constructor(state: number) {
    this.s = state >>> 0;
  }

  /** 0 以上 1 未満 */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** a 以上 b 未満 */
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }

  get state(): number {
    return this.s;
  }
}
