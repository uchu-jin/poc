// clipper-lib 6.4.2 には型がないので、glyph-studio で使う分だけ書く
declare module 'clipper-lib' {
  export interface IntPoint {
    X: number;
    Y: number;
  }
  export type Path = IntPoint[];
  export type Paths = Path[];

  export class Clipper {
    AddPaths(paths: Paths, polyType: number, closed: boolean): boolean;
    Execute(clipType: number, solution: Paths, subjFillType: number, clipFillType: number): boolean;
  }

  const ClipperLib: {
    Clipper: typeof Clipper;
    Paths: new () => Paths;
    PolyType: { ptSubject: number; ptClip: number };
    ClipType: { ctIntersection: number; ctUnion: number; ctDifference: number; ctXor: number };
    PolyFillType: {
      pftEvenOdd: number;
      pftNonZero: number;
      pftPositive: number;
      pftNegative: number;
    };
  };
  export default ClipperLib;
}
