import { useCallback } from 'react';
import { useAgentsStore } from '../../stores/agents';
import { useSettingsStore } from '../../stores/settings';
import { useNavStore } from '../../stores/nav';
import { AgentSessionStateMachine } from '@kynsage/core';
import type { AgentProvider } from '@kynsage/shared-types';
import { trpc } from '../../trpc';

const machine = new AgentSessionStateMachine();

/**
 * Two creation entries share this logic:
 *  - command strip → current browsing dir (每个目录对应一个案件, the main flow)
 *  - sidebar       → default dir (settings.startDir || home, for case-less agents)
 */
export function useCreateAgent(): {
  createInDir: (cwd: string, opts?: { resume?: boolean; resumeSessionId?: string; name?: string; provider?: AgentProvider }) => void;
  createInDefaultDir: () => Promise<void>;
  createInCurrentDir: () => Promise<void>;
  openTerminalInCurrentDir: () => Promise<void>;
  restoreSession: (cwd: string) => Promise<void>;
  restoreSessionById: (cwd: string, sessionId: string, title?: string) => void;
} {
  const sessions = useAgentsStore((s) => s.sessions);
  const addSession = useAgentsStore((s) => s.addSession);
  const startDir = useSettingsStore((s) => s.startDir);
  const memberLabel = useSettingsStore((s) => s.memberLabel);
  const agentProvider = useSettingsStore((s) => s.agentProvider);
  const currentPath = useNavStore((s) => s.currentPath);

  const createInDir = useCallback(
    (cwd: string, opts?: { resume?: boolean; resumeSessionId?: string; name?: string; provider?: AgentProvider }) => {
      const id = `agent-${Date.now()}`;
      const label = memberLabel?.trim() || '同事';
      const fallbackName = `${label} ${useAgentsStore.getState().sessions.length + 1}`;
      // 恢复指定对话 → 用其 id；全新对话 → 自生成 uuid 并经 --session-id 强制指定。
      // 两种情况下 agentSessionId 都在启动前已知，hook 事件可据此精确对应到本 tab。
      const agentSessionId =
        opts?.resumeSessionId || (opts?.resume ? undefined : crypto.randomUUID());
      const provider = opts?.provider ?? agentProvider;
      addSession({
        ...machine.create(id, opts?.name || fallbackName, cwd),
        resume: opts?.resume,
        resumeSessionId: opts?.resumeSessionId,
        agentSessionId,
        provider,
      });
    },
    [addSession, agentProvider, memberLabel]
  );

  const resolveDefault = useCallback(async (): Promise<string> => {
    if (startDir) return startDir;
    try {
      return (await (trpc as any).getHomeDir.query()) as string;
    } catch {
      return '/';
    }
  }, [startDir]);

  const createInDefaultDir = useCallback(async () => {
    createInDir(await resolveDefault());
  }, [createInDir, resolveDefault]);

  const createInCurrentDir = useCallback(async () => {
    createInDir(currentPath || (await resolveDefault()));
  }, [createInDir, currentPath, resolveDefault]);

  // 纯终端：在 cwd 起一个 shell，不启动 provider（kind: 'terminal'，无 agentSessionId）
  const openTerminalInDir = useCallback((cwd: string) => {
    const id = `term-${Date.now()}`;
    const n = useAgentsStore.getState().sessions.length + 1;
    addSession({ ...machine.create(id, `终端 ${n}`, cwd), kind: 'terminal' });
  }, [addSession]);

  const openTerminalInCurrentDir = useCallback(async () => {
    openTerminalInDir(currentPath || (await resolveDefault()));
  }, [openTerminalInDir, currentPath, resolveDefault]);

  // 项目记忆：在该目录续上最近一次对话。优先查出最近会话 id 走 --resume <id>
  // （hook 能据 id 对应 tab）；查不到再回落 --continue。
  const restoreSession = useCallback(async (cwd: string) => {
    try {
      const rows = (await (trpc as any).listSessions.query({ cwd, provider: agentProvider })) as
        { sessionId: string; title: string; mtime: number; cwd: string }[];
      if (rows.length > 0) {
        // 用会话保存的原始 cwd 启动，provider 才能命中原会话目录（Windows 关键）
        createInDir(rows[0]!.cwd || cwd, { resumeSessionId: rows[0]!.sessionId, name: rows[0]!.title, provider: agentProvider });
        return;
      }
    } catch { /* 落到 --continue */ }
    createInDir(cwd, { resume: true, provider: agentProvider });
  }, [agentProvider, createInDir]);

  // 恢复指定历史对话（--resume <id>），用其标题命名 tab
  const restoreSessionById = useCallback((cwd: string, sessionId: string, title?: string) => {
    createInDir(cwd, { resumeSessionId: sessionId, name: title, provider: agentProvider });
  }, [agentProvider, createInDir]);

  void sessions;
  return { createInDir, createInDefaultDir, createInCurrentDir, openTerminalInCurrentDir, restoreSession, restoreSessionById };
}
