import { useState, useRef, useEffect } from 'react';
import type { ReactElement } from 'react';
import { useAgentsStore } from '../../stores/agents';
import { useNavStore } from '../../stores/nav';
import { useLayoutStore } from '../../stores/layout';
import { useSettingsStore } from '../../stores/settings';
import { useCreateAgent } from './useCreateAgent';
import './Tabstrip.css';

// agent.state → 状态点 class + 中文标签（信号灯：绿处理中 / 琥珀待确认 / accent待命 / 灰已结束）
const STATE_DOT: Record<string, string> = {
  running: 'run',
  'awaiting-confirm': 'wait',
  exited: 'exit',
  idle: 'idle',
};
const STATE_LABEL: Record<string, string> = {
  running: '处理中',
  'awaiting-confirm': '待确认',
  exited: '已结束',
  idle: '该你了',
};

const IconPlus = (): ReactElement => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
);
const IconChevron = (): ReactElement => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
);

export function Tabstrip(): ReactElement {
  const { sessions, activeSessionId, setActiveSession, removeSession } = useAgentsStore();
  const { setCurrentPath } = useNavStore();
  const { mode, setMode, setLauncherOpen } = useLayoutStore();
  const { openTerminalInCurrentDir } = useCreateAgent();
  const memberLabel = useSettingsStore((s) => s.memberLabel).trim() || '同事';
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [maximized, setMaximized] = useState(false);

  useEffect(() => { window.windowControls?.onMaximizeChange(setMaximized); }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent): void => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, [menuOpen]);

  const selectAgent = (id: string): void => {
    setLauncherOpen(false);
    setActiveSession(id);
    const session = sessions.find((s) => s.id === id);
    if (session?.cwd) setCurrentPath(session.cwd);
  };

  // 总览 = tile（铺开所有终端）；再点复原到单 agent 标签视图
  const toggleOverview = (): void => setMode(mode === 'tile' ? 'tabs' : 'tile');

  return (
    <header className="tabstrip">
      <div className="tab-new" ref={menuRef}>
        <button className="b" onClick={() => setLauncherOpen(true)} title={`新建${memberLabel}（打开工作空间）`} type="button">
          <IconPlus />
          <span>新建{memberLabel}</span>
        </button>
        <button
          className="s"
          onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
          title="打开终端"
          type="button"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          <IconChevron />
        </button>
        {menuOpen && (
          <div className="split-menu" role="menu">
            <button onClick={() => { setMenuOpen(false); void openTerminalInCurrentDir(); }} type="button" role="menuitem">
              🖥️ 打开终端
            </button>
          </div>
        )}
      </div>

      <div className="tabs">
        {sessions.map((session) => {
          const st = session.state ?? 'idle';
          const dot = STATE_DOT[st] ?? 'idle';
          const label = STATE_LABEL[st] ?? '待命';
          return (
            <div
              key={session.id}
              className={`tab ${session.id === activeSessionId ? 'active' : ''} ${st === 'awaiting-confirm' ? 'is-awaiting' : ''}`}
              onClick={() => selectAgent(session.id)}
              role="tab"
              aria-selected={session.id === activeSessionId}
              title={`${session.name} · ${label}`}
            >
              <span className={`agent-dot ${dot}`} />
              <span className="tab-name">{session.name}</span>
              <span className={`tab-state ${dot}`}>{label}</span>
              <button
                className="tab-close"
                onClick={(e) => { e.stopPropagation(); removeSession(session.id); }}
                title="关闭"
                type="button"
              >
                <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><line x1="1" y1="1" x2="9" y2="9" /><line x1="9" y1="1" x2="1" y2="9" /></svg>
              </button>
            </div>
          );
        })}
      </div>

      <div className="tab-fill" />

      <button
        className={`view-toggle ${mode === 'tile' ? 'on' : ''}`}
        onClick={toggleOverview}
        title="总览 —— 铺开所有 Agent 终端（再点复原）"
        type="button"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="8" height="8" rx="1" /><rect x="13" y="3" width="8" height="8" rx="1" /><rect x="3" y="13" width="8" height="8" rx="1" /><rect x="13" y="13" width="8" height="8" rx="1" /></svg>
        <span>总览</span>
      </button>

      <div className="win-ctl">
        <button className="win-btn" onClick={() => window.windowControls?.minimize()} title="最小化" type="button">
          <svg width="11" height="1" viewBox="0 0 11 1"><line x1="0" y1="0.5" x2="11" y2="0.5" stroke="currentColor" strokeWidth="1.2" /></svg>
        </button>
        <button className="win-btn" onClick={() => window.windowControls?.maximize()} title={maximized ? '还原' : '最大化'} type="button">
          {maximized ? (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.1"><rect x="2" y="0" width="8" height="8" rx="0.5" /><path d="M0 2v6a2 2 0 002 2h6" /></svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.1"><rect x="0.5" y="0.5" width="9" height="9" rx="0.5" /></svg>
          )}
        </button>
        <button className="win-btn win-close" onClick={() => window.windowControls?.close()} title="关闭" type="button">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"><line x1="1" y1="1" x2="9" y2="9" /><line x1="9" y1="1" x2="1" y2="9" /></svg>
        </button>
      </div>
    </header>
  );
}
