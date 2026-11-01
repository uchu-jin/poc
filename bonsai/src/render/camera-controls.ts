// カメラの操作（FR-035）。OrbitControls は使わず、右・中ボタンの割り当てとクランプを要件どおりにする。
// 右ドラッグ：鉢の中心まわりに回転／ホイール：ズーム／中ドラッグ：見る高さ／R：正面に戻す。
// 自分で動かしていない間は、木の大きさに合わせて引く（作者の回答 2026-10-25）。
import {
  FRONT_AZIMUTH,
  INITIAL_ELEVATION_DEG,
  clampDistance,
  clampElevation,
  clampTargetY,
  fitDistance,
  wrapAzimuth,
} from './camera-math';
import type { THREE_NS } from './three-types';

export interface CameraState {
  azimuth: number;
  elevation: number;
  distance: number;
  targetY: number;
}

const ROTATE_DEG_PER_PX = 0.35;
const HEIGHT_PER_PX = 0.003;
const ZOOM_PER_WHEEL = 0.0012;

export interface CameraControls {
  /** 木の外接球（中心の高さと半径）が変わったときに呼ぶ */
  setBounds(centerY: number, radius: number, treeHeight: number): void;
  apply(): void;
  reset(): void;
  readonly state: CameraState;
  dispose(): void;
}

export function createCameraControls(
  camera: THREE_NS.PerspectiveCamera,
  el: HTMLElement,
): CameraControls {
  let fit = fitDistance(0.3, camera.fov);
  let centerY = 0.1;
  let treeHeight = 0;
  let auto = true;
  const state: CameraState = {
    azimuth: FRONT_AZIMUTH,
    elevation: INITIAL_ELEVATION_DEG,
    distance: fit,
    targetY: centerY,
  };

  const apply = (): void => {
    const az = (state.azimuth * Math.PI) / 180;
    const el2 = (state.elevation * Math.PI) / 180;
    const r = state.distance;
    camera.position.set(
      Math.sin(az) * Math.cos(el2) * r,
      state.targetY + Math.sin(el2) * r,
      Math.cos(az) * Math.cos(el2) * r,
    );
    camera.lookAt(0, state.targetY, 0);
  };

  const reset = (): void => {
    auto = true;
    state.azimuth = FRONT_AZIMUTH;
    state.elevation = INITIAL_ELEVATION_DEG;
    state.distance = fit;
    state.targetY = centerY;
    apply();
  };

  let drag: { button: number; x: number; y: number } | null = null;
  const onDown = (e: PointerEvent): void => {
    if (e.button !== 1 && e.button !== 2) return;
    e.preventDefault();
    drag = { button: e.button, x: e.clientX, y: e.clientY };
    el.setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent): void => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    drag.x = e.clientX;
    drag.y = e.clientY;
    auto = false;
    if (drag.button === 2) {
      state.azimuth = wrapAzimuth(state.azimuth - dx * ROTATE_DEG_PER_PX);
      state.elevation = clampElevation(state.elevation + dy * ROTATE_DEG_PER_PX);
    } else {
      // 画面で上へドラッグ（dy が負）すると、見る高さが上がる（プラン 5章）
      state.targetY = clampTargetY(state.targetY - dy * HEIGHT_PER_PX * state.distance, treeHeight);
    }
    apply();
  };
  const onUp = (e: PointerEvent): void => {
    if (drag && el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    drag = null;
  };
  const onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    auto = false;
    state.distance = clampDistance(state.distance * Math.exp(e.deltaY * ZOOM_PER_WHEEL), fit);
    apply();
  };
  const onKey = (e: KeyboardEvent): void => {
    if ((e.key === 'r' || e.key === 'R') && !e.ctrlKey && !e.metaKey && !e.altKey) reset();
  };
  const onMenu = (e: Event): void => e.preventDefault();

  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('wheel', onWheel, { passive: false });
  el.addEventListener('contextmenu', onMenu);
  window.addEventListener('keydown', onKey);
  apply();

  return {
    setBounds(cy, radius, height) {
      fit = fitDistance(radius, camera.fov);
      treeHeight = height;
      // 見る高さは 0〜木の高さに収める（鉢を含めた中心が負になっても範囲を外れない）
      centerY = clampTargetY(cy, treeHeight);
      if (auto) {
        state.distance = fit;
        state.targetY = centerY;
        apply();
      } else {
        state.distance = clampDistance(state.distance, fit);
        state.targetY = clampTargetY(state.targetY, treeHeight);
      }
    },
    apply,
    reset,
    get state() {
      return { ...state };
    },
    dispose() {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('contextmenu', onMenu);
      window.removeEventListener('keydown', onKey);
    },
  };
}
