// 葉（A.4）：小さな板に墨のにじみ模様を貼り、常にカメラを向ける。InstancedMesh 1つで描く。
// 模様は起動時に canvas で作る（1ファイル配布のまま、画像ファイルを足さない）。
import { nodeRand } from './branch-mesh';
import { INK_ACCENT } from './render-config';
import type { SaveData } from '../core/types';
import type { SharedUniforms } from './ink-material';
import type { Three, THREE_NS } from './three-types';

/** 葉の大きさ（ワールド座標）＝ LEAF_WORLD_SIZE × 葉の size（実装順 10 で作者と決める） */
export const LEAF_WORLD_SIZE = 0.045;
/** 枝先のまわりに葉を散らす半径 */
const LEAF_SPREAD = 0.025;
/** 葉1枚の模様に散らす小さなしみの数 */
const LEAF_DOTS = 70;
/** 葉の墨の濃さ（0〜1。実装順 10 で作者と決める） */
export const LEAF_INK = { gray: 0.3, alpha: 0.6 };

export interface LeafArrays {
  center: Float32Array; // 3
  size: Float32Array; // 1
  born: Float32Array; // 1
  nodeId: Float32Array; // 1
  /** インスタンス n 番目の葉の節の id と、節の中の葉の番号 */
  refs: { nodeId: number; leafIndex: number }[];
}

/** 描く葉の配列。摘んで生え直し待ち（regrowAt が null でない）の葉は描かない。Three.js に依存しない */
export function buildLeafArrays(data: SaveData): LeafArrays {
  const refs: LeafArrays['refs'] = [];
  const center: number[] = [];
  const size: number[] = [];
  const born: number[] = [];
  const nodeId: number[] = [];
  for (const node of data.nodes) {
    const tip = [
      node.pos[0] + node.dir[0] * node.length,
      node.pos[1] + node.dir[1] * node.length,
      node.pos[2] + node.dir[2] * node.length,
    ];
    node.leaves.forEach((leaf, k) => {
      if (leaf.regrowAt !== null) return;
      const r1 = nodeRand(node.id * 31 + k * 7 + 1);
      const r2 = nodeRand(node.id * 31 + k * 7 + 2);
      const r3 = nodeRand(node.id * 31 + k * 7 + 3);
      const a = r1 * Math.PI * 2;
      const rr = LEAF_SPREAD * Math.sqrt(r2);
      center.push(
        tip[0]! + Math.cos(a) * rr,
        tip[1]! + (r3 - 0.3) * LEAF_SPREAD,
        tip[2]! + Math.sin(a) * rr,
      );
      size.push(leaf.size);
      born.push(node.bornAge);
      nodeId.push(node.id);
      refs.push({ nodeId: node.id, leafIndex: k });
    });
  }
  return {
    center: Float32Array.from(center),
    size: Float32Array.from(size),
    born: Float32Array.from(born),
    nodeId: Float32Array.from(nodeId),
    refs,
  };
}

