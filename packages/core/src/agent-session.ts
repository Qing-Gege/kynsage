import type { AgentProvider } from '@kynsage/shared-types';

export type AgentState = 'idle' | 'running' | 'awaiting-confirm' | 'exited';

export interface AgentSession {
  id: string;
  name: string;
  cwd: string;
  /** 'agent'（默认）启动所选 AI CLI；'terminal' 只在 cwd 起一个纯 shell */
  kind?: 'agent' | 'terminal';
  /** 创建会话时固定 provider，后续设置变更不影响已运行会话。 */
  provider?: AgentProvider;
  state: AgentState;
  ptyPid: number | null;
  lastActivity: number;
  /** 启动时续上该目录最近一次 provider 会话（--continue） */
  resume?: boolean;
  /** 启动时恢复指定的历史对话（--resume <id>） */
  resumeSessionId?: string;
  /**
   * 该 tab 对应的 provider 会话 id。新建时由前端 crypto.randomUUID 生成并经
   * `--session-id <uuid>` 强制指定；恢复时即被恢复对话的 id。
   * hook 事件按此 id 精确对应到本 tab（状态翻转、rename 联动）。
   */
  agentSessionId?: string;
}

export interface StateTransition {
  from: AgentState;
  to: AgentState;
  guard?: (session: AgentSession) => boolean;
}

const VALID_TRANSITIONS: StateTransition[] = [
  { from: 'idle', to: 'running' },
  { from: 'running', to: 'idle' },
  { from: 'running', to: 'awaiting-confirm' },
  { from: 'running', to: 'exited' },
  { from: 'awaiting-confirm', to: 'running' },
  { from: 'awaiting-confirm', to: 'exited' },
  { from: 'exited', to: 'idle', guard: (s) => s.ptyPid === null },
];

export class AgentSessionStateMachine {
  canTransition(session: AgentSession, to: AgentState): boolean {
    const transition = VALID_TRANSITIONS.find(
      (t) => t.from === session.state && t.to === to
    );
    if (!transition) return false;
    if (transition.guard && !transition.guard(session)) return false;
    return true;
  }

  transition(session: AgentSession, to: AgentState): AgentSession {
    if (!this.canTransition(session, to)) {
      throw new Error(
        `Invalid transition: ${session.state} -> ${to} for agent ${session.id}`
      );
    }
    return {
      ...session,
      state: to,
      lastActivity: Date.now(),
    };
  }

  create(id: string, name: string, cwd: string): AgentSession {
    return {
      id,
      name,
      cwd,
      state: 'idle',
      ptyPid: null,
      lastActivity: Date.now(),
    };
  }
}
