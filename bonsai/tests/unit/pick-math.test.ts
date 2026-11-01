import { describe, expect, it } from 'vitest';
import {
  DEPTH_EPS,
  PICK_RADIUS_PX,
  choosePick,
  distPointSegment,
  type Candidate,
} from '../../src/render/pick-math';

const b = (o: Partial<Candidate> = {}): Candidate => ({
  kind: 'branch',
  nodeId: 1,
  distPx: 0,
  depth: 10,
  radius: 1,
  ...o,
});

describe('distPointSegment', () => {
  it('線分の途中への垂線の長さとなる', () => {
    expect(distPointSegment(5, 3, 0, 0, 10, 0)).toBeCloseTo(3, 10);
  });
  it('端より外の点は端までの距離となる', () => {
    expect(distPointSegment(13, 4, 0, 0, 10, 0)).toBeCloseTo(5, 10);
    expect(distPointSegment(-3, 4, 0, 0, 10, 0)).toBeCloseTo(5, 10);
  });
  it('長さ 0 の線分のときは点との距離となる', () => {
    expect(distPointSegment(3, 4, 0, 0, 0, 0)).toBeCloseTo(5, 10);
  });
  it('線分の上の点のときは 0 となる', () => {
    expect(distPointSegment(5, 5, 0, 0, 10, 10)).toBeCloseTo(0, 10);
  });
});

describe('choosePick', () => {
  it('定数は 6 と 0.02 となる', () => {
    expect(PICK_RADIUS_PX).toBe(6);
    expect(DEPTH_EPS).toBe(0.02);
  });
  it('候補が空のときは null となる', () => {
    expect(choosePick([])).toBeNull();
  });
  it('枝は 6px ちょうどのとき当たりとなる', () => {
    expect(choosePick([b({ distPx: 6 })])).not.toBeNull();
  });
  it('枝は 6.01px のとき外れとなる', () => {
    expect(choosePick([b({ distPx: 6.01 })])).toBeNull();
  });
  it('葉は distPx がそのレコードの radius 以下のとき当たり、超えると外れとなる', () => {
    const leaf = (d: number): Candidate => ({
      kind: 'leaf',
      nodeId: 2,
      leafIndex: 0,
      distPx: d,
      depth: 10,
      radius: 12,
    });
    expect(choosePick([leaf(12)])).not.toBeNull();
    expect(choosePick([leaf(12.01)])).toBeNull();
  });
  it('重なったときは depth が小さい（手前）ものを選ぶ', () => {
    const r = choosePick([b({ nodeId: 1, depth: 10 }), b({ nodeId: 2, depth: 9 })]);
    expect(r?.nodeId).toBe(2);
  });
  it('depth の差が DEPTH_EPS 以内のときは radius が小さいほう（枝先）を選ぶ', () => {
    const r = choosePick([
      b({ nodeId: 1, depth: 10, radius: 3 }),
      b({ nodeId: 2, depth: 10.02, radius: 1 }),
    ]);
    expect(r?.nodeId).toBe(2);
  });
  it('depth の差が DEPTH_EPS を超えるときは手前を選ぶ', () => {
    const r = choosePick([
      b({ nodeId: 1, depth: 10, radius: 3 }),
      b({ nodeId: 2, depth: 10.03, radius: 1 }),
    ]);
    expect(r?.nodeId).toBe(1);
  });
});
