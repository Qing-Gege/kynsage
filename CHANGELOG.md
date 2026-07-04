# 变更日志

> 本文档记录狗头军师/Marshal 的主要功能迭代和设计改动。

---

## 2026-06-25 — 杂七杂八的修复（文件区 / 终端启动 / 布局）

> 起因：实际试用中的几处体验问题与 Windows 缺陷，逐项修复。除特别说明外均为前端改动。

### 文件区：支持粘贴外部复制的文件

之前应用的「粘贴」只认应用内部剪贴板（在应用里点过复制/剪切才有值），**从不读系统剪贴板**。于是在访达 / 资源管理器里 `Cmd/Ctrl+C` 的文件，回到文件区右键「粘贴」一直是灰的——macOS、Windows 同此缺陷。

- **`apps/main/src/preload.ts`**：`clipboardBridge` 新增 `readFilePaths()`，从系统剪贴板读被复制的文件路径。
  - macOS：读 `NSFilenamesPboardType`，从 plist 抽 `<string>` 路径（含 XML 实体解码）。
  - Windows：读 `CF_HDROP` buffer，按 `DROPFILES` 头解析（`pFiles` 偏移 + `fWide` 判 UTF-16，双 `\0` 结尾）。
- **`FilesArea.tsx`**：`paste()` 加回退——内部剪贴板为空时读系统剪贴板文件，`copyEntries` 进当前目录并 toast 提示；右键菜单打开时探测系统剪贴板（`openCtx`），「粘贴」可点状态改为 `内部剪贴板 || 系统有文件`。后端 `copyEntries` 未改，本就支持任意源路径。

### 文件区：键盘快捷键 Ctrl/Cmd + C / X / V

- **`FilesArea.tsx`**：根容器加 `tabIndex={0}` + `onKeyDown`，`handleFileClick` 显式 `focus()` 保证焦点落在文件区。`Ctrl/Cmd+C` 复制、`+X` 剪切当前选中文件，`+V` 粘贴（走已有 `paste()`，内部优先、否则系统剪贴板）；在 INPUT/TEXTAREA（如重命名框）里不抢键。CSS 去掉聚焦边框。

### 文件区：切 agent 标签时自动关闭 Markdown 面板

- **`FilesArea.tsx`**：订阅 `useAgentsStore` 的 `activeSessionId`，变化时 `setOpenMarkdown(null)`。打开方式仍是局部 state，无需重构。

### 文件区：目录实时监听，自动刷新

之前文件区只在 `currentPath`/`showHidden` 变化时重读，claude / 终端 / 外部在当前目录新建文件后不会自动出现，需手动切回目录。新增主进程 `fs.watch` → IPC 推送 → 文件区刷新的链路。

- **`apps/main/src/index.ts`**：维护「当前监听的单个目录」，`watchDir(path)` 切目录换监听；`fs.watch` 回调 250ms 去抖后 `webContents.send('fs-changed', path)`。
- **`packages/ipc-contract`**：新增 `watchDir` mutation（`{ path: string | null }`）。
- **`apps/main/src/preload.ts`**：监听 `fs-changed`，暴露 `fsEvents.onChange/offChange`。
- **`FilesArea.tsx`**：`currentPath` 变化时 `watchDir.mutate`；`fsEvents.onChange` 命中当前目录即 `refresh()`。

### 终端：确认结束后外框仍一直闪

「待确认」闪烁外框由 `awaiting-confirm` 状态驱动，清除依赖确认后 Claude 继续输出触发 `onProcessing`，但该回调被 `busyRef` 节流——确认时若 busy 未复位，确认后输出不再触发，确认态无人清除、外框长闪。

- **`Terminal.tsx`**：新增**无节流**的 `onActivity` 回调（每批输出都报，用 ref 持有最新闭包）。
- **`TerminalArea.tsx`**：`handleActivity` 在该 tab 处于 `awaiting-confirm` 且有输出时即置回 `running`，外框立刻停闪。原 hook `Stop`/busy 信号保留。

### 终端：Windows 下注入命令不执行（需手动回车）