/** 墨のにじみ模様のテクスチャを canvas で作る */
function createBlotTexture(THREE: Three): THREE_NS.CanvasTexture {
  const S = 128;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, S, S);
  // 淡い墨の小さなしみをたくさん散らし、縁がにじんだ細かい塊にする（作者の指摘 2026-10-25：黒い塊を淡く、にじみを細かく）
  const halo = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S * 0.45);
  halo.addColorStop(0, 'rgba(0,0,0,0.05)');
  halo.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < LEAF_DOTS; i++) {
    const a = nodeRand(i * 3 + 1) * Math.PI * 2;
    const d = Math.sqrt(nodeRand(i * 3 + 2)) * S * 0.36;
    const r = S * (0.025 + nodeRand(i * 3 + 3) * 0.05);
    const x = S / 2 + Math.cos(a) * d;
    const y = S / 2 + Math.sin(a) * d;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(0,0,0,0.3)');
    g.addColorStop(0.6, 'rgba(0,0,0,0.12)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

export interface Leaves {
  mesh: THREE_NS.InstancedMesh;
  refs: LeafArrays['refs'];
  /** インスタンスの中心と見た目の大きさ（当たり判定用） */
  arrays: LeafArrays;
  update(data: SaveData, fadeStartOf: (nodeId: number) => number): void;
}

export function createLeaves(THREE: Three, shared: SharedUniforms): Leaves {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      ...shared,
      uMap: { value: createBlotTexture(THREE) },
      uSize: { value: LEAF_WORLD_SIZE },
      uAccent: { value: INK_ACCENT ? 1 : 0 },
      uGray: { value: LEAF_INK.gray },
      uAlpha: { value: LEAF_INK.alpha },
    },
    vertexShader: /* glsl */ `
      attribute vec3 iCenter;
      attribute float iSize;
      attribute float iBorn;
      attribute float iFade;
      uniform float uAge;
      uniform float uProgress;
      uniform float uTime;
      uniform float uSize;
      varying vec2 vUv;
      varying float vFade;
      void main() {
        vUv = uv;
        vFade = clamp((uTime - iFade) / 1.0, 0.0, 1.0);
        float grow = abs(iBorn - uAge) < 0.5 ? clamp(uProgress, 0.0, 1.0) : 1.0;
        vec4 mv = modelViewMatrix * vec4(iCenter, 1.0);
        // 常にカメラを向く板。葉ごとに向きを少し回して、同じ模様が並んで見えないようにする
        float ang = fract(sin(dot(iCenter, vec3(12.9898, 78.233, 37.719))) * 43758.5453) * 6.2832;
        vec2 p = mat2(cos(ang), sin(ang), -sin(ang), cos(ang)) * position.xy;
        mv.xy += p * uSize * iSize * grow;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      uniform vec3 uPaper;
      uniform float uAccent;
      uniform float uGray;
      uniform float uAlpha;
      varying vec2 vUv;
      varying float vFade;
      void main() {
        float a = texture2D(uMap, vUv).a * mix(0.3, 1.0, vFade) * uAlpha;
        if (a < 0.005) discard;
        vec3 ink = mix(vec3(uGray), vec3(uGray * 0.9, uGray * 1.25, uGray * 0.85), uAccent);
        gl_FragColor = vec4(ink, a);
      }
    `,
  });
  const plane = new THREE.PlaneGeometry(1, 1);
  const makeGeometry = (): THREE_NS.InstancedBufferGeometry => {
    const g = new THREE.InstancedBufferGeometry();
    g.index = plane.index;
    g.setAttribute('position', plane.getAttribute('position'));
    g.setAttribute('uv', plane.getAttribute('uv'));
    return g;
  };
  const mesh = new THREE.InstancedMesh(makeGeometry(), material, 1);
  mesh.frustumCulled = false;
  mesh.count = 0;
  mesh.renderOrder = 2;

  const leaves: Leaves = {
    mesh,
    refs: [],
    arrays: buildLeafArrays({ nodes: [] } as unknown as SaveData),
    update(data, fadeStartOf) {
      const arr = buildLeafArrays(data);
      const fade = new Float32Array(arr.refs.length);
      arr.refs.forEach((r, i) => (fade[i] = fadeStartOf(r.nodeId)));
      // 作り直すたびに新しい形にして古い形を捨てる（GPU のメモリを溜めない）
      const old = mesh.geometry as THREE_NS.InstancedBufferGeometry;
      const geometry = makeGeometry();
      mesh.geometry = geometry;
      old.dispose();
      geometry.setAttribute('iCenter', new THREE.InstancedBufferAttribute(arr.center, 3));
      geometry.setAttribute('iSize', new THREE.InstancedBufferAttribute(arr.size, 1));
      geometry.setAttribute('iBorn', new THREE.InstancedBufferAttribute(arr.born, 1));
      geometry.setAttribute('iFade', new THREE.InstancedBufferAttribute(fade, 1));
      geometry.instanceCount = arr.refs.length;
      mesh.count = arr.refs.length;
      leaves.refs = arr.refs;
      leaves.arrays = arr;
    },
  };
  return leaves;
}
