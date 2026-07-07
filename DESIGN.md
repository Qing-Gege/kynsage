***

name: 狗头军师 / Kynsage
description: 一个狗军师，三个诸葛亮 — Windows 多 Agent 指挥驾驶舱
colors:
accent: "#C2410C"
accent-hover: "#A33408"
ink: "#E8E6DC"
ink-2: "#A8A698"
ink-3: "#6E6C5F"
bg-app: "#14140F"
bg-panel: "#1A1A14"
bg-elevated: "#20201A"
bg-selected: "#25241A"
line: "#2A2A22"
line-strong: "#36352B"
typography:
sans:
fontFamily: "Inter, -apple-system, 'Segoe UI', sans-serif"
fontSize: "13px"
fontWeight: 400
lineHeight: 1.5
mono:
fontFamily: "'JetBrains Mono', 'Cascadia Code', 'Consolas', monospace"
fontSize: "13px"
fontWeight: 400
rounded:
tight: "3px"
default: "5px"
relaxed: "6px"
spacing:
xs: "4px"
sm: "8px"
md: "12px"
lg: "16px"
----------

# Design System: 狗头军师 / Kynsage

## 1. Overview

**Creative North Star: "The Craftsman's Bench"**

狗头军师/Kynsage 的设计语言源于工匠工作台的克制美学：每个工具都有明确位置，每个表面都经过打磨，没有装饰性的元素，只有功能性的精确。这是为律师、专利代理师、作家等专业人士设计的多 agent 指挥工具，用户需要在高信息密度下保持清晰的认知地图，不被视觉噪音干扰。

设计拒绝三种方向：SaaS 仪表板的中庸平淡（Notion/Linear 的白底卡片模板感）、游戏化/赛博朋克的炫技装饰（RGB 渐变/粒子特效）、以及过度圆润的消费级产品感（20px+ 圆角/毛玻璃）。我们追求的是**工具的消失感**——界面应该成为肌肉记忆的一部分，而不是需要欣赏的对象。

**Key Characteristics:**

* **高密度但不拥挤**：多 agent 并发时屏幕空间稀缺，紧凑布局但层级清晰

* **状态即时可见**：不需要悬停或点击才能看到关键信息，运行/等待确认/已退出通过视觉层级主动传达

* **零歧义交互**：可操作元素边界清晰，不需要试探；误操作的代价是丢失工作内容

* **三套主题覆盖全场景**：暗色（专注工作）、护眼米色（长时间阅读）、亮色（强光环境），适应不同光照和使用偏好

## 2. Colors: The Three-Theme System

狗头军师采用三套完整主题，每套主题独立配色。所有主题共享统一的品牌色（赤陶红）和设计原则。

### Brand Accent（所有主题通用）

