import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { peekSession } from './index.js';

// peekSession 解析 Claude Code transcript(.jsonl) 取 cwd + 标题。
// 字段格式会随 claude 版本漂移——这些 fixture 锁住 v2.1.185 实测的真实格式，
// 防止再次回归（曾错认 ai-title / origin.kind，被这些坑过）。
const CWD = '/Users/quincy/work/case-x';

function jsonl(...objs: unknown[]): string {
  return objs.map((o) => JSON.stringify(o)).join('\n') + '\n';
}

let dir: string;
const files: string[] = [];

async function write(name: string, content: string): Promise<string> {
  const p = path.join(dir, name);
  await fsp.writeFile(p, content, 'utf8');
  files.push(p);
  return p;
}

beforeAll(async () => {
  dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'peek-test-'));
});

afterAll(async () => {
  await fsp.rm(dir, { recursive: true, force: true });
});

describe('peekSession', () => {
  it('reads cwd even when the first line has no cwd (type:"mode")', async () => {
    const f = await write('mode-first.jsonl', jsonl(
      { type: 'mode', mode: 'default' },               // 首行无 cwd
      { type: 'user', isSidechain: false, promptSource: 'typed', cwd: CWD, message: { content: 'hello world' } },
    ));
    const { cwd } = await peekSession(fsp, f);
    expect(cwd).toBe(CWD);
  });

  it('falls back to first typed human message when no title row', async () => {
    const f = await write('no-title.jsonl', jsonl(
      { type: 'mode' },
      { type: 'user', isSidechain: false, promptSource: 'typed', cwd: CWD, message: { content: 'qs-OA 分析意见' } },
      { type: 'assistant', cwd: CWD, message: { content: 'ok' } },
    ));
    const { title } = await peekSession(fsp, f);
    expect(title).toBe('qs-OA 分析意见');
  });

  it('ignores tool-result user rows (promptSource null, array content) for title', async () => {
    const f = await write('tool-result.jsonl', jsonl(
      { type: 'mode' },
      { type: 'user', isSidechain: false, promptSource: 'typed', cwd: CWD, message: { content: '真人的第一句' } },
      { type: 'user', isSidechain: false, promptSource: null, cwd: CWD, message: { content: [{ type: 'tool_result', content: 'noise' }] } },
    ));
    const { title } = await peekSession(fsp, f);
    expect(title).toBe('真人的第一句');
  });

  it('prefers custom-title (/rename) over the first human message', async () => {
    const f = await write('custom-title.jsonl', jsonl(
      { type: 'mode' },
      { type: 'user', isSidechain: false, promptSource: 'typed', cwd: CWD, message: { content: '原始第一句' } },
      { type: 'custom-title', customTitle: '评审', sessionId: 'x' },
    ));
    const { title } = await peekSession(fsp, f);
    expect(title).toBe('评审');
  });

  it('prefers custom-title over ai-title', async () => {
    const f = await write('both-titles.jsonl', jsonl(
      { type: 'user', isSidechain: false, promptSource: 'typed', cwd: CWD, message: { content: 'first' } },
      { type: 'ai-title', aiTitle: 'auto-generated', sessionId: 'x' },
      { type: 'custom-title', customTitle: '用户改的', sessionId: 'x' },
    ));
    const { title } = await peekSession(fsp, f);
    expect(title).toBe('用户改的');
  });

  it('takes the latest custom-title when renamed twice', async () => {
    const f = await write('renamed-twice.jsonl', jsonl(
      { type: 'user', isSidechain: false, promptSource: 'typed', cwd: CWD, message: { content: 'first' } },
      { type: 'custom-title', customTitle: '第一次', sessionId: 'x' },
      { type: 'custom-title', customTitle: '第二次', sessionId: 'x' },
    ));
    const { title } = await peekSession(fsp, f);
    expect(title).toBe('第二次');
  });

  it('supports legacy origin.kind:"human" rows', async () => {
    const f = await write('legacy.jsonl', jsonl(
      { type: 'user', isSidechain: false, origin: { kind: 'human' }, cwd: CWD, message: { content: '老格式输入' } },
    ));
    const { title } = await peekSession(fsp, f);
    expect(title).toBe('老格式输入');
  });

  it('extracts text from array content blocks', async () => {
    const f = await write('array-content.jsonl', jsonl(
      { type: 'user', isSidechain: false, promptSource: 'typed', cwd: CWD, message: { content: [{ type: 'text', text: '数组里的文本' }] } },
    ));
    const { title } = await peekSession(fsp, f);
    expect(title).toBe('数组里的文本');
  });

  it('truncates long titles to 40 chars', async () => {
    const long = '一'.repeat(60);
    const f = await write('long.jsonl', jsonl(
      { type: 'user', isSidechain: false, promptSource: 'typed', cwd: CWD, message: { content: long } },
    ));
    const { title } = await peekSession(fsp, f);
    expect(title).toHaveLength(40);
  });

  it('returns null title when there is no usable content', async () => {
    const f = await write('empty.jsonl', jsonl(
      { type: 'mode' },
      { type: 'assistant', cwd: CWD, message: { content: 'only assistant' } },
    ));
    const { cwd, title } = await peekSession(fsp, f);
    expect(cwd).toBe(CWD);
    expect(title).toBeNull();
  });
});
