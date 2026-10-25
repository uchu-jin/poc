// 保存データの検証・読み書き・退避。DOM にも Three.js にも依存しない（storage は引数で受け取る）。
import { z } from 'zod';
import {
  BROKEN_KEY_PREFIX,
  SAVE_LIMIT_COORD,
  SAVE_LIMIT_COUNT,
  SAVE_LIMIT_LEAVES,
  SAVE_LIMIT_LENGTH,
  SAVE_LIMIT_NODES,
  SAVE_VERSION,
  TIME_CEIL,
  TIME_FLOOR,
  UINT32_MAX,
  UNIT_TOLERANCE,
  WATER_MAX,
} from './constants';
import type { SaveData } from './types';

/** localStorage の最小限。テストでは偽物に差し替える */
export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export type ParseResult = { kind: 'ok'; data: SaveData } | { kind: 'invalid'; reason: string };
export type LoadResult =
  | { kind: 'empty' }
  | { kind: 'ok'; data: SaveData }
  | { kind: 'invalid'; reason: string; raw: string };
export type SaveResult = { ok: true } | { ok: false; reason: string };
export type BackupResult = { ok: true; key: string } | { ok: false; reason: string };

const uint32 = z.number().int().min(0).max(UINT32_MAX);
const time = z.number().int().min(TIME_FLOOR).max(TIME_CEIL);
const unit = z.number().min(0).max(1);
const finite = z.number(); // zod 4 の number は Infinity・NaN を受け付けない
const vec3 = z.tuple([finite, finite, finite]);
const coord = z.number().min(-SAVE_LIMIT_COORD).max(SAVE_LIMIT_COORD);
const posSchema = z.tuple([coord, coord, coord]);
/** age・id・nextId など、数えて増える整数 */
const count = z.number().int().min(0).max(SAVE_LIMIT_COUNT);

const traitsSchema = z.object({
  straightness: unit,
  branchiness: unit,
  spread: unit,
  leafSize: unit,
});

const leafSchema = z.object({
  size: z.number().gt(0).max(2),
  regrowAt: count.nullable(),
});

// ADR-0001: wire は節ごとに持つ { until, axis（長さ1）, angle（0〜π） }。なければ null
const wireSchema = z.object({
  until: count,
  axis: vec3,
  angle: z.number().min(0).max(Math.PI),
});

const nodeSchema = z.object({
  id: count,
  parent: z.number().int(),
  pos: posSchema,
  dir: vec3,
  length: z.number().min(0).max(SAVE_LIMIT_LENGTH),
  radius: z.number().gt(0).max(SAVE_LIMIT_LENGTH),
  bornAge: count,
  bud: z.boolean(),
  // ADR-0001: boostUntil は節ごとに持つ（剪定のブーストが切れる age。なければ null）
  boostUntil: count.nullable(),
  wire: wireSchema.nullable(),
  leaves: z.array(leafSchema),
});

const saveSchema = z.object({
  version: z.literal(SAVE_VERSION),
  seed: uint32,
  rngState: uint32,
  createdAt: time,
  lastTickAt: time,
  age: count,
  water: z.number().int().min(0).max(WATER_MAX),
  traits: traitsSchema,
  // ADR-0001: nextId は保存データ直下に持つ（id を使い回さないための次の番号）
  nextId: count,
  nodes: z.array(nodeSchema).min(1).max(SAVE_LIMIT_NODES),
});

function invalid(reason: string): { kind: 'invalid'; reason: string } {
  return { kind: 'invalid', reason };
}

/** 形の検証を通ったあとの、節どうしの関係。問題があれば理由を返す */
function checkRelations(d: z.infer<typeof saveSchema>): string | null {
  const { nodes } = d;
  let leaves = 0;
  let prevId = -Infinity;
  const seen = new Set<number>();
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]!;
    if (i === 0) {
      if (n.parent !== -1) return '先頭の節が根元ではありません';
    } else if (!seen.has(n.parent)) {
      // 根元の重複（parent −1）も、存在しない・後ろの節を指す parent もここで外れる
      return `節 ${i} の親が、自分より前の節ではありません`;
    }
    if (n.id <= prevId) return '節の id が重複しているか、小さい順ではありません';
    prevId = n.id;
    seen.add(n.id);
    if (n.bornAge > d.age) return `節 ${i} の bornAge が age を超えています`;
    const dirLen = Math.hypot(n.dir[0], n.dir[1], n.dir[2]);
    if (Math.abs(dirLen - 1) > UNIT_TOLERANCE) return `節 ${i} の向きの長さが 1 ではありません`;
    if (n.wire) {
      const len = Math.hypot(n.wire.axis[0], n.wire.axis[1], n.wire.axis[2]);
      if (Math.abs(len - 1) > UNIT_TOLERANCE) return `節 ${i} の針金の軸の長さが 1 ではありません`;
    }
    leaves += n.leaves.length;
  }
  if (leaves > SAVE_LIMIT_LEAVES) return '葉の数が多すぎます';
  if (d.nextId <= prevId) return 'nextId が最大の id より大きくありません';
  return null;
}

/** 文字列を保存データとして検証する。以後は zod の parse 結果だけを返し、生の値は返さない */
export function parseSave(text: string): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return invalid('JSON として読めません');
  }
  const r = saveSchema.safeParse(json);
  if (!r.success) {
    const path = r.error.issues[0]?.path.join('.') ?? '';
    return invalid(path ? `形または値の範囲が正しくありません（${path}）` : '形が正しくありません');
  }
  const problem = checkRelations(r.data);
  if (problem) return invalid(problem);
  return { kind: 'ok', data: r.data };
}

/** getItem の例外は捕まえない（呼び出し側が「読めない」として扱う） */
export function load(storage: StorageLike, key: string): LoadResult {
  const raw = storage.getItem(key);
  if (raw === null) return { kind: 'empty' };
  const r = parseSave(raw);
  if (r.kind === 'ok') return r;
  return { kind: 'invalid', reason: r.reason, raw };
}

function errorReason(e: unknown): string {
  return e instanceof Error && e.message ? e.message : '書き込めませんでした';
}

export function save(storage: StorageLike, key: string, data: SaveData): SaveResult {
  try {
    storage.setItem(key, JSON.stringify(data));
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: errorReason(e) };
  }
}

/** 壊れた保存データの文字列をそのまま別キーへ写す。元のキーには触らない */
export function backupBroken(storage: StorageLike, raw: string, now: number): BackupResult {
  const key = BROKEN_KEY_PREFIX + now;
  try {
    storage.setItem(key, raw);
    return { ok: true, key };
  } catch (e) {
    return { ok: false, reason: errorReason(e) };
  }
}
