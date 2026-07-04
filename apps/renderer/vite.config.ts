import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { readFileSync } from 'node:fs';

// 版本号唯一真源：仓库根 package.json。构建期注入 __APP_VERSION__，
// 避免设置面板里手写版本号随发布漂移。
const rootPkg = JSON.parse(readFileSync(path.resolve(__dirname, '../../package.json'), 'utf-8'));

export default defineConfig({
  plugins: [react()],
  root: __dirname,
  define: {
    __APP_VERSION__: JSON.stringify(rootPkg.version),
  },
  // 打包后主进程用 file:// 加载 index.html，资源必须是相对路径
  // （绝对路径 /assets 会被解析到文件系统根目录导致黑屏）
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@marshal/core': path.resolve(__dirname, '../../packages/core/src'),
      '@marshal/ipc-contract': path.resolve(__dirname, '../../packages/ipc-contract/src'),
      '@marshal/shared-types': path.resolve(__dirname, '../../packages/shared-types/src'),
      '@marshal/design-tokens': path.resolve(__dirname, '../../packages/design-tokens/src'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      usePolling: true,
      interval: 1000,
    },
  },
});