新建 / 恢复 agent 时，应用把 `claude …` 命令写入 PTY，但命令出现后光标停在行内、不进对话，需手动按一次回车。根因是行尾用了 `\n`，而 **Windows conpty + PowerShell 只认 `\r`（回车）为「提交」**。

- **`TerminalArea.tsx`**：注入命令行尾 `\n` → `\r`（`\r` 在 *nix shell 同样有效）。
- **`TerminalArea.tsx`**：启动命令统一用裸 `claude`（`claudePath || 'claude'`），不再按平台拼 `claude.cmd`——Windows 上 claude 常以别名/函数/`.ps1`/`.exe` 提供，并不存在 `.cmd` 文件，硬拼会报「找不到命令」。需要自定义路径的用户可在设置「Claude 程序位置」填完整路径。

### 终端：默认字号 14 → 16

- **`stores/settings.ts`**：`DEFAULTS.fontSize` `14` → `16`。

### 布局：文件区首次打开偶发特别宽

CSS 默认 `--agent-w: 920px` 与 JS 初值 `innerWidth × 2/3` 不一致，且 `useResizable` 用 `useEffect`（首帧之后才写 CSS 变量），叠加 `.app-shell` 的 grid 过渡，导致初次加载文件区先按错误宽度渲染、再滑动改写——表现为偶发的特别宽。

- **`useResizable.ts`**：`useEffect` → `useLayoutEffect`，首帧绘制前写好宽度。
- **`App.css` / `App.tsx`**：`--agent-w` 默认 `920px` → `70vw`，并让 JS 初值 `agentInitial` 与之对齐（`innerWidth × 0.7`），CSS 默认与 JS 初值一致即不再首帧闪宽；`transition` 从 `.app-shell` 移到 `.app-shell.is-ready`，挂载后用一帧 `requestAnimationFrame` 才加 `is-ready` 开启过渡，初次加载不带动画、拖拽手感不变。

> 注：终端区（agent 区）初始占比定为窗口宽 70%，文件区取剩余空间（不小于侧栏宽）。

### 设置迁移

- **`stores/settings.ts`**：`SETTINGS_VERSION` 2 → 4。字号旧默认 `[13, 14]` → 16，仅覆盖仍是旧默认的字段，用户主动改过的值保留。

---

## 2026-06-23 — UI 配色去杂音 + 三区分面 + 视觉打磨（设计迭代）

> 起因：产品页面配色「跳」、不够干净高级。诊断后分三批落地，全程零逻辑改动、仅纯视觉/CSS，typecheck 全绿。

### 三区分面（核心）

之前侧栏 / 文件区 / agent 区三种不同底色，且**中间文件区最浅**会「跳」出来，看着像左右一组、中间另一组。

- **文件区改用侧栏色**：`.files-area-wrapper`、`.files-area` 背景 `var(--bg-panel)` → `var(--bg-sidebar)`，使**侧栏 + 顶栏 + 文件区连成一整张「浏览面」**。不动 `--bg-panel` token 本体（下拉菜单/设置面板/Markdown/右键菜单/tab hover 仍共用它）。
- **agent 区下沉**：`--bg-terminal` 改为比浏览面暗一档的「终端井」。终端 xterm 底色读 `--bg-terminal`，真实终端也跟着下沉。三套主题 + `:root` 兜底同步：
  | 主题 | 浏览面(=sidebar) | 终端井(--bg-terminal) |
  |---|---|---|
  | dark | `#100F0B` | `#0B0B07` |
  | sepia | `#E1DACA` | `#D9D1BD` |
  | light | `#FAFAF8` | `#F0F0EB` |

### 文件区图标去杂音

原生系统图标把 macOS **饱和蓝文件夹** + 彩虹应用图标渲进暖中性配色，破坏「唯一强调色」。

