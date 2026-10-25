// 成長と保存の定数。調整値はこのファイルだけに置く（.claude/plans/core-growth.md 3章）。

/** 1ステップ（1時間）の長さ。FR-002 */
export const GROWTH_STEP_MS = 3_600_000;

/** 時刻の下限（2026-01-01 UTC）。時計がこれより前に戻っても保存データの検証を外れないようにする */
export const TIME_FLOOR = 1_767_225_600_000;

/** 時刻の上限（Date が表せる最大値） */
export const TIME_CEIL = 8_640_000_000_000_000;

/** 1ステップで減る水分。FR-004 */
export const WATER_DECAY = 4;
export const WATER_MAX = 100;
/** 植えたときの水分（実装時の判断：要件に決まりがないため満水で始める） */
export const INITIAL_WATER = WATER_MAX;

/** 成長の上限。FR-012 */
export const MAX_NODES = 3000;
export const MAX_LEAVES = 4000;

/** 保存データの検証に使う上限。成長の上限を調整で下げても今の木が読めるよう、別の値にする */
export const SAVE_LIMIT_NODES = 20_000;
export const SAVE_LIMIT_LEAVES = 50_000;

/** 保存データの値の大きさの上限。検証を通ったデータを育てても、範囲を外れたり安全な整数を超えたりしないようにする（実装レビュー P1-①） */
export const SAVE_LIMIT_COORD = 1000;
export const SAVE_LIMIT_LENGTH = 10;
export const SAVE_LIMIT_COUNT = 1_000_000_000;
/** dir の長さが 1 からずれてよい幅 */
export const UNIT_TOLERANCE = 1e-6;

export const SAVE_VERSION = 1 as const;
export const SAVE_KEY = 'bonsai.save.v1';
export const SAVE_KEY_SPEED = 'bonsai.save.v1.speed';
export const BROKEN_KEY_PREFIX = 'bonsai.save.v1.broken.';

export const UINT32_MAX = 0xffff_ffff;

// ---- 段階（FR-007） ----

export type Stage = 'seed' | 'sprout' | 'seedling' | 'young' | 'mature';

export const STAGE_NAMES: Record<Stage, string> = {
  seed: '種',
  sprout: '芽',
  seedling: '苗',
  young: '若木',
  mature: '成木',
};

/** 各段階の最後の age（成木は上限なし） */
export const STAGE_END = { seed: 0, sprout: 12, seedling: 48, young: 120 } as const;

// ---- 成長の調整値（2026-10-25 作者が確定。要件 付録 A.2） ----

/** 成長係数 f = GROWTH_MIN + (1 - GROWTH_MIN) × water / 100。FR-005 */
export const GROWTH_MIN = 0.3;

/** 1節の伸びの基準値（鉢の直径＝1）。種からの最初のステップは芽の値を使う */
export const BASE_LENGTH: Record<Exclude<Stage, 'seed'>, number> = {
  sprout: 0.012,
  seedling: 0.014,
  young: 0.012,
  mature: 0.008,
};

/** 1節の長さにかける乱数の幅：LENGTH_RAND_MIN 〜 LENGTH_RAND_MIN + LENGTH_RAND_RANGE（FR-006 の 0.8〜1.2） */
export const LENGTH_RAND_MIN = 0.8;
export const LENGTH_RAND_RANGE = 0.4;

/** 葉の大きさ = LEAF_SIZE_MIN + LEAF_SIZE_RANGE × leafSize（性格値。FR-009） */
export const LEAF_SIZE_MIN = 0.6;
export const LEAF_SIZE_RANGE = 0.8;

/** 側芽が枝になる確率の基準。ADR-0002 の D。値は V-04〜V-06 で作者と確定（2026-10-25） */
export const BRANCH_P: Record<Exclude<Stage, 'seed'>, number> = {
  sprout: 0,
  seedling: 0.012,
  young: 0.003,
  mature: 0.003,
};

/**
 * 枝先が1ステップで伸びる確率。添字は枝の次数（0 = 幹、1 = 幹から出た枝、2 = その先すべて）。
 * ADR-0002 の A（頂芽優勢の衰え）：幹は若木から伸びが落ち、成木ではほぼ止まる
 */
export const ELONGATE: readonly Record<Exclude<Stage, 'seed'>, number>[] = [
  { sprout: 1, seedling: 0.55, young: 0.2, mature: 0.03 },
  { sprout: 1, seedling: 0.7, young: 0.3, mature: 0.04 },
  { sprout: 1, seedling: 0.5, young: 0.35, mature: 0.06 },
];

/**
 * 混み具合で枝分かれを抑える：crowd = (1 − 節の数 / MAX_NODES) / (1 + (節の数 / CROWD_HALF)²)。
 * 節が CROWD_HALF 個でおよそ半分になる。種による節の増え方の差を小さくする（2026-10-25 プランの変更）
 */
// ADR-0002: 混み具合の式（V-06）
export const CROWD_HALF = 500;

/** 生まれてから何ステップまで側芽が枝になりうるか */
// ADR-0002 の D：側芽の窓
export const LATERAL_WINDOW = 12;
/** 剪定の芽吹きブーストが効いている間の倍率。FR-017 */
export const BOOST_FACTOR = 2;

/** 枝先の太さと、根元へ1節ごとに足す太さ */
export const R_TIP = 0.003;
export const R_STEP = 0.00003;

/** 葉：枝先から LEAF_DEPTH 節未満の節にだけ付く（作者の回答 2026-10-21） */
// ADR-0002 の E：葉の塊
export const LEAVES_PER_NODE = 3;
export const LEAF_DEPTH = 5;

/** 頂芽の向きのずれの大きさ（ラジアン。× (1 - straightness)） */
export const APICAL_JITTER = 0.3;
/** ADR-0002 の B（枝は水平へ）：幹は上向きの偏りを足し、枝は向きの y 成分を BRANCH_TARGET_Y へ寄せる */
export const TRUNK_UP = 0.15;
export const BRANCH_TARGET_Y = 0.3;
export const BRANCH_PULL = 0.25;
/** 横枝の開き角 = LATERAL_ANGLE_MIN + spread × LATERAL_ANGLE_RANGE（度）。ADR-0002 の C */
export const LATERAL_ANGLE_MIN_DEG = 45;
export const LATERAL_ANGLE_RANGE_DEG = 35;
