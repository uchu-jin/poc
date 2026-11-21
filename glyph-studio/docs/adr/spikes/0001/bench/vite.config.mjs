// ADR-0001 検証用: spike2.mjs の node:fs をブラウザ用の空モジュールに差し替える
import { fileURLToPath } from 'node:url';
export default { root: fileURLToPath(new URL('.', import.meta.url)), resolve: { alias: { 'node:fs': fileURLToPath(new URL('./fs-stub.mjs', import.meta.url)) } }, build: { outDir: 'dist', emptyOutDir: true } };
