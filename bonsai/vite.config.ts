import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  plugins: [viteSingleFile()],
  // Three.js はビルドに含めず、index.html の import map で CDN から読む（ink-render のプラン）
  build: { outDir: 'dist', rollupOptions: { external: ['three'] } },
});
