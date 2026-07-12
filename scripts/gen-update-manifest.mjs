// 生成自动更新清单 release/kynsage-latest.json —— 供应用内「检查更新」拉取比对。
// 用法:先打包(pnpm build:win / build:mac),再 `node scripts/gen-update-manifest.mjs`。
// electron-builder 只吐 latest.yml(给 electron-updater),我们走自研的极简 JSON 清单,故单独生成。
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const version = pkg.version;

// OSS 下载根地址(安装包与本清单同目录上传)
const OSS_BASE = 'https://wizpatent.oss-cn-shenzhen.aliyuncs.com/';
const releaseDir = join(root, 'release');

// 平台 key 需与 ipc-contract checkUpdate 里的映射一致:win-x64 / mac-arm64 / mac-x64
const targets = [
  { key: 'win-x64', file: `kynsage-${version}-win-x64.exe` },
  { key: 'mac-arm64', file: `kynsage-${version}-mac-arm64.dmg` },
  { key: 'mac-x64', file: `kynsage-${version}-mac-x64.dmg` },
];

const sha512 = (p) => createHash('sha512').update(readFileSync(p)).digest('base64');

const downloads = {};
for (const t of targets) {
  const p = join(releaseDir, t.file);
  if (!existsSync(p)) continue;
  downloads[t.key] = { url: OSS_BASE + t.file, size: statSync(p).size, sha512: sha512(p) };
}

if (Object.keys(downloads).length === 0) {
  console.error(`✗ release/ 下未找到 kynsage-${version}-* 安装包,请先打包`);
  process.exit(1);
}

const manifest = {
  version,
  releaseDate: new Date().toISOString(),
  notes: process.env.RELEASE_NOTES ?? '',
  downloads,
};

const out = join(releaseDir, 'kynsage-latest.json');
writeFileSync(out, JSON.stringify(manifest, null, 2) + '\n');
console.log(`✓ 已生成 ${out}  (v${version})`);
for (const [k, v] of Object.entries(downloads)) {
  console.log(`  ${k.padEnd(9)} ${(v.size / 1e6).toFixed(1)}MB  ${v.url}`);
}
console.log(`\n上传到 OSS:上面各安装包 + kynsage-latest.json,清单固定地址:`);
console.log(`  ${OSS_BASE}kynsage-latest.json`);
