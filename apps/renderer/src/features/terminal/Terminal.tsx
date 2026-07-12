import { useEffect, useRef } from 'react';
import type { ReactElement } from 'react';
import { useSettingsStore } from '../../stores/settings';
import { useThemeStore } from '../../stores/theme';
import { Terminal as XTerm } from '@xterm/xterm';
import type { ITheme } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { CwdTracker } from '@kynsage/core';
import { toNativePath } from '@kynsage/shared-types';
import { trpc } from '../../trpc';
import '@xterm/xterm/css/xterm.css';

declare global {
  interface Window {
    ptyEvents: {
      onData: (cb: (sessionId: string, data: string) => void) => void;
      offData: (cb: (sessionId: string, data: string) => void) => void;
      onExit: (cb: (sessionId: string, exitCode: number) => void) => void;
      offExit: (cb: (sessionId: string, exitCode: number) => void) => void;
    };
  }
}

interface TerminalProps {
  sessionId: string;
  cwd: string;
  onReady?: (cols: number, rows: number) => void;
  onCwdChange?: (cwd: string) => void;
  /** 有输出流动 = 正在处理中 */
  onProcessing?: () => void;
  /** 输出静默一段时间 = 已回复 / 待命（hook 的 Stop 会用权威信号覆盖此启发式） */
  onIdle?: () => void;
  /** 任意输出（无节流）：用于「待确认」态下，用户一响应、Claude 一有输出就立刻撤掉确认外框 */
  onActivity?: () => void;
}

// OSC 7: file://hostname/path（Unix /home/...）或 file:///C:/path（Windows 带盘符）
const OSC7_RE = /\x1b]7;file:\/\/[^/]*(\/[^\x07\x1b]+?)(?:\x07|\x1b\\)/;

// Build the xterm color theme from the current CSS custom properties.
// Re-read on theme change so the terminal follows 亮/护眼/暗 switches.
function buildXtermTheme(): ITheme {
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string): string => cs.getPropertyValue(name).trim() || fallback;
  const bg = v('--bg-terminal', '#0E0E0A');
  const text = v('--term-ink', '#E4DFD2');
  const dim = v('--term-dim', '#7C7568');
  const accent = v('--accent', '#D2542A');
  const green = v('--term-green', '#6FA862');
  const amber = v('--term-amber', '#D2A24C');
  const blue = v('--term-blue', '#6F94B8');
  const magenta = v('--term-magenta', '#B07FA0');

  // 共享 ANSI 主色(全主题一致):红/绿/黄/紫;黑随底色明暗切换 #0B1115 / #4C5961。
  // white/brightWhite 必须与终端底对比,否则浅底上不可见 —— 按背景明度分支。
  const red = '#B42318';
  const cyan = '#2E6E66';
  const lightBg = luminance(bg) > 140;
  const ansi = lightBg
    ? {
        black: '#0B1115', red, cyan, white: '#4C5961',
        brightBlack: dim, brightRed: '#C2543E', brightGreen: green,
        brightYellow: amber, brightBlue: blue, brightMagenta: magenta,
        brightCyan: '#3A7E74', brightWhite: '#0B1115',
      }
    : {
        black: '#4C5961', red, cyan, white: text,
        brightBlack: dim, brightRed: '#D98C72', brightGreen: green,
        brightYellow: amber, brightBlue: blue, brightMagenta: magenta,
        brightCyan: '#7FB0A8', brightWhite: '#FFFFFF',
      };

  return {
    background: bg,
    foreground: text,
    cursor: accent,
    selectionBackground: accent + '33',
    green,
    yellow: amber,
    blue,
    magenta,
    ...ansi,
  };
}

