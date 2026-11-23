// ADR-0001: 膨らませた図形と端・角の図形を clipper-lib でまとめる。座標は 10 倍の整数、塗り方は NonZero、
// 向きを揃えてから渡す。clipper-lib に渡す配列は毎回作り直す（選ばなかった案と理由は docs/adr/0001-skeleton-to-outline.md）
import ClipperLib from 'clipper-lib';
import { signedArea } from './geometry';
import type { Outline, Poly, Ring } from './types';

const SCALE = 10;

/** clipper-lib のクリッパーのうち、使う分だけの形。テストでは失敗するものを渡す */
export type ClipperLike = {
  AddPaths(paths: { X: number; Y: number }[][], polyType: number, closed: boolean): boolean;
  Execute(
    clipType: number,
    solution: { X: number; Y: number }[][],
    subjFillType: number,
    clipFillType: number,
  ): boolean;
};
export type MakeClipper = () => ClipperLike;

export const defaultMakeClipper: MakeClipper = () => new ClipperLib.Clipper();

export type UnionResult = { ok: true; outline: Outline } | { ok: false; message: string };

/** 各図形の先頭のリングを反時計回り、残り（穴）を時計回りにした写しを作る */
function normalize(polys: Poly[]): Ring[] {
  const rings: Ring[] = [];
  for (const poly of polys)
    poly.forEach((ring, i) => {
      if (ring.length < 3) return;
      const ccw = signedArea(ring) > 0;
      const wantCcw = i === 0;
      const copy: Ring = ring.map((p) => [p[0], p[1]]);
      rings.push(ccw === wantCcw ? copy : copy.reverse());
    });
  return rings;
}

export function unionPolys(
  polys: Poly[],
  makeClipper: MakeClipper = defaultMakeClipper,
): UnionResult {
  try {
    const paths = normalize(polys).map((ring) =>
      ring.map(([x, y]) => ({ X: Math.round(x * SCALE), Y: Math.round(y * SCALE) })),
    );
    const clipper = makeClipper();
    clipper.AddPaths(paths, ClipperLib.PolyType.ptSubject, true);
    const solution: { X: number; Y: number }[][] = [];
    const ok = clipper.Execute(
      ClipperLib.ClipType.ctUnion,
      solution,
      ClipperLib.PolyFillType.pftNonZero,
      ClipperLib.PolyFillType.pftNonZero,
    );
    if (!ok) return { ok: false, message: 'clipper-lib の Execute が false を返した' };
    const outline: Outline = [];
    for (const path of solution) {
      const ring: Ring = [];
      for (const pt of path) {
        const p: [number, number] = [pt.X / SCALE, pt.Y / SCALE];
        const last = ring[ring.length - 1];
        if (!last || last[0] !== p[0] || last[1] !== p[1]) ring.push(p);
      }
      const first = ring[0];
      const last = ring[ring.length - 1];
      if (ring.length > 1 && first && last && first[0] === last[0] && first[1] === last[1])
        ring.pop();
      if (ring.length >= 3 && signedArea(ring) !== 0) outline.push(ring);
    }
    return { ok: true, outline };
  } catch (e) {
    return {
      ok: false,
      message: `clipper-lib が例外を投げた: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}
