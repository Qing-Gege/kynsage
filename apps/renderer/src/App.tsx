import { useEffect, useLayoutEffect } from 'react';
import type { ReactElement } from 'react';
import { useState } from 'react';
import { useResizable } from './useResizable';
import { useThemeStore } from './stores/theme';
import { useLayoutStore } from './stores/layout';
import { useAgentsStore } from './stores/agents';
import { Sidebar } from './features/sidebar/Sidebar';
import { Tabstrip } from './features/agents/Tabstrip';
import { FilesArea } from './features/files/FilesArea';
import { TerminalArea } from './features/terminal/TerminalArea';
import { SettingsPanel } from './features/settings/SettingsPanel';
import './App.css';

export function App(): ReactElement {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const { theme, applyTheme } = useThemeStore();
  const { sidebarCollapsed, collapsedFilesW } = useLayoutStore();

  useEffect(() => {
    applyTheme(theme);
  }, [theme, applyTheme]);

  // 上报「处理中」的 agent 数量给主进程：关窗前若 >0 会弹确认框，避免误关中断 claude 的活。
  // 选择器只订阅计数，值变才触发 effect。
  const runningCount = useAgentsStore((s) => s.sessions.filter((x) => x.state === 'running').length);
  useEffect(() => {
    window.windowControls?.reportBusyCount?.(runningCount);
  }, [runningCount]);

  // 首帧用 useResizable 的 layout effect 写好宽度后再开启 grid 过渡，避免初次加载时
  // 文件区从 CSS 默认宽「滑动」到恢复宽（表现为偶发的特别宽）。
  useLayoutEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // 刷新后若仍是收起态，恢复文件列宽，避免 --files-w 未设导致文件区为 0
  useEffect(() => {
    if (sidebarCollapsed && collapsedFilesW) {
      document.documentElement.style.setProperty('--files-w', `${collapsedFilesW}px`);
    }
  }, [sidebarCollapsed, collapsedFilesW]);

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
  });

  return (
    <div className={`app-shell ${sidebarCollapsed ? 'is-collapsed' : ''} ${ready ? 'is-ready' : ''}`}>
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

      <div className="tabstrip-wrapper">
        <Tabstrip />
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

      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
// Manual change at Sun Jun 21 22:56:24 CST 2026
// Polling test at Sun Jun 21 22:59:12 CST 2026
// Browser opened at Sun Jun 21 22:59:43 CST 2026
// Debug test at Sun Jun 21 23:00:20 CST 2026
