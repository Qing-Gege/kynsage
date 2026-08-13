import { describe, expect, it } from 'vitest';
import { buildAgentCommand } from './provider-command.js';

describe('buildAgentCommand', () => {
  it('adds Claude settings and a new session id', () => {
    expect(buildAgentCommand({
      provider: 'claude', executable: 'claude', isWindows: false,
      sessionId: '123', claudeSettingsPath: '/tmp/kynsage hooks.json',
    })).toBe('claude --settings "/tmp/kynsage hooks.json" --session-id "123"\r');
  });

  it('starts Grok without the Claude-only settings flag', () => {
    expect(buildAgentCommand({
      provider: 'grok', executable: 'grok', isWindows: false, resumeSessionId: 'abc',
      claudeSettingsPath: '/tmp/ignored.json',
    })).toBe('grok --resume "abc"\r');
  });

  it('quotes a Windows executable path', () => {
    expect(buildAgentCommand({
      provider: 'grok', executable: 'C:\\Program Files\\Grok\\grok.exe', isWindows: true, resume: true,
    })).toBe('& "C:\\Program Files\\Grok\\grok.exe" --continue\r');
  });
});
