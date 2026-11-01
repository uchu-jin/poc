// 保存データ bonsai.save.v1 の型。要件 付録 A.5 の形。
// ADR-0001: nextId と節の boostUntil・wire を足し、parent は親の id を指す（選ばなかった案は docs/adr/0001-*.md）

export type Vec3 = [number, number, number];

export interface Traits {
  straightness: number;
  branchiness: number;
  spread: number;
  leafSize: number;
}

export interface Leaf {
  size: number;
  /** 摘んだあと生え直す age。摘んでいなければ null */
  regrowAt: number | null;
}

export interface Wire {
  /** 針金が外れる age */
  until: number;
  /** その節で曲げた回転軸（長さ1） */
  axis: Vec3;
  /** その節で曲げた角度（ラジアン、0〜π） */
  angle: number;
}

export interface TreeNode {
  id: number;
  /** 親の id。根元は -1 */
  parent: number;
  pos: Vec3;
  dir: Vec3;
  length: number;
  radius: number;
  bornAge: number;
  /** 頂芽を持つか */
  bud: boolean;
  /** 剪定の芽吹きブーストが切れる age。なければ null */
  boostUntil: number | null;
  wire: Wire | null;
  leaves: Leaf[];
}

export interface SaveData {
  version: 1;
  seed: number;
  rngState: number;
  createdAt: number;
  lastTickAt: number;
  age: number;
  water: number;
  traits: Traits;
  nextId: number;
  nodes: TreeNode[];
}
