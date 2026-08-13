import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { useAgentsStore } from '../../stores/agents';
import { useLayoutStore } from '../../stores/layout';
import { useNavStore } from '../../stores/nav';
import { useSettingsStore } from '../../stores/settings';
import { useThemeStore } from '../../stores/theme';
import { THEME_META } from '@kynsage/design-tokens';
import { useCreateAgent } from '../agents/useCreateAgent';
import type { SessionRow } from '../agents/HistoryMenu';
import { WorkspaceLauncher } from './WorkspaceLauncher';
import { Terminal } from './Terminal';
import { playConfirmChime } from './chime';
import { trpc } from '../../trpc';
import type { AgentProvider } from '@kynsage/shared-types';
import { buildAgentCommand } from '../agents/provider-command';
import toast, { Toaster } from 'react-hot-toast';
import './TerminalArea.css';

declare global {
  interface Window {
    ptyEvents: {
      onData: (cb: (sessionId: string, data: string) => void) => void;
      offData: (cb: (sessionId: string, data: string) => void) => void;
      onExit: (cb: (sessionId: string, exitCode: number) => void) => void;
      offExit: (cb: (sessionId: string, exitCode: number) => void) => void;
    };
    windowControls?: {
      minimize: () => void;
      maximize: () => void;
      close: () => void;
      onMaximizeChange: (cb: (maximized: boolean) => void) => void;
      reportBusyCount?: (n: number) => void;
    };
    agentEvents?: {
      onHook: (cb: (evt: AgentHookEvent) => void) => void;
      offHook: (cb: (evt: AgentHookEvent) => void) => void;
      onTitle: (cb: (provider: AgentProvider, sessionId: string, title: string) => void) => void;
      offTitle: (cb: (provider: AgentProvider, sessionId: string, title: string) => void) => void;
    };
  }
}

interface AgentHookEvent {
  provider?: AgentProvider;
  hook_event_name: string;
  session_id?: string;
  notification_type?: string;
}

const IDLE = { dot: 'idle', label: '待命' };
const STATE_META: Record<string, { dot: string; label: string }> = {
  running: { dot: 'run', label: '处理中' },
  'awaiting-confirm': { dot: 'wait', label: '待确认' },
  exited: { dot: 'exit', label: '已结束' },
  idle: IDLE,
};

