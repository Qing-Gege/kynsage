/// <reference types="vite/client" />

// 构建期由 vite.config.ts 的 define 注入，值取自仓库根 package.json 的 version
declare const __APP_VERSION__: string;
