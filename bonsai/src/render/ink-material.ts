// 枝の墨のシェーダー（A.4）と輪郭線（inverted hull）。
// 伸びの補間（FR-010）：bornAge === 今の age の節は、先端の輪を dir × len × (1 − progress) だけ根元へ寄せる。
// にじみ（FR-038）：節ごとの開始時刻（aFade）から1秒で淡い墨→本来の濃さ。
import type { Three, THREE_NS } from './three-types';
import { PAPER_COLOR } from './background';

/** 見た目の数値（実装順 10 で作者と決める） */
export const INK = {
  /** 墨の3段階の濃さ（光の当たる側 → 影側） */
  tones: [0.72, 0.86, 0.97] as const,
  /** 枝先の淡さ（根元 1 に対する最小の濃さ） */
  tipLightness: 0.75,
  /** 輪郭線の太さ：太さに比例する部分と一定の部分 */
  outlineByRadius: 0.35,
  outlineConst: 0.0018,
  /** 輪郭線の強弱（節ごとの乱数の振れ幅） */
  outlineJitter: 0.8,
};

/** 左上からの光（ワールド座標） */
export const LIGHT_DIR: [number, number, number] = [-0.6, 0.75, 0.3];

const growthChunk = /* glsl */ `
  attribute vec3 aDir;
  attribute float aLen;
  attribute float aT;
  attribute float aBorn;
  attribute float aFade;
  uniform float uAge;
  uniform float uProgress;
  uniform float uTime;
  vec3 grownPosition(vec3 p) {
    float scale = abs(aBorn - uAge) < 0.5 ? clamp(uProgress, 0.0, 1.0) : 1.0;
    return p - aDir * aLen * aT * (1.0 - scale);
  }
  float fadeAmount() { return clamp((uTime - aFade) / 1.0, 0.0, 1.0); }
`;

export function sharedUniforms(THREE: Three) {
  return {
    uAge: { value: 0 },
    uProgress: { value: 1 },
    uTime: { value: 0 },
    uLight: { value: new THREE.Vector3(...LIGHT_DIR).normalize() },
    uPaper: { value: new THREE.Vector3(...PAPER_COLOR) },
  };
}

export type SharedUniforms = ReturnType<typeof sharedUniforms>;

export function createInkMaterial(THREE: Three, shared: SharedUniforms): THREE_NS.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...shared,
      uTones: { value: new THREE.Vector3(...INK.tones) },
      uTipLight: { value: INK.tipLightness },
    },
    vertexShader: /* glsl */ `
      ${growthChunk}
      attribute float aInk;
      varying float vInk;
      varying float vFade;
      varying vec3 vNormal;
      void main() {
        vInk = aInk;
        vFade = fadeAmount();
        vNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(grownPosition(position), 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uLight;
      uniform vec3 uPaper;
      uniform vec3 uTones;
      uniform float uTipLight;
      varying float vInk;
      varying float vFade;
      varying vec3 vNormal;
      void main() {
        float l = dot(normalize(vNormal), uLight);
        // 光の当たり方を3段階に区切って墨の濃度に割り当てる
        float tone = l > 0.45 ? uTones.x : (l > -0.1 ? uTones.y : uTones.z);
        // 根元ほど濃く、枝先ほど淡い
        float depth = mix(uTipLight, 1.0, vInk);
        // にじみ：淡い墨から本来の濃さへ
        float ink = tone * depth * mix(0.25, 1.0, vFade);
        gl_FragColor = vec4(mix(uPaper, vec3(0.06, 0.055, 0.05), ink), 1.0);
      }
    `,
  });
}

export function createOutlineMaterial(
  THREE: Three,
  shared: SharedUniforms,
): THREE_NS.ShaderMaterial {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
      ...shared,
      uByRadius: { value: INK.outlineByRadius },
      uConst: { value: INK.outlineConst },
      uJitter: { value: INK.outlineJitter },
    },
    vertexShader: /* glsl */ `
      ${growthChunk}
      attribute float aRadius;
      uniform float uByRadius;
      uniform float uConst;
      uniform float uJitter;
      varying float vFade;
      void main() {
        vFade = fadeAmount();
        // 筆の強弱：位置に沿ってなだらかに変わる波で太さを揺らす。
        // 節ごとの乱数で揺らすと、隣の節と急に太さが変わってギザギザの帯に見えたため（作者の指摘 2026-10-25）
        float wave = 0.5 + 0.5 * sin(dot(position, vec3(23.0, 31.0, 17.0)));
        float w = (aRadius * uByRadius + uConst) * (1.0 - uJitter * 0.5 + uJitter * wave);
        vec3 p = grownPosition(position) + normal * w;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uPaper;
      varying float vFade;
      void main() {
        gl_FragColor = vec4(mix(uPaper, vec3(0.04, 0.035, 0.03), mix(0.3, 0.95, vFade)), 1.0);
      }
    `,
  });
}

/** 鉢の墨のシェーダー（作者の指摘 2026-10-25：鉢を墨の質感に）。光を3段階に区切り、淡い墨のムラを足す */
export const POT_INK = { tones: [0.42, 0.55, 0.7] as const, outline: 0.006 };

export function createPotMaterial(THREE: Three, shared: SharedUniforms): THREE_NS.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uLight: shared.uLight,
      uPaper: shared.uPaper,
      uTones: { value: new THREE.Vector3(...POT_INK.tones) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vPos;
      void main() {
        vNormal = normalize(mat3(modelMatrix) * normal);
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uLight;
      uniform vec3 uPaper;
      uniform vec3 uTones;
      varying vec3 vNormal;
      varying vec3 vPos;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main() {
        float l = dot(normalize(vNormal), uLight);
        float tone = l > 0.35 ? uTones.x : (l > -0.15 ? uTones.y : uTones.z);
        // 刷毛で塗ったような縦のムラ
        float ang = atan(vPos.z, vPos.x);
        // 刷毛の縦の筋：角度方向に細かいノイズ、高さ方向にはゆるやか
        float streak = hash(vec2(floor(ang * 90.0), 0.0));
        float brush = 0.94 + 0.08 * (streak - 0.5) + 0.03 * sin(vPos.y * 40.0 + streak * 6.0);
        gl_FragColor = vec4(mix(uPaper, vec3(0.06, 0.055, 0.05), clamp(tone * brush, 0.0, 1.0)), 1.0);
      }
    `,
  });
}

export function createPotOutlineMaterial(
  THREE: Three,
  shared: SharedUniforms,
): THREE_NS.ShaderMaterial {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: { uPaper: shared.uPaper, uWidth: { value: POT_INK.outline } },
    vertexShader: /* glsl */ `
      uniform float uWidth;
      void main() {
        float wave = 0.6 + 0.4 * sin(position.x * 19.0 + position.z * 13.0);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position + normal * uWidth * wave, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uPaper;
      void main() { gl_FragColor = vec4(mix(uPaper, vec3(0.04, 0.035, 0.03), 0.92), 1.0); }
    `,
  });
}
