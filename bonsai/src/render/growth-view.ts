// 描画のための計算（Three.js・DOM に依存しない）。保存データには入れない。

/** 墨のにじみが淡い墨から本来の濃さになるまでの時間（ms） */
export const FADE_MS = 1000;

/** 節の伸び具合（FR-010）。最後のステップで生まれた節だけ progress で伸び、他は全長。 */
export function growthScale(bornAge: number, age: number, progress: number): number {
  if (bornAge !== age) return 1;
  return Math.min(1, Math.max(0, progress));
}

/** 節の id ごとに「初めて描いた時刻」をメモリに持つ（保存しない）。 */
export class InkFade {
  private readonly firstSeen = new Map<number, number>();

  /** 初めて見た id に時刻を記録する。initial が true なら最初から本来の濃さ扱い。 */
  observe(ids: Iterable<number>, now: number, initial: boolean): void {
    // 起動時の節は「ずっと前に見た」と記録する（記録しないと、次に作り直したとき新しい節としてにじみ直すため）
    const t = initial ? -Infinity : now;
    for (const id of ids) {
      if (!this.firstSeen.has(id)) this.firstSeen.set(id, t);
    }
  }

  /** 0 = 淡い墨、1 = 本来の濃さ。未登録の id は 1。 */
  amount(id: number, now: number): number {
    const t = this.firstSeen.get(id);
    if (t === undefined) return 1;
    return Math.min(1, Math.max(0, (now - t) / FADE_MS));
  }

  /** 植え直しのとき表を空にする。 */
  reset(): void {
    this.firstSeen.clear();
  }
}
