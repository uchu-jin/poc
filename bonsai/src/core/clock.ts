import { GROWTH_STEP_MS, TIME_FLOOR } from './constants';

export interface TickResult {
  steps: number;
  lastTickAt: number;
}

/** 経過 × speed を GROWTH_STEP_MS で割った整数部だけ進める。端数は lastTickAt に残す。 */
export function computeTicks(now: number, lastTickAt: number, speed: number): TickResult {
  const elapsed = now - lastTickAt;
  if (elapsed < 0) return { steps: 0, lastTickAt: Math.max(now, TIME_FLOOR) };
  const steps = Math.floor((elapsed * speed) / GROWTH_STEP_MS);
  return {
    steps,
    lastTickAt: lastTickAt + Math.floor((steps * GROWTH_STEP_MS) / speed),
  };
}

/** 次のステップまでの進み具合（0 以上 1 未満）。描画の補間用で保存しない。 */
export function progress(now: number, lastTickAt: number, speed: number): number {
  const elapsed = now - lastTickAt;
  if (elapsed < 0) return 0;
  const p = ((elapsed * speed) % GROWTH_STEP_MS) / GROWTH_STEP_MS;
  return Math.min(p, 1 - Number.EPSILON);
}
