export const AGENT_PROVIDERS = ['claude', 'grok'] as const;

export type AgentProvider = (typeof AGENT_PROVIDERS)[number];

export const DEFAULT_AGENT_PROVIDER: AgentProvider = 'claude';

export const AGENT_PROVIDER_LABEL: Record<AgentProvider, string> = {
  claude: 'Claude Code',
  grok: 'Grok',
};
