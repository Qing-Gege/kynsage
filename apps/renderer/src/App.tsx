import { useEffect, useLayoutEffect } from 'react';
import type { ReactElement } from 'react';
import { useState } from 'react';
import { useResizable } from './useResizable';
import { useThemeStore } from './stores/theme';
import { useLayoutStore } from './stores/layout';
import { useAgentsStore } from './stores/agents';
import { Sidebar } from './features/sidebar/Sidebar';
import { BrandMark } from './features/sidebar/BrandMark';
import { AddressBar } from './features/nav/AddressBar';
import { Tabstrip } from './features/agents/Tabstrip';
import { FilesArea } from './features/files/FilesArea';
import { TerminalArea } from './features/terminal/TerminalArea';
import { SettingsPanel } from './features/settings/SettingsPanel';
import './App.css';

export function App(): ReactElement {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const { theme, applyTheme } = useThemeStore();
  const { sidebarCollapsed, filesExpanded, setFilesExpanded } = useLayoutStore();

  // 展开态按 Esc 退出 —— 覆盖式视图都该给一条退路。
  // 输入框/编辑器里的 Esc 归它们自己（重命名取消、地址栏退出编辑）。
  useEffect(() => {
    if (!filesExpanded) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || t?.isContentEditable) return;
      setFilesExpanded(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [filesExpanded, setFilesExpanded]);

  useEffect(() => {
    applyTheme(theme);
  }, [theme, applyTheme]);

  // 上报「处理中」的 agent 数量给主进程：关窗前若 >0 会弹确认框，避免误关中断 claude 的活。
  // 选择器只订阅计数，值变才触发 effect。
  const runningCount = useAgentsStore((s) => s.sessions.filter((x) => x.state === 'running').length);

  // 「回到工作空间」把手上的活信号 —— 只在真有事时才动画：
  // 等你拍板 = 赤陶红星号急跳；有人在跑 = 呼吸；全闲 = 静止（零开销）。
  const awaitingCount = useAgentsStore((s) => s.sessions.filter((x) => x.state === 'awaiting-confirm').length);
  const sessionCount = useAgentsStore((s) => s.sessions.length);
  const peekMood = awaitingCount > 0 ? 'alert' : runningCount > 0 ? 'busy' : 'calm';
  const peekHint = awaitingCount > 0
    ? `${awaitingCount} 位同事等你拍板 · 点此回到工作空间`
    : runningCount > 0
      ? `${runningCount} 位同事在干活 · 点此回到工作空间`
      : sessionCount > 0
        ? '回到工作空间（也可按 Esc，或把分隔条往左拖）'
        : '回到工作空间 · 新建同事开工';
  useEffect(() => {
    window.windowControls?.reportBusyCount?.(runningCount);
  }, [runningCount]);

  // 首帧用 useResizable 的 layout effect 写好宽度后再开启 grid 过渡，避免初次加载时
  // 文件区从 CSS 默认宽「滑动」到恢复宽（表现为偶发的特别宽）。
  useLayoutEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const sidebar = useResizable({
    cssVar: '--sidebar-w',
    storageKey: 'kynsage.layout.sidebarW',
    edge: 'left',
    min: 180,
    max: 360,
    initial: 220,
  });

  const files = useResizable({
    cssVar: '--files-w',
    storageKey: 'kynsage.layout.filesW',
    edge: 'left',
    min: 180,
    max: 520,
    initial: 220,
    // 拖到最宽还继续往右拖 90px → 自然进入展开态；展开态往左拖回 90px → 退出。
    // 对称是关键：能拖进去，就得能拖回来。
    overshoot: 90,
    overshot: filesExpanded,
    onOvershoot: () => setFilesExpanded(true),
    onUndoOvershoot: () => setFilesExpanded(false),
  });

  return (
    <div className={`app-shell ${sidebarCollapsed ? 'is-collapsed' : ''} ${filesExpanded ? 'is-files-expanded' : ''} ${ready ? 'is-ready' : ''}`}>
      <aside className="sidebar">
        <Sidebar onSettings={() => setSettingsOpen(true)} />
      </aside>

      <div
        className="splitter splitter-v splitter-sidebar"
        onMouseDown={sidebar.onMouseDown}
        role="separator"
        aria-orientation="vertical"
        aria-label="调整侧边栏宽度"
      />

      <div className="brand-cell">
        <BrandMark />
      </div>

      <div className="tabstrip-wrapper">
        <Tabstrip />
      </div>

      <div className="addressbar-wrapper">
        <AddressBar />
      </div>

      <main className="files-area-wrapper">
        <FilesArea />
      </main>

      <div
        className="splitter splitter-v splitter-agent"
        onMouseDown={files.onMouseDown}
        role="separator"
        aria-orientation="vertical"
        aria-label="调整文件区宽度"
      />

      <section className="agent-area-wrapper">
        <TerminalArea />
      </section>

      {/* 展开态下工作空间只剩一条 44px 窄缝：做成明确的「回到工作空间」把手。
          闲笔（但有用）：把手上那点信号按同事真实状态跳 —— 展开态把终端整个
          藏了，同事等你拍板时你本来看不见。空跳是噪音，按状态跳才是信息。 */}
      <button
        className={`term-peek is-${peekMood}`}
        onClick={() => setFilesExpanded(false)}
        title={peekHint}
        type="button"
      >
        <span className="term-peek-sig" aria-hidden>
          {peekMood === 'alert' ? '✳' : '●'}
        </span>
        <span className="term-peek-label">回到工作空间</span>
      </button>

      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
// Manual change at Sun Jun 21 22:56:24 CST 2026
// Polling test at Sun Jun 21 22:59:12 CST 2026
// Browser opened at Sun Jun 21 22:59:43 CST 2026
// Debug test at Sun Jun 21 23:00:20 CST 2026
