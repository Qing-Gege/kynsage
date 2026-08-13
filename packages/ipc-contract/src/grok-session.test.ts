import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { describe, expect, it } from 'vitest';
import { readGrokSessions } from './index.js';

describe('readGrokSessions', () => {
  it('reads Grok summary metadata and ignores incomplete sessions', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'kynsage-grok-session-'));
    const valid = path.join(root, '%2Fworkspace', 'session-1');
    const incomplete = path.join(root, '%2Fworkspace', 'session-2');
    await mkdir(valid, { recursive: true });
    await mkdir(incomplete, { recursive: true });
    await writeFile(path.join(valid, 'summary.json'), JSON.stringify({
      info: { id: 'session-1', cwd: '/workspace' },
      generated_title: 'Grok 会话标题',
      updated_at: '2026-08-14T01:02:03.000Z',
    }));
    await writeFile(path.join(incomplete, 'summary.json'), '{}');

    const rows = await readGrokSessions(fsp, path, root);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ sessionId: 'session-1', title: 'Grok 会话标题', cwd: '/workspace' });
    expect(rows[0]!.mtime).toBe(Date.parse('2026-08-14T01:02:03.000Z'));
  });
});
