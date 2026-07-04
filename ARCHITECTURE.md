# 技术架构文档

> 狗头军师/Marshal 的技术架构说明 — 2026-06-22

---

## 概览

狗头军师是一个基于 Electron 的桌面应用，采用 pnpm monorepo 架构，支持 Windows（主要）/macOS/Linux。应用分为主进程（Node.js）和渲染进程（React），通过 tRPC 进行类型安全的 IPC 通信。

**技术栈：**
- Electron 33
- React 18 + TypeScript
- Vite 6（构建工具）
- tRPC（类型化 IPC）
- Zustand（状态管理）
- xterm.js（终端模拟器）
- node-pty（伪终端）

---

## Monorepo 结构

```
marshal/
├── apps/
│   ├── main/              # Electron 主进程
│   │   ├── src/
│   │   │   ├── index.ts   # 入口 + 窗口管理 + tRPC server
│   │   │   └── pty/       # PTY 池管理
│   │   ├── build.mjs      # esbuild 构建脚本
│   │   └── package.json   # type: "module" (ESM)
│   └── renderer/          # React 渲染进程
│       ├── src/
│       │   ├── App.tsx    # 根组件
│       │   ├── features/  # 功能模块
│       │   │   ├── agents/     # Agent 管理（Tabstrip、创建逻辑）
│       │   │   ├── files/      # 文件浏览（列表/宫格、Markdown 编辑）
│       │   │   ├── settings/   # 设置面板
│       │   │   ├── sidebar/    # 侧边栏导航
│       │   │   └── terminal/   # 终端区（TerminalArea、Terminal）
│       │   └── stores/         # Zustand stores
│       │       ├── agents.ts   # Agent 会话管理
│       │       ├── layout.ts   # 布局状态
│       │       ├── settings.ts # 用户配置
│       │       └── theme.ts    # 主题切换
│       └── package.json
├── packages/
│   ├── core/              # 核心状态机（AgentSession、CwdTracker）
│   ├── ipc-contract/      # tRPC 路由定义（类型契约）
│   ├── shared-types/      # 共享类型定义
│   └── design-tokens/     # 主题 tokens（dark/sepia/light）
├── electron-builder.json  # 打包配置
└── pnpm-workspace.yaml
```

---

## 核心模块

### 1. 主进程（apps/main）

**职责：**
- 窗口生命周期管理
- PTY 进程管理（spawn/write/kill/resize）
- 文件系统操作（readdir/readFile/writeFile）
- tRPC server 实现

**关键文件：**
- `src/index.ts`：Electron 主入口，创建 BrowserWindow，注册 tRPC handlers
- `src/pty/manager.ts`：PtyManager 类，管理多个 PTY 进程，emit data/exit 事件

**构建：**
- 使用 esbuild 打包为单文件 `dist/index.js`（ESM）
- 外部依赖：electron、node-pty（原生模块，不打包）
- preload 脚本单独打包为 `dist/preload.cjs`（CJS）

### 2. 渲染进程（apps/renderer）

**职责：**
- UI 渲染（React）
- 用户交互逻辑
- 状态管理（Zustand）
- tRPC client 调用

**关键模块：**

#### Features（功能模块）

