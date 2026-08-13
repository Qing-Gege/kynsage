import type { AgentProvider } from '@kynsage/shared-types';

export interface AgentCommandOptions {
  provider: AgentProvider;
  executable: string;
  isWindows: boolean;
  sessionId?: string;
  resume?: boolean;
  resumeSessionId?: string;
  claudeSettingsPath?: string;
}

function quoteExecutable(executable: string, isWindows: boolean): string {
  if (!/\s/.test(executable)) return executable;
  return isWindows ? `& "${executable}"` : `"${executable.replace(/(["\\$`])/g, '\\$1')}"`;
}

function quoteArg(value: string): string {
  return `"${value.replace(/(["\\$`])/g, '\\$1')}"`;
}

export function buildAgentCommand(options: AgentCommandOptions): string {
  const args: string[] = [];
  if (options.provider === 'claude' && options.claudeSettingsPath) {
    args.push('--settings', quoteArg(options.claudeSettingsPath));
  }
  if (options.resumeSessionId) {
    args.push('--resume', quoteArg(options.resumeSessionId));
  } else if (options.resume) {
    args.push('--continue');
  } else if (options.sessionId) {
    args.push('--session-id', quoteArg(options.sessionId));
  }
  return `${quoteExecutable(options.executable, options.isWindows)}${args.length ? ` ${args.join(' ')}` : ''}\r`;
}
