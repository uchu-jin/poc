// three は CDN から動的 import で読むので、各部品には名前空間を引数で渡す。型だけをここで決める。
import type * as THREE_NS from 'three';

export type Three = typeof THREE_NS;
export type { THREE_NS };
