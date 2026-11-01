// 和紙の背景（A.4）：生成り色に繊維のような淡いムラ、四隅をわずかに暗く。画面全体の板をいちばん奥に描く。
import type { Three, THREE_NS } from './three-types';

export const PAPER_COLOR: [number, number, number] = [0.953, 0.925, 0.863];

export function createBackground(THREE: Three): THREE_NS.Mesh {
  const material = new THREE.ShaderMaterial({
    depthWrite: false,
    depthTest: false,
    uniforms: {
      uPaper: { value: new THREE.Vector3(...PAPER_COLOR) },
      uResolution: { value: new THREE.Vector2(1, 1) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.9999, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uPaper;
      uniform vec2 uResolution;
      varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
      }
      void main() {
        vec2 px = vUv * uResolution;
        // 繊維：横に引き伸ばしたノイズを数段重ねる
        float fiber = noise(px * vec2(0.02, 0.15)) * 0.5 + noise(px * vec2(0.05, 0.4)) * 0.3 + noise(px * 0.6) * 0.2;
        vec3 col = uPaper * (0.97 + 0.05 * fiber);
        // 四隅をわずかに暗く
        vec2 d = vUv - 0.5;
        col *= 1.0 - 0.18 * smoothstep(0.35, 0.75, length(d));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return mesh;
}

export function setBackgroundSize(mesh: THREE_NS.Mesh, width: number, height: number): void {
  const m = mesh.material as THREE_NS.ShaderMaterial;
  (m.uniforms.uResolution!.value as THREE_NS.Vector2).set(width, height);
}
