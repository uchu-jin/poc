// ゲームの状態の持ち主。DOM に触れない（storage・乱数・確認は Env で受け取る）ので単体テストできる。
// 自動保存の時機は FR-043、壊れた保存データは FR-044、書き込めないときは FR-045。
import { computeTicks } from '../core/clock';
import { SAVE_KEY, SAVE_KEY_SPEED, TIME_FLOOR, UINT32_MAX } from '../core/constants';
import { backupBroken, load, save, type StorageLike } from '../core/store';
import { createTree, step as stepTree } from '../core/tree';
import type { SaveData } from '../core/types';

export interface Mode {
  key: string;
  speed: number;
  isSpeed: boolean;
  /** ?speed の値が不正だったときの知らせ */
  notice: string | null;
}

export interface Env {
  /** localStorage を返す。触れること自体が例外を出しうる */
  storage: () => StorageLike;
  randomSeed: () => number;
  confirm: (message: string) => boolean;
}

export type Status = 'needSeed' | 'playing' | 'broken';

const SPEED_MAX = 86_400;
const ADVANCE_MAX = 10_000;
/** speed の木で、1 フレームの間がこれを超えたら止まっていた扱いにする（スリープ・デバッガでの停止。実装レビュー P1-③） */
const SPEED_FRAME_GAP_MS = 1000;

export const MSG_NO_STORAGE = '保存できません。この木は閉じると消えます';
export const MSG_SAVE_FAILED =
  '保存できませんでした。このまま遊べますが、閉じると失われるかもしれません';
export const MSG_BACKUP_FAILED = '退避できませんでした。保存データはそのまま残しています';
export const MSG_CONFIRM_BACKUP =
  'いまの保存データを別の場所に退避して、新しい種から始めます。よろしいですか？';

/** URL の検索文字列から、使う保存キーと速さを決める。?speed があれば値にかかわらず speed のキー */
export function parseMode(search: string): Mode {
  const params = new URLSearchParams(search);
  if (!params.has('speed')) return { key: SAVE_KEY, speed: 1, isSpeed: false, notice: null };
  const raw = params.get('speed') ?? '';
  const n = Number(raw);
  const ok = /^\d+$/.test(raw) && Number.isInteger(n) && n >= 1 && n <= SPEED_MAX;
  return {
    key: SAVE_KEY_SPEED,
    speed: ok ? n : 1,
    isSpeed: true,
    notice: ok ? null : `?speed の値「${raw}」は使えないため、速さ1で動かしています`,
  };
}

export class Game {
  status: Status = 'needSeed';
  data: SaveData | null = null;
  broken: { reason: string; raw: string } | null = null;
  warning: string | null = null;
  private storage: StorageLike | null = null;
  /**
   * 読めなかった保存データを上書きしないため、書いてよいときだけ true。
   * いまは壊れたとき data が、読めないとき storage が null なので重ねての守りだが、
   * 読み込み（FR-047）など data を差し替える経路を足したときに上書きを防ぐため残す（2026-10-25 リファクタリングで判断）
   */
  private canWrite = false;
  /** 前のフレーム（または起動・タブに戻った時刻）。speed の木の停止を見分けるため */
  private lastFrameAt: number | null = null;

  constructor(
    readonly mode: Mode,
    private readonly env: Env,
  ) {}

  boot(now: number): void {
    let result;
    try {
      this.storage = this.env.storage();
      result = load(this.storage, this.mode.key);
    } catch {
      this.storage = null;
      this.canWrite = false;
      this.warning = MSG_NO_STORAGE;
      this.status = 'needSeed';
      return;
    }
    if (result.kind === 'empty') {
      this.canWrite = true;
      this.status = 'needSeed';
      return;
    }
    if (result.kind === 'invalid') {
      this.canWrite = false;
      this.broken = { reason: result.reason, raw: result.raw };
      this.status = 'broken';
      return;
    }
    this.canWrite = true;
    this.data = result.data;
    this.status = 'playing';
    this.catchUp(now);
  }

  plant(now: number, seed = this.env.randomSeed()): void {
    if (this.status === 'broken') return;
    this.data = createTree(seed, now);
    this.status = 'playing';
    this.lastFrameAt = now;
    this.persist();
  }

  /** 毎フレーム呼ぶ。進んだステップ数を返す */
  tick(now: number, stepper: (d: SaveData) => void = stepTree): number {
    const d = this.data;
    if (this.status !== 'playing' || !d) return 0;
    const gap = this.lastFrameAt === null ? 0 : now - this.lastFrameAt;
    this.lastFrameAt = now;
    if (this.mode.isSpeed && gap > SPEED_FRAME_GAP_MS) {
      // 隠れずに描画だけが止まっていた（スリープなど）。早送りのまま一度に計算して固まらないよう、止めていた扱いにする
      d.lastTickAt = Math.max(now, TIME_FLOOR);
      this.persist();
      return 0;
    }
    const r = computeTicks(now, d.lastTickAt, this.mode.speed);
    for (let i = 0; i < r.steps; i++) stepper(d);
    const changed = r.steps > 0 || r.lastTickAt !== d.lastTickAt;
    d.lastTickAt = r.lastTickAt;
    if (changed) this.persist();
    return r.steps;
  }

  /** タブに戻ったとき。普段の木は不在分を計算し、speed の木は止めていた扱いにする（FR-011・FR-013） */
  onVisible(now: number): void {
    if (this.status !== 'playing') return;
    this.catchUp(now);
  }

  /** 今の状態を書く。隠れたとき・閉じるとき・ステップのあと（FR-043） */
  persist(): void {
    if (!this.canWrite || !this.storage || !this.data) return;
    const r = save(this.storage, this.mode.key, this.data);
    this.warning = r.ok
      ? this.warning === MSG_SAVE_FAILED
        ? null
        : this.warning
      : MSG_SAVE_FAILED;
  }

  /** 壊れた保存データを退避して、種まきから始め直す。退避できたときだけ true */
  backupAndRestart(now: number): boolean {
    if (this.status !== 'broken' || !this.broken || !this.storage) return false;
    if (!this.env.confirm(MSG_CONFIRM_BACKUP)) return false;
    const r = backupBroken(this.storage, this.broken.raw, now);
    if (!r.ok) {
      this.warning = MSG_BACKUP_FAILED;
      return false;
    }
    this.broken = null;
    this.canWrite = true;
    this.status = 'needSeed';
    if (this.warning === MSG_BACKUP_FAILED) this.warning = null;
    return true;
  }

  /** __bonsai.advance(hours)。lastTickAt は動かさない。不正な値は null */
  advanceHours(hours: number, stepper: (d: SaveData) => void = stepTree): number | null {
    const d = this.data;
    if (this.status !== 'playing' || !d) return null;
    if (!Number.isFinite(hours) || hours < 0 || hours > ADVANCE_MAX) return null;
    const n = Math.floor(hours);
    for (let i = 0; i < n; i++) stepper(d);
    this.persist();
    return n;
  }

  /** __bonsai.plant(seed)。speed の木だけを植え直す（調整用） */
  replant(now: number, seed?: number): boolean {
    if (!this.mode.isSpeed || this.status === 'broken') return false;
    const s = seed ?? this.env.randomSeed();
    if (!Number.isInteger(s) || s < 0 || s > UINT32_MAX) return false;
    this.plant(now, s);
    return true;
  }

  private catchUp(now: number): void {
    const d = this.data;
    if (!d) return;
    this.lastFrameAt = now;
    if (this.mode.isSpeed) {
      d.lastTickAt = Math.max(now, TIME_FLOOR);
      this.persist();
      return;
    }
    this.tick(now);
  }
}
