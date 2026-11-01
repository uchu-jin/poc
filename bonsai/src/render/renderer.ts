// 描画の本体。Three.js を使うのは src/render/ だけ。
// three は動的 import で読む。1ファイル出力で静的 import にすると、CDN に届かないときにページ全体が止まるため
// （ink-render のプラン 3章、セキュリティレビュー P1-3。実装順 2 で dist を確かめた）。
import type * as THREE_NS from 'three';
import { createBackground, setBackgroundSize } from './background';
import { buildBranchArrays } from './branch-mesh';
import { createCameraControls, type CameraState } from './camera-controls';
import { createInkMaterial, createOutlineMaterial, sharedUniforms } from './ink-material';
import { FADE_MS, InkFade } from './growth-view';
import { createLeaves } from './leaves';
import { pickAt, type PickResult } from './picking';
import { POT_DEPTH, POT_RADIUS, createPot } from './pot';
import { FPS_FLOOR, FPS_WINDOW_MS, FRAME_GAP_RESET_MS, MAX_PIXEL_RATIO } from './render-config';
import type { SaveData } from '../core/types';

export interface Renderer {
  /**
   * 毎フレーム呼ぶ。progress は次のステップまでの進み具合（0〜1）。
   * 描画の時刻（にじみ）はページを開いてからの performance.now() を内部で使う。
   * Date.now() の大きな値は 32 ビットの小数で約128秒単位にしか表せず、にじみが進まなくなるため（2026-10-25 実装時の判断）
   */
  frame(data: SaveData | null, progress: number): void;
  pickAt(clientX: number, clientY: number): PickResult;
  readonly camera: CameraState;
  readonly stats: {
    fps: number;
    pixelRatio: number;
    drawCalls: number;
    rebuilds: number;
    geometries: number;
  };
}

/** 形が変わったかどうかの目印（ステップ・植え直しで変わる） */
function shapeKey(d: SaveData | null): string {
  if (!d) return 'none';
  const leaves = d.nodes.reduce((s, n) => s + n.leaves.length, 0);
  return `${d.seed}:${d.age}:${d.nextId}:${d.nodes.length}:${leaves}`;
}

