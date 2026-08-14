import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = join(import.meta.dirname, '..');
const app = ['mac-arm64', 'mac', 'mac-universal']
  .map((dir) => join(root, 'release', dir, '狗头军师.app'))
  .find(existsSync);

if (!app) {
  console.error('✗ release/ 下未找到 macOS 应用包，请先执行 pnpm build:mac');
  process.exit(1);
}

const result = spawnSync(
  'codesign',
  ['--verify', '--deep', '--strict', '--verbose=4', app],
  { stdio: 'inherit' },
);

if (result.status !== 0) {
  console.error('✗ macOS 应用签名无效，停止发布');
  process.exit(result.status ?? 1);
}

console.log(`✓ macOS 应用签名有效：${app}`);
