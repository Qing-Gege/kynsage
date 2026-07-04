import { describe, it, expect } from 'vitest';
import { AgentSessionStateMachine } from './agent-session.js';

describe('AgentSessionStateMachine', () => {
  const machine = new AgentSessionStateMachine();

  it('creates agent in idle state', () => {
    const session = machine.create('a1', 'Agent 1', '/tmp');
    expect(session.state).toBe('idle');
    expect(session.id).toBe('a1');
    expect(session.cwd).toBe('/tmp');
    expect(session.ptyPid).toBeNull();
  });

  it('allows idle -> running', () => {
    const s = machine.create('a1', 'Agent 1', '/tmp');
    expect(machine.canTransition(s, 'running')).toBe(true);
    const next = machine.transition(s, 'running');
    expect(next.state).toBe('running');
  });

  it('allows running -> idle', () => {
    const s = machine.transition(machine.create('a1', 'A', '/'), 'running');
    expect(machine.canTransition(s, 'idle')).toBe(true);
    const next = machine.transition(s, 'idle');
    expect(next.state).toBe('idle');
  });

  it('allows running -> awaiting-confirm', () => {
    const s = machine.transition(machine.create('a1', 'A', '/'), 'running');
    expect(machine.canTransition(s, 'awaiting-confirm')).toBe(true);
    const next = machine.transition(s, 'awaiting-confirm');
    expect(next.state).toBe('awaiting-confirm');
  });

  it('allows running -> exited', () => {
    const s = machine.transition(machine.create('a1', 'A', '/'), 'running');
    expect(machine.canTransition(s, 'exited')).toBe(true);
    const next = machine.transition(s, 'exited');
    expect(next.state).toBe('exited');
  });

  it('allows awaiting-confirm -> running', () => {
    let s = machine.create('a1', 'A', '/');
    s = machine.transition(s, 'running');
    s = machine.transition(s, 'awaiting-confirm');
    expect(machine.canTransition(s, 'running')).toBe(true);
    const next = machine.transition(s, 'running');
    expect(next.state).toBe('running');
  });

  it('allows awaiting-confirm -> exited', () => {
    let s = machine.create('a1', 'A', '/');
    s = machine.transition(s, 'running');
    s = machine.transition(s, 'awaiting-confirm');
    expect(machine.canTransition(s, 'exited')).toBe(true);
    const next = machine.transition(s, 'exited');
    expect(next.state).toBe('exited');
  });

  it('allows exited -> idle only when ptyPid is null', () => {
    let s = machine.create('a1', 'A', '/');
    s = machine.transition(s, 'running');
    s = { ...s, ptyPid: 1234 };
    s = machine.transition(s, 'exited');
    expect(machine.canTransition(s, 'idle')).toBe(false);

    s = { ...s, ptyPid: null };
    expect(machine.canTransition(s, 'idle')).toBe(true);
    const next = machine.transition(s, 'idle');
    expect(next.state).toBe('idle');
  });

  it('rejects idle -> awaiting-confirm', () => {
    const s = machine.create('a1', 'A', '/');
    expect(machine.canTransition(s, 'awaiting-confirm')).toBe(false);
    expect(() => machine.transition(s, 'awaiting-confirm')).toThrow(/Invalid transition/);
  });

  it('rejects idle -> exited', () => {
    const s = machine.create('a1', 'A', '/');
    expect(machine.canTransition(s, 'exited')).toBe(false);
    expect(() => machine.transition(s, 'exited')).toThrow(/Invalid transition/);
  });

  it('rejects awaiting-confirm -> idle', () => {
    let s = machine.create('a1', 'A', '/');
    s = machine.transition(s, 'running');
    s = machine.transition(s, 'awaiting-confirm');
    expect(machine.canTransition(s, 'idle')).toBe(false);
    expect(() => machine.transition(s, 'idle')).toThrow(/Invalid transition/);
  });

  it('updates lastActivity on every transition', () => {
    const s = machine.create('a1', 'A', '/');
    const before = s.lastActivity;
    const next = machine.transition(s, 'running');
    expect(next.lastActivity).toBeGreaterThanOrEqual(before);
  });
});