export async function createRenderer(container: HTMLElement): Promise<Renderer> {
  const THREE: typeof THREE_NS = await import('three');

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  let pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
  renderer.setPixelRatio(pixelRatio);
  renderer.autoClear = true;
  const canvas = renderer.domElement;
  canvas.className = 'scene';
  container.prepend(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.005, 50);
  const background = createBackground(THREE);
  scene.add(background);
  const shared = sharedUniforms(THREE);
  const pot = createPot(THREE, shared);
  scene.add(pot.group);
  let branchGeom = new THREE.BufferGeometry();
  const branches = new THREE.Mesh(branchGeom, createInkMaterial(THREE, shared));
  const outline = new THREE.Mesh(branchGeom, createOutlineMaterial(THREE, shared));
  branches.frustumCulled = false;
  outline.frustumCulled = false;
  scene.add(outline, branches);
  const leaves = createLeaves(THREE, shared);
  scene.add(leaves.mesh);

  const controls = createCameraControls(camera, canvas);
  const fade = new InkFade();
  const start = performance.now();
  let key = '';
  let lastSeed: number | null = null;
  let rebuilds = 0;
  let data: SaveData | null = null;

  const resize = (): void => {
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    setBackgroundSize(background, w * pixelRatio, h * pixelRatio);
  };
  window.addEventListener('resize', resize);
  resize();

  // 形を作り直すたびに新しい形に差し替え、古い形を捨てる。捨てないと GPU のメモリが溜まり続け、
  // 早送りで毎秒作り直すとブラウザが重くなる（作者の報告 2026-10-25 を受けて直した）
  const replaceBranchGeometry = (g: THREE_NS.BufferGeometry): void => {
    const old = branchGeom;
    branchGeom = g;
    branches.geometry = g;
    outline.geometry = g;
    old.dispose();
  };

  const rebuild = (d: SaveData | null, now: number): void => {
    rebuilds += 1;
    if (!d) {
      replaceBranchGeometry(new THREE.BufferGeometry());
      leaves.mesh.count = 0;
      controls.setBounds(-POT_DEPTH / 2, POT_RADIUS, 0);
      return;
    }
    const initial = lastSeed === null;
    if (lastSeed !== null && lastSeed !== d.seed) fade.reset();
    lastSeed = d.seed;
    const arr = buildBranchArrays(d);
    fade.observe(arr.nodeIds, now, initial);
    const tSec = (now - start) / 1000;
    const fadeStartOf = (id: number): number => tSec - fade.amount(id, now) * (FADE_MS / 1000);
    const fadeAttr = new Float32Array(arr.nodeId.length);
    for (let i = 0; i < fadeAttr.length; i++) fadeAttr[i] = fadeStartOf(arr.nodeId[i]!);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(arr.position, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(arr.normal, 3));
    g.setAttribute('aDir', new THREE.BufferAttribute(arr.dir, 3));
    g.setAttribute('aLen', new THREE.BufferAttribute(arr.len, 1));
    g.setAttribute('aT', new THREE.BufferAttribute(arr.t, 1));
    g.setAttribute('aBorn', new THREE.BufferAttribute(arr.born, 1));
    g.setAttribute('aInk', new THREE.BufferAttribute(arr.ink, 1));
    g.setAttribute('aRadius', new THREE.BufferAttribute(arr.radius, 1));
    g.setAttribute('aRand', new THREE.BufferAttribute(arr.rand, 1));
    g.setAttribute('aFade', new THREE.BufferAttribute(fadeAttr, 1));
    g.setIndex(new THREE.BufferAttribute(arr.index, 1));
    replaceBranchGeometry(g);
    leaves.update(d, fadeStartOf);

    // 木の大きさ（鉢を含む外接球）に合わせてカメラを引く
    let top = 0;
    let rxz = POT_RADIUS;
    for (let i = 0; i < arr.position.length; i += 3) {
      top = Math.max(top, arr.position[i + 1]!);
      rxz = Math.max(rxz, Math.hypot(arr.position[i]!, arr.position[i + 2]!));
    }
    const half = (top + POT_DEPTH) / 2;
    controls.setBounds(top - half, Math.hypot(half, rxz), top);
  };

  // fps と pixel ratio（SC-014）
  const frameTimes: number[] = [];
  let fps = 0;
  const trackFps = (now: number): void => {
    // 前のフレームから間が空いたら（見えていないペインやタブで描画が絞られた・止まっていた）、記録を始めからやり直す。
    // 絞られた間の低い fps で pixel ratio を下げないため（2026-10-25 実装時の判断）
    const prev = frameTimes[frameTimes.length - 1];
    if (prev !== undefined && now - prev > FRAME_GAP_RESET_MS) frameTimes.length = 0;
    frameTimes.push(now);
    while (frameTimes.length > 0 && now - frameTimes[0]! > FPS_WINDOW_MS) frameTimes.shift();
    const span = now - (frameTimes[0] ?? now);
    if (span > 0) fps = ((frameTimes.length - 1) * 1000) / span;
    if (span >= FPS_WINDOW_MS * 0.95 && fps < FPS_FLOOR && pixelRatio > 1) {
      pixelRatio = 1;
      renderer.setPixelRatio(1);
      resize();
    }
  };

  return {
    frame(d, progress) {
      const now = performance.now();
      data = d;
      const k = shapeKey(d);
      if (k !== key) {
        key = k;
        rebuild(d, now);
      }
      shared.uAge.value = d?.age ?? 0;
      shared.uProgress.value = progress;
      shared.uTime.value = (now - start) / 1000;
      pot.setWater(d?.water ?? 100);
      renderer.render(scene, camera);
      trackFps(now);
    },
    pickAt(x, y) {
      camera.updateMatrixWorld();
      return pickAt(THREE, camera, canvas, data, leaves.arrays, leaves.refs, x, y);
    },
    get camera() {
      return controls.state;
    },
    get stats() {
      return {
        fps,
        pixelRatio,
        drawCalls: renderer.info.render.calls,
        rebuilds,
        geometries: renderer.info.memory.geometries,
      };
    },
  };
}
