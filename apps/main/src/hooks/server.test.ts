import { describe, expect, it } from 'vitest';
import { normalizeHookEvent } from './server.js';

describe('normalizeHookEvent', () => {
  it('normalizes Grok camelCase fields and snake_case event names', () => {
    expect(normalizeHookEvent({
      hookEventName: 'session_start',
      sessionId: 'grok-session',
      notificationType: 'permission_prompt',
    }, 'grok')).toMatchObject({
      provider: 'grok',
      hook_event_name: 'SessionStart',
      session_id: 'grok-session',
      notification_type: 'permission_prompt',
    });
  });

  it('preserves Claude event names and snake_case fields', () => {
    expect(normalizeHookEvent({ hook_event_name: 'Stop', session_id: 'claude-session' }, 'claude'))
      .toMatchObject({ provider: 'claude', hook_event_name: 'Stop', session_id: 'claude-session' });
  });
});