- **文件夹**：不再拉原生图标，永远用自绘线性字形（`FolderIcon`，与侧栏 `IconFolder` 同语言）；配柔和暖色 `color-mix(in srgb, var(--accent) 52%, var(--ink-3))`——暖、与文件有别、但不喊叫。预取 effect 只对 `f.isFile` 请求 `getFileIcon`，目录跳过（顺带省 IPC）。
- **文件**：保留可识别的原生类型图标（.docx/.pdf/.png），但 `filter: saturate(0.72) contrast(0.98)` 收敛霓虹饱和。
- **强调色归位「选中」**：`.file-row.is-selected` 用 `--accent-soft` 底 + 图标/文件名转 `var(--accent)`，选中的原生文件图标 `filter: none` 恢复本色聚焦。赤陶红只在 CTA / 选中 / active 三处，重获稀缺。
- **去账本线**：删除 `.file-row + .file-row` 的逐行 `border-top`，行 padding `8px`→`9px`，靠留白分隔。

### 视觉打磨（借鉴本地 fanbox 项目，挑纯 CSS·零风险项）

- **浮层双层阴影**：三套主题 `--shadow` 从单层廉价大模糊 → `0.5px 贴边描边 + 远柔光`。因右键菜单/历史下拉/设置面板都用 `var(--shadow)`，**改 token 一处即全部浮层升级**。
- **隐形 resizer**：分隔条平时仅 1px 细线，hover/拖动时 `::after` 浮起 accent 细线（略外扩易抓）。不碰 JS 拖拽逻辑。
- **图标藏光**：侧栏/文件区/标签的描边 svg 加极轻 `drop-shadow(0 0.5px ...)`，去纯平 web 矢量味。原生彩色文件图标不受影响。
- **数字等宽**：文件区时间/大小列加 `font-variant-numeric: tabular-nums`，扫视不跳。

### 终端「待确认」边缘呼吸

复用已建成的 Claude Code hook 状态管线（`session.state` 已有 `running / awaiting-confirm / exited / idle`），纯视觉消费——非新接数据源。

- agent 等用户确认时（`awaiting-confirm`），终端区根容器加 `is-awaiting`，边缘 **accent 内辉光轻呼吸**（`::after`，1.8s，沿用 `sig-pulse` 节奏），主动叫回注意力（对应 PRODUCT.md「确认状态强提示」）。
- `::after` 不挡点击、不改布局、z-index 低于 launcher 覆盖层。
- 带 `prefers-reduced-motion: reduce` 降级为静止 2px 描边。
- 只绑「待确认」一态：`running` 频繁、`idle` 无需催，避免满屏乱闪。

### 主动放弃（会引 bug/维护成本，待数据源/触点成熟再做）

- 文件改动「活仪表盘 / 写入涟漪 / liveZap」——依赖文件改动数据源（`getChangeMark` 当前返回 null）。
- 自绘 tooltip——需把每个 `title=` 逐个改 `data-tip`，触点多易漏。

### 改动文件

`packages/design-tokens/src/themes.ts`（+ 重建 dist）、`apps/renderer/src/App.css`、`apps/renderer/src/features/files/FilesArea.tsx`、`FilesArea.css`、`apps/renderer/src/features/terminal/TerminalArea.tsx`、`TerminalArea.css`。

---

## 2026-06-23 — 工作空间启动页重构 + 路径跳转 + 打开终端

### 新增功能