export function TerminalArea(): ReactElement {
  const { sessions, activeSessionId, updateSession } = useAgentsStore();
  const { mode, launcherOpen, setLauncherOpen } = useLayoutStore();
  const { setCurrentPath, currentPath } = useNavStore();
  const { agentProvider, claudePath, grokPath, defaultShell, memberLabel } = useSettingsStore();
  const newLabel = (memberLabel?.trim() || '同事');
  const { createInCurrentDir, restoreSession, restoreSessionById } = useCreateAgent();
  const [isWindows, setIsWindows] = useState(false);
  useEffect(() => {
    void (trpc as any).getPlatform.query().then((p: string) => setIsWindows(p === 'win32'));
  }, []);
  // 历史对话统一收敛到工作空间启动页（WorkspaceLauncher），顶栏不再设入口
  const [launcherHist, setLauncherHist] = useState<SessionRow[]>([]);

  // launcher 可见时（空态 或 浮层打开）拉取当前目录的历史对话，决定 launcher 形态
  const launcherVisible = sessions.length === 0 || launcherOpen;
  useEffect(() => {
    if (!launcherVisible || !currentPath) { setLauncherHist([]); return; }
    let cancelled = false;
    void (async () => {
      try {
        const r = (await (trpc as any).listSessions.query({ cwd: currentPath, provider: agentProvider })) as SessionRow[];
        if (!cancelled) setLauncherHist(r);
      } catch {
        if (!cancelled) setLauncherHist([]);
      }
    })();
    return () => { cancelled = true; };
  }, [agentProvider, launcherVisible, currentPath]);

  // launcher 浮层打开时，Esc 关闭
  useEffect(() => {
    if (!launcherOpen) return;
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') setLauncherOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [launcherOpen, setLauncherOpen]);

  // 包装：动作执行后关闭 launcher 浮层
  const closeLauncher = (): void => setLauncherOpen(false);
  const launcherProps = {
    currentPath,
    provider: agentProvider,
    hist: launcherHist,
    newLabel,
    onNew: () => { closeLauncher(); void createInCurrentDir(); },
    onRestore: () => { closeLauncher(); if (currentPath) void restoreSession(currentPath); },
    // resume 用会话保存的 cwd（而非当前浏览目录），Windows 下才能命中原 projects 目录
    onPickHistory: (s: SessionRow) => { closeLauncher(); const cwd = s.cwd || currentPath; if (cwd) restoreSessionById(cwd, s.sessionId, s.title); },
  };

  const handleTerminalReady = async (sessionId: string, cols: number, rows: number): Promise<void> => {
    updateSession(sessionId, { state: 'running' });
    const session = sessions.find((s) => s.id === sessionId);
    try {
      await (trpc as any).pty.spawn.mutate({ id: sessionId, cwd: session?.cwd ?? '', command: defaultShell || undefined, cols, rows });
      // 纯终端：PTY 已在 cwd 起好 shell，不注入 claude 启动命令
      if (session?.kind === 'terminal') return;
      await new Promise((r) => setTimeout(r, 300));
      // 项目记忆：恢复指定历史对话 / 续最近 / 全新。程序位置留空时使用 provider 的 PATH 命令。
      const provider = session?.provider ?? 'claude';
      const bin = provider === 'grok' ? (grokPath || 'grok') : (claudePath || 'claude');
      // 注入 hook 配置（Notification/Stop/SessionStart → 本地 HTTP），不碰用户全局 settings
      let claudeSettingsPath = '';
      try {
        // 让 claude 配色跟随 app 主题:用 *-ansi 变体 —— Claude 改用终端 16 色 ANSI
        // 面板上色(而非内置 truecolor),我们在 buildXtermTheme 里控制该面板,切主题时
        // Claude 新渲染的正文即跟随。深/浅决定基础明暗,ANSI 各色由 --term-* 提供。
        const appTheme = useThemeStore.getState().theme;
        const isDark = THEME_META.find((m) => m.name === appTheme)?.dark ?? false;
        const claudeTheme = isDark ? 'dark-ansi' : 'light-ansi';
        const hookPath = (await (trpc as any).getHookSettingsPath.query({ provider, claudeTheme })) as string;
        if (provider === 'claude') claudeSettingsPath = hookPath;
      } catch { /* 拿不到就不加，hook 不可用但终端仍能用 */ }
      // 新建用 --session-id 强制指定我们生成的 uuid；恢复用 --resume <id>；都已知 id 供 hook 映射
      // 行尾用 \r（回车键），而非 \n。Windows conpty + PowerShell 只认 \r 为「提交」，
      // 写 \n 会出现命令已注入但未执行、光标停在行内的现象；\r 在 *nix shell 同样有效。
      const cmd = buildAgentCommand({
        provider,
        executable: bin,
        isWindows,
        sessionId: session?.agentSessionId,
        resume: session?.resume,
        resumeSessionId: session?.resumeSessionId,
        claudeSettingsPath,
      });
      await (trpc as any).pty.write.mutate({ sessionId, data: cmd });
    } catch (err) {
      toast.error(`PTY 启动失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleConfirmPrompt = (sessionId: string): void => {
    const session = useAgentsStore.getState().sessions.find((s) => s.id === sessionId);
    const agentName = session?.name ?? sessionId;
    const root = document.documentElement;
    toast(`${agentName} 需要确认`, {
      duration: 5000,
      position: 'top-right',
      style: {
        background: getComputedStyle(root).getPropertyValue('--bg-elevated').trim(),
        color: getComputedStyle(root).getPropertyValue('--ink').trim(),
        border: `1px solid ${getComputedStyle(root).getPropertyValue('--warn').trim()}`,
      },
    });
    updateSession(sessionId, { state: 'awaiting-confirm' });
    document.title = `· ${agentName} 需要确认 — 狗头军师`;
    setTimeout(() => { document.title = '狗头军师 / Kynsage'; }, 3000);
    // 标题栏闪烁之外再「叮」一声，多开时不容易错过。
    if (useSettingsStore.getState().soundOnConfirm) playConfirmChime();
  };

  const handleCwdChange = (sessionId: string, cwd: string): void => {
    updateSession(sessionId, { cwd });
    if (sessionId === activeSessionId) setCurrentPath(cwd);
  };

  // 任意输出（无节流）：用户响应确认后 Claude 一有输出，立刻撤掉「待确认」闪烁外框。
  // busyRef 节流会让 onProcessing 在确认后不再触发，故单独走这条无节流路径兜底。
  const handleActivity = (sessionId: string): void => {
    const st = useAgentsStore.getState().sessions.find((s) => s.id === sessionId)?.state;
    if (st === 'awaiting-confirm') updateSession(sessionId, { state: 'running' });
  };

  // 输出活动 → 处理中 / 待命。confirm 由 hook 设置；输出恢复(busy)即表示用户已响应，清掉确认态。
  const handleBusy = (sessionId: string, busy: boolean): void => {
    const st = useAgentsStore.getState().sessions.find((s) => s.id === sessionId)?.state;
    if (st === 'exited') return;
    if (busy) {
      updateSession(sessionId, { state: 'running' }); // 输出流动：处理中（也清除待确认）
    } else if (st !== 'awaiting-confirm') {
      updateSession(sessionId, { state: 'idle' });     // 静默：待命；但不覆盖待确认
    }
  };

  // Provider hook 信号：按 provider + session_id 找到对应 tab，驱动状态/标题。
  // 替代原先脆弱的正则匹配 + 静默计时启发式。
  useEffect(() => {
    const ce = window.agentEvents;
    if (!ce) return;

    const tabFor = (provider: AgentProvider, agentSessionId?: string): string | undefined => {
      if (!agentSessionId) return undefined;
      return useAgentsStore.getState().sessions.find((s) => (s.provider ?? 'claude') === provider && s.agentSessionId === agentSessionId)?.id;
    };

    const onHook = (evt: AgentHookEvent): void => {
      const tabId = tabFor(evt.provider ?? 'claude', evt.session_id);
      if (!tabId) return;
      const st = useAgentsStore.getState().sessions.find((s) => s.id === tabId)?.state;
      if (st === 'exited') return;
      if (evt.hook_event_name === 'Notification' && evt.notification_type === 'permission_prompt') {
        updateSession(tabId, { state: 'awaiting-confirm' });
        handleConfirmPrompt(tabId);
      } else if (evt.hook_event_name === 'Stop' || evt.notification_type === 'idle_prompt') {
        // Claude 回复结束 / 空闲待输入 → 「该你了」
        updateSession(tabId, { state: 'idle' });
      }
    };

    const onTitle = (provider: AgentProvider, agentSessionId: string, title: string): void => {
      const tabId = tabFor(provider, agentSessionId);
      if (tabId) updateSession(tabId, { name: title });
    };

    ce.onHook(onHook);
    ce.onTitle(onTitle);
    return () => {
      ce.offHook(onHook);
      ce.offTitle(onTitle);
    };
  }, []);

  useEffect(() => {
    const handleExit = (sessionId: string) => {
      updateSession(sessionId, { state: 'exited', ptyPid: null });
    };
    if (window.ptyEvents) {
      window.ptyEvents.onExit(handleExit);
      return () => window.ptyEvents.offExit(handleExit);
    }
  }, [updateSession]);

  if (sessions.length === 0) {
    return (
      <div className="terminal-area-container">
        <Toaster />
        {/* 「工作空间」纯标签已删：下面的启动页写着「新对话 / 接着上次」，
            已自解释；一个同事都没有时，顶栏那行本来就该是空的。 */}
        <WorkspaceLauncher {...launcherProps} />
      </div>
    );
  }

  const active = sessions.find((s) => s.id === activeSessionId) ?? sessions[0]!;

  return (
    <div className={`terminal-area-container ${active.state === 'awaiting-confirm' ? 'is-awaiting' : ''}`}>
      <Toaster />
      {/* term-bar（44px）已删：状态灯/名字/关闭按钮三项都是顶栏 tab 的复述，
          唯一独家的「路径」已升为通栏地址栏。终端内容直接顶到地址栏下面
          —— 与浏览器同构：tab 条 → 地址栏 → 内容，中间不插一条标题带。 */}
      <div className={`terminal-content ${mode === 'tile' ? 'tile-mode' : ''}`}>
        {sessions.map((session) => {
          const meta = STATE_META[session.state] ?? IDLE;
          return (
            <div
              key={session.id}
              className="terminal-pane"
              style={mode === 'tabs' ? {
                position: 'absolute',
                inset: 0,
                visibility: session.id === activeSessionId ? 'visible' : 'hidden',
                pointerEvents: session.id === activeSessionId ? 'auto' : 'none',
              } : undefined}
            >
              {mode === 'tile' && (
                <div className="pane-label">
                  <span className={`sig sig--${meta.dot}`} />
                  <span className="pane-label-name">{session.name}</span>
                  <span className="pane-label-path mono">{session.cwd}</span>
                </div>
              )}
              <div className="pane-term">
                <Terminal
                  sessionId={session.id}
                  cwd={session.cwd}
                  onReady={(cols, rows) => void handleTerminalReady(session.id, cols, rows)}
                  onCwdChange={(cwd) => handleCwdChange(session.id, cwd)}
                  onProcessing={() => handleBusy(session.id, true)}
                  onIdle={() => handleBusy(session.id, false)}
                  onActivity={() => handleActivity(session.id)}
                />
              </div>
            </div>
          );
        })}
      </div>

      {launcherOpen && (
        <div className="launcher-overlay" role="dialog" aria-modal="true">
          <WorkspaceLauncher overlay onClose={closeLauncher} {...launcherProps} />
        </div>
      )}
    </div>
  );
}
