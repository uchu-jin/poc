import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 外部へ通信する middleware は置かない（docs/rules/security.md）
export default defineConfig({
  plugins: [react()],
});
