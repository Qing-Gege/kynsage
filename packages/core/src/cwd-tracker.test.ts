import { describe, it, expect } from 'vitest';
import { CwdTracker } from './cwd-tracker.js';

describe('CwdTracker', () => {
  it('starts with initial cwd', () => {
    const tracker = new CwdTracker('/home/user');
    expect(tracker.getCurrentCwd()).toBe('/home/user');
  });

  it('detects cd command', () => {
    const tracker = new CwdTracker('/home/user');
    tracker.onPtyOutput('cd /tmp');
    expect(tracker.getCurrentCwd()).toBe('/tmp');
  });

  it('detects cd /d on Windows', () => {
    const tracker = new CwdTracker('C:\\Users\\user');
    tracker.onPtyOutput('cd /d D:\\projects');
    expect(tracker.getCurrentCwd()).toBe('D:\\projects');
  });

  it('detects pushd command', () => {
    const tracker = new CwdTracker('/home/user');
    tracker.onPtyOutput('pushd /var/log');
    expect(tracker.getCurrentCwd()).toBe('/var/log');
  });

  it('detects Set-Location -Path', () => {
    const tracker = new CwdTracker('C:\\Users\\user');
    tracker.onPtyOutput('Set-Location -Path C:\\Windows');
    expect(tracker.getCurrentCwd()).toBe('C:\\Windows');
  });

  it('detects Set-Location shorthand', () => {
    const tracker = new CwdTracker('C:\\Users\\user');
    tracker.onPtyOutput('Set-Location "C:\\Program Files"');
    expect(tracker.getCurrentCwd()).toBe('C:\\Program Files');
  });

  it('handles quoted paths', () => {
    const tracker = new CwdTracker('/home/user');
    tracker.onPtyOutput('cd "/tmp/path with spaces"');
    expect(tracker.getCurrentCwd()).toBe('/tmp/path with spaces');
  });

  it('prefers higher confidence sources', () => {
    const tracker = new CwdTracker('/home/user');
    tracker.onPeriodicRead('/var/log');
    tracker.onPtyOutput('cd /tmp');
    expect(tracker.getCurrentCwd()).toBe('/tmp');
  });

  it('prefers more recent sources when confidence is equal', () => {
    const tracker = new CwdTracker('/home/user');
    tracker.onPtyOutput('cd /tmp');
    tracker.onPtyOutput('cd /var');
    expect(tracker.getCurrentCwd()).toBe('/var');
  });

  it('resolves relative paths', () => {
    const tracker = new CwdTracker('/home/user');
    tracker.onPtyOutput('cd projects');
    expect(tracker.getCurrentCwd()).toBe('/home/user/projects');
  });

  it('resets to new initial cwd', () => {
    const tracker = new CwdTracker('/home/user');
    tracker.onPtyOutput('cd /tmp');
    tracker.reset('/new/start');
    expect(tracker.getCurrentCwd()).toBe('/new/start');
  });

  it('ignores non-cd output', () => {
    const tracker = new CwdTracker('/home/user');
    tracker.onPtyOutput('echo hello');
    tracker.onPtyOutput('ls -la');
    expect(tracker.getCurrentCwd()).toBe('/home/user');
  });
});