// Perceived luminance (0–255) of a #rrggbb / #rgb color; ~0 on parse failure.
function luminance(hex: string): number {
  const h = hex.replace('#', '').trim();
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  if (n.length < 6) return 0;
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  if ([r, g, b].some(Number.isNaN)) return 0;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

export function Terminal({ sessionId, cwd, onReady, onCwdChange, onProcessing, onIdle, onActivity }: TerminalProps): ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const cwdTrackerRef = useRef<CwdTracker | null>(null);
  // 活动检测：忙/闲翻转去抖
  const busyRef = useRef(false);
  const idleTimerRef = useRef<number | null>(null);
  // onActivity 每次渲染都可能是新闭包；用 ref 保持最新，避免 [sessionId] effect 捕获到旧的
  const onActivityRef = useRef(onActivity);
  onActivityRef.current = onActivity;
  const { fontFamily, fontSize, cursorStyle, cursorBlink, scrollbackLines, copyPasteMode } = useSettingsStore();
  const theme = useThemeStore((s) => s.theme);
  // Read the live copy/paste mode inside the key handler without re-mounting xterm.
  const copyPasteModeRef = useRef(copyPasteMode);
  copyPasteModeRef.current = copyPasteMode;

  useEffect(() => {
    if (!containerRef.current) return;

    const xterm = new XTerm({
      fontFamily,
      fontSize,
      lineHeight: 1.2,
      cursorBlink,
      cursorStyle,
      scrollback: scrollbackLines,
      // allowTransparency 关闭：终端背景本就是实色(--bg-terminal)，无需 alpha。
      // 开启会让每个 cell 走半透明合成、徒增开销，实色背景下有害无益。
      allowTransparency: false,
      allowProposedApi: true,
      // Claude 会给「用户输入块」刷深色底、但前景仍用默认文字色 —— 浅色主题下就是深字压深底、看不清。
      // minimumContrastRatio 让 xterm 对任意「前景/该 cell 自身底色」对比不足的格子动态提亮/压暗前景。
      // 取 7:1(WCAG AAA):该深色块底(≈#4C5961)最高只能到约 7:1,唯有纯白能逼近 —— xterm 达不到该比值时
      // 会钳到极值,于是块内文字被推成纯白,得到黑底白字的高对比观感;对比本就充足的普通文字不受影响。
      minimumContrastRatio: 7,
      theme: buildXtermTheme(),
    });

    const fitAddon = new FitAddon();
    const unicode11Addon = new Unicode11Addon();
    xterm.loadAddon(fitAddon);
    xterm.loadAddon(unicode11Addon);
    xterm.unicode.activeVersion = '11';
    xterm.open(containerRef.current);

    // 渲染器：xterm 6 内置的唯一渲染器就是 DOM 渲染器（WebGL/Canvas 已不在包内，需另装 addon，
    // 此处刻意不装）。DOM 渲染器逐 cell 渲染 span、无纹理图集，天然规避图集类花屏；
    // 它的字形宽度靠 WidthCache 测量，须在字体真正就绪后重测一次（见下方 remeasureForFont）。

    fitAddon.fit();

    // 内置字体（默认 LXGW ~6MB / Maple）是异步加载的：xterm 首次挂载时若字体还没就绪，
    // 会用回退字体测量字符宽高，DOM 渲染器把这些错误宽度存进 WidthCache。之后字体经
    // font-display:swap 换入，xterm 不会自动重测 → 表现为：首屏间距错乱、CJK 半宽格与
    // 全宽字形互相叠加「花屏」（Retina 上尤其明显）。须去设置里重选字体才好——因为那会
    // 改 options.fontFamily，触发 CharSizeService 重测、清 WidthCache。
    //
    // 注意：xterm 6 唯一内置渲染器就是 DOM 渲染器（无 WebGL/Canvas，也就无纹理图集），
    // 故旧代码调 clearTextureAtlas() 是空操作、fit() 也不清 WidthCache——都修不了。
    // 正解是「同值回写 options.fontFamily」逼 xterm 走一次真实重测：measure() →
    // handleCharSizeChanged() → _widthCache.clear()，再 fit + 全量 refresh。
    let fontFitCancelled = false;
    const remeasureForFont = (): void => {
      const x = xtermRef.current;
      if (fontFitCancelled || !x) return;
      const fam = x.options.fontFamily;
      // 同值直接赋回不会触发 onChange；先设哨兵再设回，确保 CharSizeService 重测一次。
      x.options.fontFamily = `${fam}, monospace`;
      x.options.fontFamily = fam;
      fitAddon.fit();
      x.refresh(0, x.rows - 1);
    };
    if (typeof document !== 'undefined' && document.fonts) {
      // 提取设置里 fontFamily 的首选族名（去引号），针对性等待它加载完成
      const primary = fontFamily.split(',')[0]?.trim().replace(/^['"]|['"]$/g, '');
      if (primary) void document.fonts.load(`${fontSize}px "${primary}"`).then(remeasureForFont).catch(() => { /* noop */ });
      void document.fonts.ready.then(remeasureForFont).catch(() => { /* noop */ });
    }

    // 复制粘贴快捷键 —— office: Ctrl+C/V（选中才复制，否则中断）; term: Ctrl+Shift+C/V
    xterm.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return true;
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return true;
      const key = e.key.toLowerCase();
      if (key !== 'c' && key !== 'v') return true;

      const paste = () => {
        // 阻止浏览器对 Cmd/Ctrl+V 的原生粘贴：否则文本会进 xterm 的 textarea 再经
        // xterm 自己的 paste 事件 → onData 写一遍，和这里的手动写叠成「粘贴两遍」。
        e.preventDefault();
        // 剪贴板是图片：发裸 Ctrl+V(0x16) 给终端，让 claude 自己读系统剪贴板附图。
        // claude 的图片粘贴正是靠收到 Ctrl+V 后读 NSPasteboard（官方要求用 Ctrl+V 而非 Cmd+V）；
        // 我们 office 模式把裸 Ctrl+V 拦成了文本粘贴，0x16 到不了 claude，图片就粘不进——故这里放行 0x16。
        if ((window as any).clipboardBridge?.hasImage?.()) {
          void (trpc as any).pty.write.mutate({ sessionId, data: '\x16' });
          return;
        }
        void navigator.clipboard.readText().then((text) => {
          if (text) void (trpc as any).pty.write.mutate({ sessionId, data: text });
        });
      };

      if (copyPasteModeRef.current === 'office') {
        if (e.shiftKey) return true;
        if (key === 'c') {
          const sel = xterm.getSelection();
          if (sel) { void navigator.clipboard.writeText(sel); return false; }
          return true; // 没选中 → 放行，作为中断（SIGINT）
        }
        paste(); // key === 'v'
        return false;
      }

      // term 习惯：仅 Ctrl+Shift+C / Ctrl+Shift+V 走复制粘贴，裸 Ctrl+C 仍中断
      if (!e.shiftKey) return true;
      if (key === 'c') {
        const sel = xterm.getSelection();
        if (sel) void navigator.clipboard.writeText(sel);
        return false;
      }
      paste();
      return false;
    });

    const tracker = new CwdTracker(cwd);
    cwdTrackerRef.current = tracker;

    xterm.onData((data) => {
      void (trpc as any).pty.write.mutate({ sessionId, data });
    });

    xterm.onResize(({ cols, rows }) => {
      void (trpc as any).pty.resize.mutate({ sessionId, cols, rows });
    });

    const handleData = (sid: string, data: string) => {
      if (sid !== sessionId) return;
      xterm.write(data);

      // OSC 7 cwd detection (most reliable)
      const osc7 = OSC7_RE.exec(data);
      if (osc7?.[1]) {
        let newCwd = decodeURIComponent(osc7[1]);
        // Windows: file:///C:/Users/... → 捕获到 /C:/Users/...，先剥前导 /
        if (/^\/[A-Za-z]:/.test(newCwd)) newCwd = newCwd.slice(1);
        // 统一归一化（盘符→反斜杠、UNC、去混合分隔符）；POSIX 原样返回
        newCwd = toNativePath(newCwd);
        tracker.reset(newCwd);
        onCwdChange?.(newCwd);
      }

      // cd-pattern cwd tracking as fallback（兼容 CRLF）
      const prevCwd = tracker.getCurrentCwd();
      for (const line of data.split(/\r?\n/)) {
        tracker.onPtyOutput(line);
      }
      const nextCwd = tracker.getCurrentCwd();
      if (nextCwd !== prevCwd) onCwdChange?.(nextCwd);

      // 活动检测（兜底）：有输出=处理中；静默 10s=待命。
      // 确认/结束的权威信号来自 Claude Code hook（见 TerminalArea），此处仅作 hook 不可用时的回退。
      onActivityRef.current?.(); // 无节流：每批输出都报，供「待确认」态即时撤框
      if (!busyRef.current) { busyRef.current = true; onProcessing?.(); }
      if (idleTimerRef.current !== null) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = window.setTimeout(() => {
        busyRef.current = false;
        onIdle?.();
      }, 10000);
    };

    window.ptyEvents.onData(handleData);

    xtermRef.current = xterm;
    fitAddonRef.current = fitAddon;

    onReady?.(xterm.cols, xterm.rows);

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      fontFitCancelled = true;
      window.ptyEvents.offData(handleData);
      resizeObserver.disconnect();
      if (idleTimerRef.current !== null) clearTimeout(idleTimerRef.current);
      xterm.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // Terminal colors follow the active theme (亮/护眼/暗) without re-mounting xterm.
  useEffect(() => {
    if (xtermRef.current) xtermRef.current.options.theme = buildXtermTheme();
  }, [theme]);

  // Font/cursor settings follow user preferences without re-mounting xterm.
  useEffect(() => {
    const x = xtermRef.current;
    if (!x) return;
    x.options.fontFamily = fontFamily;
    x.options.fontSize = fontSize;
    x.options.cursorStyle = cursorStyle;
    x.options.cursorBlink = cursorBlink;
    fitAddonRef.current?.fit();
  }, [fontFamily, fontSize, cursorStyle, cursorBlink]);

  return <div ref={containerRef} className="term-host" />;
}
