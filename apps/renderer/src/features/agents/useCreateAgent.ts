import { useCallback } from 'react';
import { useAgentsStore } from '../../stores/agents';
import { useSettingsStore } from '../../stores/settings';
import { useNavStore } from '../../stores/nav';
import { AgentSessionStateMachine } from '@marshal/core';
import { trpc } from '../../trpc';

const machine = new AgentSessionStateMachine();

/**
 * Two creation entries share this logic:
 *  - command strip → current browsing dir (每个目录对应一个案件, the main flow)
 *  - sidebar       → default dir (settings.startDir || home, for case-less agents)
 */
export function useCreateAgent(): {
  createInDir: (cwd: string, opts?: { resume?: boolean; resumeSessionId?: string; name?: string }) => void;
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
  const currentPath = useNavStore((s) => s.currentPath);

  const createInDir = useCallback(
    (cwd: string, opts?: { resume?: boolean; resumeSessionId?: string; name?: string }) => {
      const id = `agent-${Date.now()}`;
      const label = memberLabel?.trim() || '同事';
      const fallbackName = `${label} ${useAgentsStore.getState().sessions.length + 1}`;
      // 恢复指定对话 → 用其 id；全新对话 → 自生成 uuid 并经 --session-id 强制指定。
      // 两种情况下 claudeSessionId 都在启动前已知，hook 事件可据此精确对应到本 tab。
      const claudeSessionId =
        opts?.resumeSessionId || (opts?.resume ? undefined : crypto.randomUUID());
      addSession({
        ...machine.create(id, opts?.name || fallbackName, cwd),
        resume: opts?.resume,
        resumeSessionId: opts?.resumeSessionId,
        claudeSessionId,
      });
    },
    [addSession, memberLabel]
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

  // 纯终端：在 cwd 起一个 shell，不启动 claude（kind: 'terminal'，无 claudeSessionId）
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
      const rows = (await (trpc as any).listSessions.query({ cwd })) as
        { sessionId: string; title: string; mtime: number }[];
      if (rows.length > 0) {
        createInDir(cwd, { resumeSessionId: rows[0]!.sessionId, name: rows[0]!.title });
        return;
      }
    } catch { /* 落到 --continue */ }
    createInDir(cwd, { resume: true });
  }, [createInDir]);

  // 恢复指定历史对话（claude --resume <id>），用其标题命名 tab
  const restoreSessionById = useCallback((cwd: string, sessionId: string, title?: string) => {
    createInDir(cwd, { resumeSessionId: sessionId, name: title });
  }, [createInDir]);

  void sessions;
  return { createInDir, createInDefaultDir, createInCurrentDir, openTerminalInCurrentDir, restoreSession, restoreSessionById };
}
