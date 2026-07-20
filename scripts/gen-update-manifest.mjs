// 生成自动更新清单 —— 供应用内「检查更新」拉取比对。
// 用法:先打包(pnpm build:win / build:mac),再 `node scripts/gen-update-manifest.mjs`。
// electron-builder 只吐 latest.yml(给 electron-updater),我们走自研的极简 JSON 清单,故单独生成。
// 产出两份(内容仅下载地址域名不同,校验和一致):
//   - kynsage-latest.json         国内版,包地址指 OSS,上传到 OSS 根目录
//   - kynsage-latest.github.json  海外版,包地址指 GitHub Release,作资产名 kynsage-latest.json 传到 Release
// 客户端 checkUpdate 海外优先、国内备用地依次拉这两份(见 packages/ipc-contract)。
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const version = pkg.version;

// 两个下载根地址(安装包各自上传到对应处)
const OSS_BASE = 'https://wizpatent.oss-cn-shenzhen.aliyuncs.com/';
const GH_BASE = 'https://github.com/Qing-Gege/kynsage/releases/latest/download/';
const releaseDir = join(root, 'release');

// 平台 key 需与 ipc-contract checkUpdate 里的映射一致:win-x64 / mac-arm64 / mac-x64
const targets = [
  { key: 'win-x64', file: `kynsage-${version}-win-x64.exe` },
  { key: 'mac-arm64', file: `kynsage-${version}-mac-arm64.dmg` },
  { key: 'mac-x64', file: `kynsage-${version}-mac-x64.dmg` },
];

const sha512 = (p) => createHash('sha512').update(readFileSync(p)).digest('base64');

// 先算一次校验和/大小(与域名无关),存文件名待会儿拼两种 base
const assets = [];
for (const t of targets) {
  const p = join(releaseDir, t.file);
  if (!existsSync(p)) continue;
  assets.push({ key: t.key, file: t.file, size: statSync(p).size, sha512: sha512(p) });
}

if (assets.length === 0) {
  console.error(`✗ release/ 下未找到 kynsage-${version}-* 安装包,请先打包`);
  process.exit(1);
}

const releaseDate = new Date().toISOString();
const notes = process.env.RELEASE_NOTES ?? '';

// 用指定 base 拼一份清单并写出
const buildManifest = (base) => ({
  version,
  releaseDate,
  notes,
  downloads: Object.fromEntries(
    assets.map((a) => [a.key, { url: base + a.file, size: a.size, sha512: a.sha512 }]),
  ),
});

const outputs = [
  { base: OSS_BASE, file: 'kynsage-latest.json', label: 'OSS(国内)' },
  { base: GH_BASE, file: 'kynsage-latest.github.json', label: 'GitHub(海外)' },
];

for (const o of outputs) {
  const out = join(releaseDir, o.file);
  writeFileSync(out, JSON.stringify(buildManifest(o.base), null, 2) + '\n');
  console.log(`✓ 已生成 ${out}  (v${version}) — ${o.label}`);
  for (const a of assets) {
    console.log(`  ${a.key.padEnd(9)} ${(a.size / 1e6).toFixed(1)}MB  ${o.base}${a.file}`);
  }
}

console.log(`\n上传步骤:`);
console.log(`  OSS   → 安装包 + kynsage-latest.json 传到 OSS 根目录`);
console.log(`         固定地址: ${OSS_BASE}kynsage-latest.json`);
console.log(`  GitHub→ 安装包传到 Release;kynsage-latest.github.json 以资产名 kynsage-latest.json 传到 Release`);
console.log(`         固定地址: ${GH_BASE}kynsage-latest.json`);
