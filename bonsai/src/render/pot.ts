// 鉢と土（A.4）：濃い灰色の簡素な鉢。土の色は水分で薄い茶灰〜濃い茶灰（FR-026 の土の色）。
import { createPotMaterial, createPotOutlineMaterial, type SharedUniforms } from './ink-material';
import { soilColor } from './soil-color';
import type { Three, THREE_NS } from './three-types';

/**
 * 鉢の半径と深さ（土の面の高さ y = 0 が木の根元）。
 * 作者の指摘（鉢が大きい。2026-10-25）で、成長の単位（鉢の直径＝1）より小さく描く。成長の数値は変えない
 */
export const POT_RADIUS = 0.32;
export const SOIL_RADIUS = 0.295;
export const POT_DEPTH = 0.16;

export interface Pot {
  group: THREE_NS.Group;
  setWater(water: number): void;
}

export function createPot(THREE: Three, shared: SharedUniforms): Pot {
  const group = new THREE.Group();
  // 鉢：縁が少し張り出した浅い鉢を回転体で作る
  const profile = [
    new THREE.Vector2(POT_RADIUS * 0.76, -POT_DEPTH),
    new THREE.Vector2(POT_RADIUS * 0.84, -POT_DEPTH + 0.015),
    new THREE.Vector2(POT_RADIUS - 0.012, -0.015),
    new THREE.Vector2(POT_RADIUS, 0.008),
    new THREE.Vector2(POT_RADIUS - 0.02, 0.012),
    new THREE.Vector2(SOIL_RADIUS, -0.005),
  ];
  const potGeom = new THREE.LatheGeometry(profile, 64);
  const pot = new THREE.Mesh(potGeom, createPotMaterial(THREE, shared));
  const potOutline = new THREE.Mesh(potGeom, createPotOutlineMaterial(THREE, shared));
  group.add(potOutline, pot);

  const soilMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(...soilColor(100)) });
  const soil = new THREE.Mesh(new THREE.CircleGeometry(SOIL_RADIUS, 48), soilMat);
  soil.rotation.x = -Math.PI / 2;
  soil.position.y = -0.004;
  group.add(soil);

  return {
    group,
    setWater(water) {
      soilMat.color.setRGB(...soilColor(water));
    },
  };
}
