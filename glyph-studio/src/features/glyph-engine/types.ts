// 骨格・パラメータ・輪郭の型。座標は 1 em = 1000 単位、y は上向き

export type Point = { id: string; x: number; y: number };

export type Segment =
  { kind: 'line'; to: Point } | { kind: 'cubic'; c1: Point; c2: Point; to: Point };

/** 骨格の線。closed のときは最後の区間の終点が始点と同じ位置に戻る */
export type Stroke = { start: Point; segments: Segment[]; closed?: boolean };

export type Skeleton = { strokes: Stroke[] };

export type Terminal = 'flat' | 'round' | 'slab';
export type Join = 'miter' | 'round';

export type Params = {
  /** 太さ（縦線の太さ） */
  weight: number;
  /** 横線の太さ */
  hWeight: number;
  /** 幅（横方向の倍率） */
  width: number;
  /** 傾き（度） */
  slant: number;
  /** x ハイト */
  xHeight: number;
  /** 端の形 */
  terminal: Terminal;
  /** 角の丸み */
  join: Join;
};

export type Vec = [number, number];
/** 閉じた多角形（最後の点は最初の点と重複させない） */
export type Ring = Vec[];
/** 外側のリングと穴のリング（Poly は合成前の 1 つの図形。先頭が外側） */
export type Poly = Ring[];
/** 合成後の輪郭。外側は反時計回り、穴は時計回り */
export type Outline = Ring[];

export type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

export type FailureReason = 'invalid-skeleton' | 'union-failed' | 'empty-outline';

export type BuildResult =
  | {
      ok: true;
      outline: Outline;
      advanceWidth: number;
      bounds: Bounds | null;
      /** 輪郭を余白に合わせて横にずらした量（ハンドルを輪郭と同じ座標に置くため。プラン a-editor） */
      shiftX: number;
    }
  | { ok: false; reason: FailureReason; message: string };