**侧边栏「跳转到路径」**
- 侧边栏「快速入口」上方新增常驻输入框，粘贴/输入目录路径回车直达
- 主进程新增 `fs.resolveDir`：兼容 Windows 习惯——剥掉「复制为路径」外包的成对引号、裸盘符 `C:` 自动补成 `C:\`、`~` 展开、传入文件路径自动落到其所在目录
- 校验失败时输入框红边抖动 + hover 提示「路径不存在」，不弹窗
- 复用现有 `setCurrentPath`，与文件区/面包屑联动，零侵入

**打开终端**
- session 新增 `kind: 'agent' | 'terminal'` 字段；`kind:'terminal'` 时 PTY 只在当前目录起一个纯 shell，**不注入 `claude` 启动命令**
- 因无 `claudeSessionId`，Claude hook 的状态/改名事件不会误挂到终端标签
- 入口收敛到「新建同事」右侧 ▾ 拆分下拉（详见下）

### 交互重构

**「新建同事」改为打开「工作空间」启动页**
- 主按钮不再直接建 agent，而是打开工作空间 launcher（轻量入口）
- 抽出可复用组件 `WorkspaceLauncher`：空态与按需覆盖层共用同一套动作（新对话 / 接着上次 / 历史对话），顶部显示当前目录路径
- 有 session 时 launcher 以**绝对定位覆盖层**浮在终端之上，**保活底层 xterm 实例**（不卸载、不丢 PTY 状态）
- 三种关闭方式：`Esc` / 右上角 `×` / 点击已有标签
- 历史拉取改为「launcher 可见即拉取」（`launcherVisible` 守卫），覆盖层场景也能拿到当前目录历史

**拆分下拉 ▾ 收敛**
- 原下拉项「接着上次 / 历史对话 / 在主目录新建」迁入 launcher 或移除，下拉**只保留「打开终端」**一项
- 「在主目录新建」整个移除（`createInDefaultDir` 不再有调用方）

### 视觉调整

- 右侧 Agent 区左上角标题：**「工作区」→「工作空间」**
- 工作空间启动页按钮加强：主操作「新对话」改为**实心 accent 填充** + 阴影；次操作「接着上次 / 历史对话」改为带底色 + 清晰描边的实在按钮；整体加大 padding/字号/字重
- 覆盖层内容上移（`padding-bottom: 10vh`），修正「居中区域始于 term-bar 之下」导致的视觉偏下

### 技术细节

- `stores/layout.ts` 新增临时态 `launcherOpen`（不持久化，刷新不复活浮层）
- `Tabstrip` 清理收敛后未用引用（`HistoryMenu`/`histOpen`/`currentPath` 等）
- `WorkspaceLauncher` 不直接碰 store，动作的「关闭浮层」由 `TerminalArea` 包装注入，便于双场景复用

---

## 2026-06-22 — Markdown 编辑器 + 文档更新

### 新增功能

**Markdown WYSIWYG 编辑器**
- 使用 Milkdown Crepe 实现所见即所得 Markdown 编辑
- 浮动工具栏支持加粗、斜体、删除线、链接、代码、LaTeX、列表、表格
- 完全适配三主题系统（dark/sepia/light）
- 代码字体跟随用户设置
- 5 秒防抖自动保存
- 选区使用品牌赤陶红高亮，对比度明显

**文件预览功能**
- 点击 `.md` 文件打开右侧编辑面板
- 编辑器宽度与 agent 区域一致（`var(--agent-w)`）
- 支持只读/编辑模式切换
- 文件保存状态实时提示

### 文档更新

- 归档 `SUMMARY.md` → `SUMMARY-v0.1-archived.md`
- 更新 `PRODUCT.md`：补充 Markdown 编辑器、三主题系统、会话历史管理
- 重写 `DESIGN.md`：更新为三主题系统（dark/sepia/light），统一颜色变量命名
- 创建 `CHANGELOG.md`：合并并扩展原 `CHANGES.md` 内容
- 标记 `UI_OPTIMIZATION_REPORT.md` 为已归档文档

### 技术细节

- 移除 `@milkdown/crepe/theme/frame.css`（硬编码白色背景）
- 使用 `--crepe-color-selected: var(--accent)` 控制选区颜色
- 禁用 BlockEdit 功能（容易误触）
- 标题层级清晰（H1-H6 字号递减，H1/H2 有下划线）

---

## 2026-06-21 — 主题系统重构 + 设置面板扩展

### 主题系统

**从双主题改为三主题**
- **Volt/Archive** → **dark/sepia/light**
- dark（暗色）：专注工作，深色背景 `#14140F`
- sepia（护眼米色）：长时间阅读，暖米纸背景 `#E7E1D3`
- light（亮色）：强光环境，冷白背景 `#F6F6F3`
- 统一品牌色为赤陶红 `#C2410C`（取代 Matrix Jade/Burnt Sienna）

**颜色变量重命名**
- `--color-*` → `--bg-*` / `--ink` / `--ink-2` / `--accent`
- 所有主题共享相同的变量名，值根据主题不同
- 移除所有硬编码颜色值，完全使用 CSS 变量

### 设置面板扩展