* **Terracotta Red** (#C2410C): 品牌赤陶红，源自中国传统色彩。用于主要交互按钮、选中状态指示、激活边框、以及所有需要主动吸引注意力的元素。这是唯一的饱和色，其稀缺性构成视觉层级。

* **Terracotta Red Hover** (#A33408): 悬停状态，饱和度略降。

### Dark Theme（暗色主题 - 默认）

专注工作的深色背景，适合长时间编码和终端操作。

**Surfaces:**

* **bg-app** (#14140F): 主背景，暖中性近黑

* **bg-sidebar** (#100F0B): 侧边栏背景

* **bg-panel** (#1A1A14): 次级背景面板

* **bg-terminal** (#0B0B07): 终端背景（「终端井」——比浏览面 bg-sidebar 暗一档，agent 区下沉，与左侧浏览面区分）

* **bg-elevated** (#20201A): 浮起元素（卡片、下拉菜单）

* **bg-selected** (#25241A): 选中/悬停背景

**Borders:**

* **line** (#2A2A22): 默认边框和分隔线

* **line-strong** (#36352B): 强调边框

**Ink:**

* **ink** (#E8E6DC): 主文本色（>12:1 对比度）

* **ink-2** (#A8A698): 次要文本色（辅助信息）

* **ink-3** (#6E6C5F): 三级文本（占位符、禁用）

* **ink-4** (#4A4940): 四级文本（极弱提示）

### Sepia Theme（护眼米色主题）

温暖的米纸色调，低对比，适合长时间阅读和文档编辑。

**Surfaces:**

* **bg-app** (#E7E1D3): 主背景，暖米纸

* **bg-sidebar** (#E1DACA): 侧边栏背景

* **bg-panel** (#EDE7DA): 次级背景面板

* **bg-elevated** (#DDD6C5): 浮起元素

* **bg-selected** (#D8CFB9): 选中/悬停背景

**Borders:**

* **line** (#CFC6B1): 默认边框

* **line-strong** (#BEB39B): 强调边框

**Ink:**

* **ink** (#2E2A20): 主文本色

* **ink-2** (#5F5847): 次要文本色

* **ink-3** (#8A8270): 三级文本

* **ink-4** (#ABA28C): 四级文本

### Light Theme（亮色主题）

冷白图纸桌，高对比清晰，适合强光环境。

**Surfaces:**

* **bg-app** (#F6F6F3): 主背景，冷白

* **bg-sidebar** (#FAFAF8): 侧边栏背景

* **bg-panel** (#FFFFFF): 次级背景面板

* **bg-elevated** (#F0F0EC): 浮起元素

* **bg-selected** (#F3EFE2): 选中/悬停背景

**Borders:**

* **line** (#E4E3DC): 默认边框

* **line-strong** (#D4D3C9): 强调边框

**Ink:**

* **ink** (#1F1E18): 主文本色

* **ink-2** (#56544A): 次要文本色

* **ink-3** (#86847A): 三级文本

* **ink-4** (#AEACA1): 四级文本

### Semantic Colors（语义色）

* **accent-soft** (各主题独立): 浅色 accent 背景（选区、标记）

* **ok** (绿色系): 成功状态

* **warn** (琥珀色系): 警告/等待确认状态

* **danger** (红色系): 错误/已退出状态

* **idle** (棕色系): 空闲状态

### Named Rules

**The One Accent Rule.** 只有一个饱和色（赤陶红），该色用于 ≤10% 的可见表面。其稀缺性是视觉层级的基础。不引入第二饱和色（紫色、蓝色、洋红），避免信息竞争。

**The No-Decoration Rule.** 渐变、阴影、光晕仅用于传达状态（悬停的提升感），不用于装饰。平面卡片不加投影，除非悬停/拖拽时需要表达"浮起"。

## 3. Typography

**UI Font:** Inter + System stack (`Inter, -apple-system, 'Segoe UI', sans-serif`)\
**Mono Font:** JetBrains Mono / Cascadia Code / Consolas

**Character:** 单字体家族，无 display/body 配对。Inter 覆盖 UI 的所有层级（导航、按钮、标签、正文），JetBrains Mono 仅用于终端内容和代码片段。追求工具的消失感，字体不应成为品牌表达的主战场。

### Hierarchy

* **Body** (400, 13px, 1.5 line-height): 文件名、导航项、tab 标签、按钮文字。产品 UI 的主力尺寸，覆盖 90% 的文本需求。

* **Small** (400, 11px, 1.4 line-height): 次要说明文字、空状态提示、时间戳。尺寸降低但 line-height 保持可读。

* **Label** (500/600, 11px, 紧凑 letter-spacing): 导航分组标题、表单 label、状态标签。字重加强，制造层级区分。

* **Mono** (400, 13px): 终端输出、文件路径、快捷键提示。与 Body 同尺寸但字宽更宽，制造对比。

**Fixed rem scale, not fluid.** 产品 UI 不使用 clamp()，用户在固定 DPI 下工作，流式字号在侧边栏缩小会显得更糟。所有尺寸为固定 px 值。

**No display fonts.** 品牌名"狗头军师 / Kynsage"使用 14px 600 weight 的 Inter，配合适当 letter-spacing，足以制造辨识度。不引入 serif 或 display font，避免"自我欣赏"的品牌化。

## 4. Elevation

**Philosophy:** 分层但不夸张。主背景、次级背景、浮起元素通过 1-2 级背景色差异分层，不依赖投影。投影仅用于拖拽、悬停提升等动态状态反馈。

**Layering:**

* L0: bg-app（主背景）

* L1: bg-sidebar, bg-panel（次级背景）

* L2: bg-elevated（浮起元素：下拉菜单、toast、模态）

* L3: bg-selected（悬停/选中状态）

**Shadows:** 仅用于动态反馈，不用于装饰。拖拽分隔条时可加轻微阴影表达"正在拖动"。

## 5. Components

### Button

**Primary Variant:**

* Background: var(--accent)

* Text: var(--accent-ink)（与背景对比的文字色）

* Padding: 6px 14px

* Rounded: var(--radius-relaxed) (6px)

* Hover: var(--accent-hover)

* Focus: 2px solid focus ring

**Ghost Variant:**

* 透明背景，1px 边框

* Hover: 边框变 accent

* 用于次要操作

### Tab (Tabstrip)

* Default: 透明背景，1px 透明边框

* Hover: bg-panel 背景

* Active: accent 底部边框，文字色 accent

* 高度 36px，padding 0 16px

* 支持关闭按钮（hover 时显示）

### Navigation Item (Sidebar)

* Default: 透明背景，rounded 5px

* Hover: bg-selected

* Active: bg-selected + accent 文字色

* Icon 16px + 文字 13px，gap 8px

* 支持折叠/展开（历史项目）

### File Card (FilesArea)

**List View:**

* 单行，icon + 文件名 + 时间/大小

* Hover: bg-selected

* Selected: accent 左边框

**Grid View:**

* 卡片式，icon 居中 + 文件名两行截断

* Hover: bg-selected

* Selected: accent 边框

### Dropdown Menu (HistoryMenu)

* Background: bg-elevated

* Border: 1px line

* Shadow: var(--shadow)

* Item hover: bg-selected

* Max height: 60vh，超出滚动

### Settings Panel

* Modal overlay: rgba(0,0,0,0.6)

* Panel: bg-elevated，最大宽度 800px

* 左侧 tab 导航 + 右侧内容区

* 表单项：label + input/select，垂直排列

### Toast (react-hot-toast)

* Background: bg-elevated

* Border: 1px accent（成功）/ warn（警告）/ danger（错误）

* Position: top-right

* Duration: 3-5s

* Icon + 消息文字

## 6. Layout

### Three-Column Grid

```
[Sidebar 220px] [Splitter] [FilesArea flex] [Splitter] [TerminalArea 2/3 window]
```

* 侧边栏：180-360px 可拖动

* 终端区：480-1600px 可拖动

* 文件区：自适应剩余空间

### Tabstrip (Agent Switcher)

* 固定在文件区顶部

* 高度 36px

* 左侧：logo + 当前目录

* 中间：agent tabs

* 右侧：新建按钮 + 下拉菜单（在其他目录新建）

### Terminal Area

* 有会话：顶栏（新建 + 历史对话） + 终端

* 空态：居中卡片（新建/续对话/查看历史）

## 7. Spacing & Rhythm

统一使用 4/8/12/16px 节奏：

* **xs (4px)**: icon-text gap，inline 元素间距

* **sm (8px)**: 同组控件间距，padding 小

* **md (12px)**: 不同组间距，padding 中

* **lg (16px)**: 区块间距，padding 大

## 8. Do's and Don'ts

### ✅ Do

* **Do** 使用 Inter 字体栈，在 Windows/macOS 上都有良好渲染

* **Do** 让 accent 色保持稀缺，≤10% 的可见表面

* **Do** 在高密度布局中保持 1px 边框可见

* **Do** 用 5-6px 圆角，在 Windows 上足够柔和但不夸张

* **Do** 让状态变化通过颜色+文字/图标组合传达（不仅依赖颜色）

### ❌ Don't

* **Don't** 引入第二饱和色（紫色、蓝色、洋红）

* **Don't** 在静态元素上加投影或光晕

* **Don't** 把圆角推到 12px 以上

* **Don't** 用渐变背景或装饰性图案

* **Don't** 让 terminal 区域的背景色偏离主题定义

* **Don't** 在不同组件上使用不同的圆角值

* **Don't** 让空状态变成"友好的鼓励"，直接说明情况即可