**agents/**
- `Tabstrip.tsx`：顶栏 agent 切换器（logo + tabs + 新建按钮）
- `useCreateAgent.ts`：创建 agent 的业务逻辑（hook）
- `HistoryMenu.tsx`：历史对话下拉菜单（计划中）

**files/**
- `FilesArea.tsx`：文件浏览区（列表/宫格视图、排序、系统图标）
- `MarkdownEditor.tsx`：Markdown WYSIWYG 编辑器（Milkdown Crepe）
- `MarkdownPanel.tsx`：Markdown 编辑器面板容器

**terminal/**
- `TerminalArea.tsx`：终端区域容器（空态/有会话态）
- `Terminal.tsx`：单个终端实例（xterm.js 封装）

**sidebar/**
- `Sidebar.tsx`：侧边栏导航（快速入口、历史项目、收藏、设置按钮）

**settings/**
- `SettingsPanel.tsx`：设置面板（模态 + tab 导航）

#### Stores（Zustand 状态管理）

**agents.ts**
- 管理所有 agent 会话（sessions: AgentSession[]）
- 当前活动 agent（activeId）
- 添加/移除/切换 session

**layout.ts**
- 侧边栏折叠状态
- 分隔条宽度（sidebar-w、agent-w、files-w）

**settings.ts**
- 通用配置（claudePath、startDir、defaultShell、theme）
- 终端配置（fontFamily、fontSize、cursorStyle、cursorBlink、scrollback）

**theme.ts**
- 当前主题（dark/sepia/light）
- 主题切换与 CSS 变量应用

### 3. 核心包（packages/core）

**AgentSession（状态机）**
- 状态：idle、running、awaiting-confirm、exited
- 字段：id、cwd、status、ptyId、resume、resumeSessionId

**CwdTracker（目录跟踪）**
- 三层跟踪：initial cwd（spawn 参数）、PTY cd 命令检测、periodic `pwd` 轮询
- 提供 `getCurrentCwd()` 方法

### 4. IPC 契约（packages/ipc-contract）

**tRPC 路由定义：**
- `pty.*`：PTY 操作（spawn、write、kill、resize）
- `fs.*`：文件系统（readdir、readFile、writeFile、getFileIcon）
- `shell.*`：Shell 操作（openInSystem）
- `claude.*`：Claude CLI 操作（getRecentClaudeDirs、listSessions）

**类型安全：**
- 主进程实现 router，渲染进程通过 `trpc.*.query()` / `trpc.*.mutate()` 调用
- 自动类型推断，无需手动同步类型

### 5. 设计 tokens（packages/design-tokens）

**主题定义：**
- `darkTheme`：暗色主题（专注工作）
- `sepiaTheme`：护眼米色主题（长时间阅读）
- `lightTheme`：亮色主题（强光环境）

**导出：**
- `Theme` 接口（所有 CSS 变量）
- `ThemeName` 类型（'dark' | 'sepia' | 'light'）

---

## 数据流

### PTY 数据流（终端输出）

```
用户输入
  ↓
Terminal.tsx (xterm.js)
  ↓
trpc.pty.write.mutate({ ptyId, data })
  ↓
主进程 PtyManager.write(ptyId, data)
  ↓
node-pty 进程
  ↓
PTY 输出（data 事件）
  ↓
主进程 emit('data', { ptyId, data })
  ↓
渲染进程监听（通过 contextBridge）
  ↓
Terminal.tsx xterm.write(data)
```

### Agent 创建流程

```
用户点击「新建」
  ↓
Tabstrip.tsx 调用 createAgent()
  ↓
useCreateAgent.createInCurrentDir()
  ↓
1. 创建 AgentSession 对象（生成 id）
2. addSession(session) 加入 Zustand store
3. setActiveId(session.id) 切换到新 agent
  ↓
TerminalArea.tsx 检测到新 session
  ↓
handleTerminalReady() 回调
  ↓
trpc.pty.spawn.mutate({ cwd, claudePath })
  ↓
主进程创建 PTY 进程
  ↓
返回 ptyId，更新 session.ptyId
  ↓
Terminal.tsx 渲染终端，开始接收输出
```

### 文件浏览联动

```
用户切换 agent tab
  ↓
Tabstrip.tsx setActiveId(newId)
  ↓
agents store 更新 activeId
  ↓
FilesArea.tsx 监听 activeId 变化
  ↓
useEffect(() => {
  const session = sessions.find(s => s.id === activeId);
  if (session) setCurrentPath(session.cwd);
}, [activeId])
  ↓
currentPath 更新
  ↓
trpc.fs.readdir.query({ path: currentPath })
  ↓
更新文件列表显示
```

### 主题切换流程

```
用户在设置面板选择主题
  ↓
SettingsPanel.tsx 调用 setTheme(newTheme)
  ↓
theme store 更新 theme 值
  ↓
localStorage.setItem('marshal.theme', newTheme)
  ↓
App.tsx useEffect 监听 theme 变化
  ↓
applyTheme(theme)
  ↓
遍历 themes[theme] 的所有 CSS 变量
  ↓
document.documentElement.style.setProperty(key, value)
  ↓
整个应用的 CSS 变量更新
  ↓
所有使用 var(--*) 的元素立即重新渲染
```

---

## Agent 状态检测与标题联动（Claude Code Hook）

Agent 的状态（处理中 / 待确认 / 该你了）和 tab 标题随 `/rename` 联动，**由 Claude Code 官方 hook 机制驱动**，取代早期脆弱的终端输出正则匹配（误报频发）。

### 整体链路

```
spawn 前：useCreateAgent 用 crypto.randomUUID() 生成 claudeSessionId
  ↓
启动命令：claude --settings <hooks.settings.json> --session-id <uuid>
  （恢复对话用 --resume <id>；id 在 spawn 前已知 → hook 事件可精确对应 tab）
  ↓
主进程 startHookServer：127.0.0.1 临时端口 + 随机 token 的本地 HTTP server
  ↓
Claude 触发 hook（Notification / Stop / SessionStart）→ POST 到本地 server
  ↓
主进程 onEvent：
  - send('claude-hook', evt) → 渲染端按 session_id 映射 tab，翻状态
  - 按 session_id 定位 transcript 文件，装 fs.watch 监听 /rename
  ↓
transcript 变化（含 /rename 写入 custom-title）→ 去抖后 peekSession 重读标题
  ↓
send('claude-title', sessionId, title) → 渲染端更新 tab 名与 term-bar
```

### 关键设计与踩过的坑

**为何用 hook 而非正则**：终端输出五花八门，正则匹配"是否在等确认"误报频发。Claude Code 的 Notification/Stop hook 是权威信号。渲染端的输出忙/闲启发式（`Terminal.tsx`）仅作 hook 不可用时的兜底。

**`--settings <file>` 不污染全局**：hook 配置写到 app 专属临时目录（`os.tmpdir()/marshal-hooks/hooks.settings.json`），经 `--settings` 指向，不碰用户的 `~/.claude/settings.json`。

**`--session-id` 预知 id**：新建会话用 `crypto.randomUUID()` 生成并经 `--session-id` 强制指定。claude 采纳该 id 作为 hook payload 的 `session_id` 与 transcript 文件名（`<uuid>.jsonl`），无需事后抓取，hook 事件按 id 精确对应 tab。`--resume <id>` 与 `--session-id` 互斥，恢复用前者。

**端口时序（曾导致 `Stop hook error: typo in url or port`）**：`server.listen(0)` 是**异步**绑定，绑定完成前 `server.address().port` 为 `0`。早期代码同步读端口 → settings 写出 `http://127.0.0.1:0/...`，claude 连不上。修复：读端口 + 写 settings 全部移入 `listen(..., callback)` 回调，并暴露 `ready: Promise<void>` 在文件写好后 resolve；`getHookSettingsPath` query `await ready` 后才返回路径，保证 claude 启动时 settings 已带真实端口。

**transcript_path 不可依赖**：实测 v2.1.185，部分 hook 事件 payload 的 `transcript_path` 为 `null`（headless 下 SessionStart/Notification 甚至不触发，只有 Stop 稳定）。早期 `if (evt.session_id && evt.transcript_path)` 守卫因此短路 → fs.watch 永不装载 → `/rename` 写进了文件（历史列表读得到）但 tab 实时不变。修复：不依赖 payload，新增 `resolveTranscriptPath` 按 `<session-id>.jsonl` 枚举 `~/.claude/projects/*` 自行定位；按 session-id 去重；装 watcher 时**立即 peek 一次**标题，覆盖"先 rename 后回复"的时序。

**transcript 字段格式（随 claude 版本漂移，由 `peek-session.test.ts` 锁定）**：
- 标题优先级：`custom-title`（用户 `/rename`，最高）> `ai-title`（AI 自动）> 首条真人输入。
- 首条真人输入判据：`type:"user"` + `isSidechain:false` + `promptSource:"typed"`（老版回落 `origin.kind:"human"`）；工具结果回灌是 `promptSource:null` + 数组 content，须排除。
- 首行常为 `type:"mode"` 无 cwd，须逐行扫到第一个有 cwd 的行；listSessions 须逐文件 peek，不能"探目录首文件不符就跳过整目录"。

### 涉及文件

- `apps/main/src/hooks/server.ts`：本地 HTTP hook server + 写 settings
- `apps/main/src/index.ts`：hook 事件分发、transcript 定位与 fs.watch、标题去抖重读
- `apps/main/src/preload.ts`：`claudeEvents`（onHook/onTitle）经 contextBridge 暴露
- `apps/renderer/src/features/terminal/TerminalArea.tsx`：按 `claudeSessionId` 映射 tab，翻状态 / 改名
- `packages/ipc-contract/src/index.ts`：`peekSession`（解析 transcript 取 cwd + 标题）、`listSessions`、`getHookSettingsPath`
- `packages/ipc-contract/src/peek-session.test.ts`：锁定 transcript 字段格式的回归测试

---

## 构建与打包

### 开发模式

```bash
pnpm dev
```

**执行流程：**
1. `pnpm --filter @marshal/renderer dev`：启动 Vite dev server（端口 5173）
2. `wait-on http://localhost:5173`：等待 Vite 就绪
3. `pnpm --filter @marshal/main dev`：
   - 执行 `build.mjs --watch`（esbuild watch 模式）
   - 启动 `electron .`

**热更新：**
- 渲染进程：Vite HMR（保留状态）
- 主进程：需要手动重启 Electron（或使用 nodemon）

### 生产构建

```bash
pnpm build              # 构建所有包
pnpm build:win          # 打包 Windows 安装包
pnpm build:mac          # 打包 macOS DMG
pnpm build:linux        # 打包 Linux AppImage
```

**electron-builder 配置：**
- Windows: NSIS 安装包 + Portable 便携版
- macOS: DMG 映像 + ZIP 压缩包
- Linux: AppImage
- 产物命名：`狗头军师-{version}-{platform}-{arch}.{ext}`

**ASAR 打包：**
- 应用代码打包为 `app.asar`（加速启动）
- `node-pty` 原生模块不打包（asarUnpack 配置）

---

## 关键技术决策

### 1. 为什么用 tRPC 而不是 contextBridge？

**优势：**
- 类型安全：渲染进程调用自动推断类型，无需手动同步
- 开发体验：写一次定义，两端类型自动同步
- 重构友好：重命名参数/返回值，TypeScript 会报错提示所有调用处

**劣势：**
- 略微增加包大小（tRPC runtime）
- 学习曲线（需要理解 tRPC 概念）

**结论：**对于多路由、复杂类型的 IPC 场景，tRPC 收益远大于成本。

### 2. 为什么用 Zustand 而不是 Redux？

**优势：**
- 轻量：核心 1KB，无 boilerplate
- 简单：直接修改 state，不需要 reducer/action
- TypeScript 友好：自动推断类型
- 选择性订阅：组件只订阅需要的字段，避免无效渲染

**劣势：**
- 社区生态不如 Redux
- DevTools 支持较弱

**结论：**对于中小型应用，Zustand 的简洁性和性能优势明显。

### 3. 为什么主进程用 ESM 而不是 CJS？

**优势：**
- 统一模块系统：渲染进程已是 ESM（Vite），主进程也用 ESM 减少认知负担
- 原生 top-level await：异步初始化代码更简洁
- 未来趋势：Node.js 和 Electron 都在推 ESM

**劣势：**
- `__dirname` 不可用（需要 polyfill）
- 部分老旧包不支持 ESM import

**解决方案：**
- 用 esbuild 打包主进程为单文件，解决依赖兼容问题
- polyfill `__dirname` 为 `path.dirname(fileURLToPath(import.meta.url))`

### 4. 为什么用 Milkdown Crepe 而不是其他编辑器？

**对比：**
- **Monaco Editor**：代码编辑器，不适合 Markdown WYSIWYG
- **Tiptap**：需要自己实现 Markdown 序列化/反序列化
- **Milkdown Crepe**：开箱即用的 Markdown WYSIWYG，内置工具栏

**优势：**
- 真正的 WYSIWYG（不是分屏预览）
- 完整的 CommonMark + GFM 支持
- 可定制工具栏和主题
- 较小的包体积（相比 Monaco）

**劣势：**
- 社区较小
- 文档不够完善（需要读源码）

**结论：**对于 Markdown 编辑场景，Crepe 是最合适的选择。

---

## 性能优化

### 1. 文件图标缓存

**问题：**系统图标需要主进程调用 `app.getFileIcon()`，每次切换目录重新请求所有图标会很慢。

**解决：**
- 渲染进程用 `useRef<Map<string, string>>` 缓存已获取的图标（path → dataURL）
- 批量请求当前目录所有文件的图标，一次性缓存
- 切换回已访问的目录，直接从缓存读取

### 2. Zustand 选择性订阅

**问题：**如果组件订阅整个 store，任何字段变化都会触发重渲染。

**解决：**
```tsx
// ❌ 订阅整个 store
const store = useAgentsStore();

// ✅ 只订阅需要的字段
const activeId = useAgentsStore((s) => s.activeId);
const sessions = useAgentsStore((s) => s.sessions);
```

### 3. xterm.js WebGL 渲染

xterm.js 默认使用 Canvas 渲染，大量文本输出时性能不佳。启用 WebGL 渲染器：

```tsx
import { WebglAddon } from '@xterm/addon-webgl';

const terminal = new Terminal();
terminal.loadAddon(new WebglAddon());
```

**收益：**处理大量终端输出时 FPS 提升 2-3 倍。

---

## 安全性

### 1. Context Isolation

Electron 默认启用 context isolation，渲染进程无法直接访问 Node.js API。所有 IPC 通过 preload 脚本暴露的 `window.electron` 对象。

### 2. nodeIntegration: false

禁用 nodeIntegration，防止渲染进程直接执行 Node.js 代码（XSS 攻击向量）。

### 3. CSP（内容安全策略）

Vite dev 模式下需要允许 `script-src 'unsafe-eval'`（HMR 需要），生产环境移除。

### 4. 文件路径校验

文件系统操作（readdir/readFile/writeFile）在主进程校验路径，防止路径穿越攻击：

```ts
if (path.includes('..')) {
  throw new Error('Invalid path');
}
```

---

## 测试策略

### 单元测试

**覆盖范围：**
- 核心状态机（AgentSession、CwdTracker）
- 纯函数工具（formatRelTime、parseTitle）

**工具：**Vitest

### 集成测试

**覆盖范围：**
- tRPC 路由（spawn/write/readdir）
- Zustand store 操作

### E2E 测试（计划中）

**工具：**Playwright + Electron

**场景：**
- 创建 agent → 执行命令 → 切换 agent
- 文件浏览 → 点击 Markdown 文件 → 编辑 → 保存

---

## 未来改进

### 1. 会话持久化

**问题：**应用重启后所有 agent 会话丢失。

**方案：**
- 序列化 sessions 到 `localStorage['marshal.sessions']`
- 启动时恢复会话（不恢复 PTY，只恢复元数据）
- 用户点击 tab 时重新 spawn PTY

### 2. 文件改动监听

**方案：**
- 主进程用 chokidar 监听当前目录
- 文件变化时通过 IPC 通知渲染进程
- FilesArea 更新对应文件的状态标记

### 3. 多窗口支持

**方案：**
- 每个窗口独立的 sessions store
- 主进程统一管理所有 PTY 进程
- 窗口间通过 IPC 同步 agent 状态

---

## 参考资料

- [Electron 文档](https://www.electronjs.org/docs/latest/)
- [tRPC 文档](https://trpc.io/)
- [xterm.js 文档](https://xtermjs.org/)
- [Zustand 文档](https://docs.pmnd.rs/zustand/)
- [Milkdown 文档](https://milkdown.dev/)