**通用设置**
- Claude 路径配置
- 默认目录配置
- 默认 Shell 配置
- **主题选择**（从侧边栏迁入，三主题切换）

**终端设置**
- 字体族选择
- 字号配置
- 光标样式（竖线/方块/下划线）
- 光标闪烁开关
- 历史保留行数（scrollback）

**存储结构**
- `stores/settings.ts` 拆分为 `TerminalPrefs` + `GeneralPrefs`
- 持久化到 `localStorage['marshal.settings']`
- `Terminal.tsx` 接通所有终端配置项

### 侧边栏优化

- 主题切换器移除（迁入设置面板）
- 底部只保留单个 ⚙️ 设置按钮
- 历史项目默认折叠，点击标题展开/收起
- 快速入口和收藏常驻显示

---

## 2026-06-19 — UI 优化与 Token 系统化

### Token 系统

**扩展 CSS Variables**
- 新增 `--color-bg-hover`、`--color-accent-hover`
- 重命名 `--color-text-dim` → `--color-text-secondary`
- 新增完整 spacing scale（xs/sm/md/lg = 4/8/12/16px）
- 新增完整 rounded scale（tight/default/relaxed = 3/5/6px）

**全局优化**
- 移除 `user-select: none`，允许用户复制文本
- 状态栏字号 10px → 11px（WCAG AA 可读性）
- Splitter 悬停改为 `--color-border-hover`，拖动时才用 accent

### 文件浏览区

**默认视图改为列表**
- 列表视图更适合快速扫读文件名
- 宫格视图作为可选项保留

**系统原生文件图标**
- 通过 `app.getFileIcon()` 拉取 macOS/Windows 原生图标
- emoji 仅作加载中 fallback
- `useRef<Map>` 缓存已取图标，避免重复请求

**工具栏 SVG 化 + 排序**
- 顶栏图标全部从 Unicode 改为内联 SVG
- 名称/时间/大小排序功能实现
- 文件元数据扩展：`mtime` + `size`

### 终端区优化

**新建按钮移位**
- 「+ 新建 Agent」精简为 `+` 图标
- 移至 header 最左侧

**标签页关闭按钮**
- 每个 tab 内置 `×` 关闭按钮
- hover/active 时显现，hover 变红
- 点击先 `pty.kill`，再 `removeSession`

### 可访问性改进

- 所有交互元素添加 `:focus-visible` outline（2px solid accent）
- Sidebar 导航项改为 `<button>` 语义化
- 分隔条添加 `aria-label`
- 所有动画添加 `prefers-reduced-motion` 支持
- 最小窗口宽度设为 1024px

### 代码质量

- 移除所有硬编码颜色
- 圆角统一为 3/5/6px
- 间距统一使用 spacing scale
- Terminal.tsx xterm 主题从 CSS variables 动态读取

---

## 初版功能（v0.1 归档）

### 核心架构

- pnpm monorepo (apps/ + packages/)
- Electron 33 + Vite 6 + React 18
- TypeScript strict mode
- tRPC 类型化 IPC
- 三栏拖动布局 + localStorage 持久化

### 主要功能

- AgentSession 状态机（idle/running/awaiting-confirm/exited）
- CwdTracker 三层跟踪
- PtyManager (spawn/write/resize/kill)
- xterm.js 终端 (WebGL + Unicode11)
- Zustand 状态管理
- 文件浏览与 cwd 联动
- 确认提醒检测（regex 匹配）
- Toast 通知 + 任务栏闪烁
- 打包配置（electron-builder）

### 设计特色

- 双主题系统（Volt 荧光绿 / Archive 温暖米）
- 三栏 Grid 布局
- Tab/Tile 切换（已移除）
- AgentList 左侧列表（已移除）

---

## 后续计划

- [ ] 文件改动监听（chokidar 集成）
- [ ] 文件预览（代码高亮 + 图片查看）
- [ ] 自动更新（electron-updater）
- [ ] 代码签名（Windows/macOS）
- [ ] 图标设计（icon.ico/icns/png）
- [ ] 会话历史管理（终端「历史对话」下拉）
