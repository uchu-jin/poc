// 枝の形：全部の節を1つの形にまとめる（FR-040）。節ごとに6角の円柱。
// 伸びの補間（FR-010）とにじみ（FR-038）はシェーダーが頂点属性で行うので、毎フレームは作り直さない。
// ここは配列を作るだけで Three.js に依存しない（単体テストで確かめる）。
import type { SaveData, TreeNode, Vec3 } from '../core/types';

export const RADIAL_SEGMENTS = 6;
/** 節の先端を太さの何倍だけ先へ延ばして重ねるか */
export const JOINT_OVERLAP = 0.6;
/** 1節あたりの頂点数（下の輪と上の輪） */
export const VERTS_PER_NODE = RADIAL_SEGMENTS * 2;
/** 1節あたりの三角形の頂点の添字の数 */
export const INDICES_PER_NODE = RADIAL_SEGMENTS * 6;

export interface BranchArrays {
  position: Float32Array; // 3
  normal: Float32Array; // 3
  dir: Float32Array; // 3：節の向き（伸びの補間で先端を縮める向き）
  len: Float32Array; // 1：節の長さ
  t: Float32Array; // 1：0 = 根元側の輪、1 = 先端側の輪
  born: Float32Array; // 1：bornAge
  ink: Float32Array; // 1：墨の濃さの元（根元 1 〜 枝先 0）
  radius: Float32Array; // 1：輪の太さ（輪郭線の幅に使う）
  rand: Float32Array; // 1：節ごとの乱数（輪郭線の強弱）
  nodeId: Float32Array; // 1：節の id（にじみの開始時刻を引くため）
  index: Uint32Array;
  /** 頂点の並びの n 番目の節の id */
  nodeIds: number[];
}

/** 節の id から決まる 0〜1 の乱数（保存しない。毎回同じ値） */
export function nodeRand(id: number): number {
  let h = (id + 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function basis(d: Vec3): [Vec3, Vec3] {
  const helper: Vec3 = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  let u: Vec3 = [
    d[1] * helper[2] - d[2] * helper[1],
    d[2] * helper[0] - d[0] * helper[2],
    d[0] * helper[1] - d[1] * helper[0],
  ];
  const l = Math.hypot(...u) || 1;
  u = [u[0] / l, u[1] / l, u[2] / l];
  const v: Vec3 = [d[1] * u[2] - d[2] * u[1], d[2] * u[0] - d[0] * u[2], d[0] * u[1] - d[1] * u[0]];
  return [u, v];
}

export function buildBranchArrays(data: SaveData): BranchArrays {
  const nodes = data.nodes;
  const n = nodes.length;
  const V = n * VERTS_PER_NODE;
  const out: BranchArrays = {
    position: new Float32Array(V * 3),
    normal: new Float32Array(V * 3),
    dir: new Float32Array(V * 3),
    len: new Float32Array(V),
    t: new Float32Array(V),
    born: new Float32Array(V),
    ink: new Float32Array(V),
    radius: new Float32Array(V),
    rand: new Float32Array(V),
    nodeId: new Float32Array(V),
    index: new Uint32Array(n * INDICES_PER_NODE),
    nodeIds: nodes.map((x) => x.id),
  };

  // 先端側の太さ = 延長の子（id が最小の子）の太さ。なければ自分の太さの 0.8 倍
  const firstChild = new Map<number, TreeNode>();
  for (const x of nodes)
    if (x.parent >= 0 && !firstChild.has(x.parent)) firstChild.set(x.parent, x);
  const rootR = nodes[0]?.radius ?? 1;

  nodes.forEach((node, i) => {
    const d = node.dir;
    const [u, v] = basis(d);
    const rBase = node.radius;
    const rTip = firstChild.get(node.id)?.radius ?? node.radius * 0.8;
    const ink = Math.min(1, Math.max(0, Math.sqrt(rBase / rootR)));
    const rand = nodeRand(node.id);
    for (let ring = 0; ring < 2; ring++) {
      const r = ring === 0 ? rBase : rTip;
      // 先端の輪を少し先へ延ばして次の節と重ね、つなぎ目の白い筋を出さない（作者の指摘 2026-10-25）
      const along = ring === 0 ? 0 : node.length + Math.min(rBase, node.length) * JOINT_OVERLAP;
      for (let k = 0; k < RADIAL_SEGMENTS; k++) {
        const a = (k / RADIAL_SEGMENTS) * Math.PI * 2;
        const c = Math.cos(a);
        const s = Math.sin(a);
        const nx = u[0] * c + v[0] * s;
        const ny = u[1] * c + v[1] * s;
        const nz = u[2] * c + v[2] * s;
        const vi = i * VERTS_PER_NODE + ring * RADIAL_SEGMENTS + k;
        out.position[vi * 3] = node.pos[0] + d[0] * along + nx * r;
        out.position[vi * 3 + 1] = node.pos[1] + d[1] * along + ny * r;
        out.position[vi * 3 + 2] = node.pos[2] + d[2] * along + nz * r;
        out.normal[vi * 3] = nx;
        out.normal[vi * 3 + 1] = ny;
        out.normal[vi * 3 + 2] = nz;
        out.dir[vi * 3] = d[0];
        out.dir[vi * 3 + 1] = d[1];
        out.dir[vi * 3 + 2] = d[2];
        out.len[vi] = node.length;
        out.t[vi] = ring;
        out.born[vi] = node.bornAge;
        out.ink[vi] = ink;
        out.radius[vi] = r;
        out.rand[vi] = rand;
        out.nodeId[vi] = node.id;
      }
    }
    const base = i * VERTS_PER_NODE;
    let w = i * INDICES_PER_NODE;
    for (let k = 0; k < RADIAL_SEGMENTS; k++) {
      const k2 = (k + 1) % RADIAL_SEGMENTS;
      const a = base + k;
      const b = base + k2;
      const c = base + RADIAL_SEGMENTS + k;
      const e = base + RADIAL_SEGMENTS + k2;
      out.index[w++] = a;
      out.index[w++] = b;
      out.index[w++] = c;
      out.index[w++] = b;
      out.index[w++] = e;
      out.index[w++] = c;
    }
  });
  return out;
}
