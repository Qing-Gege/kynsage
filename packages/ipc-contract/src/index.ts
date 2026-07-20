import { initTRPC } from '@trpc/server';
import { observable } from '@trpc/server/observable';
import { z } from 'zod';
import type { EventEmitter } from 'node:events';
import { toNativePath, winPathKey } from '@kynsage/shared-types';

const t = initTRPC.create({ isServer: true });

// —— 极简无依赖 ZIP（STORE 法）+ 最小合法 docx 生成 ——
function crc32(buf: Buffer): number {
  let crc = ~0;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i]!;
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (~crc) >>> 0;
}

function buildZip(entries: { name: string; data: Buffer }[]): Buffer {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, 'utf8');
    const crc = crc32(e.data);
    const size = e.data.length;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);      // store
    local.writeUInt16LE(0, 10);     // time
    local.writeUInt16LE(0x21, 12);  // date 1980-01-01
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(size, 18);
    local.writeUInt32LE(size, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    parts.push(local, nameBuf, e.data);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0, 8);
    cd.writeUInt16LE(0, 10);
    cd.writeUInt16LE(0, 12);
    cd.writeUInt16LE(0x21, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(size, 20);
    cd.writeUInt32LE(size, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt16LE(0, 30);
    cd.writeUInt16LE(0, 32);
    cd.writeUInt16LE(0, 34);
    cd.writeUInt16LE(0, 36);
    cd.writeUInt32LE(0, 38);
    cd.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([cd, nameBuf]));
    offset += local.length + nameBuf.length + e.data.length;
  }
  const centralBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...parts, centralBuf, eocd]);
}

// 最小可被 Word 打开的空白 .docx
function emptyDocx(): Buffer {
  const b = (s: string): Buffer => Buffer.from(s, 'utf8');
  return buildZip([
    { name: '[Content_Types].xml', data: b('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>') },
    { name: '_rels/.rels', data: b('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>') },
    { name: 'word/document.xml', data: b('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p/><w:sectPr/></w:body></w:document>') },
  ]);
}

// 读 jsonl 头尾，取 cwd / 标题 / 首条 human 文本
// 头部读 cwd + firstHuman；尾部单独读以获取 /rename 写入的最新 ai-title（追加在末尾）
export async function peekSession(
  fs: typeof import('node:fs/promises'),
  file: string,
): Promise<{ cwd: string | null; title: string | null }> {
  const HEAD = 64 * 1024;
  const TAIL = 32 * 1024;
  const fh = await fs.open(file, 'r');
  try {
    const { size } = await fh.stat();
    let cwd: string | null = null;
    // 标题优先级：custom-title(用户 /rename，最高) > ai-title(AI 自动) > 首条 human 文本
    let customTitle: string | null = null;
    let aiTitle: string | null = null;
    let firstHuman: string | null = null;

    const scan = (line: string): void => {
      if (!line.trim()) return;
      let obj: any;
      try { obj = JSON.parse(line); } catch { return; }
      if (!cwd && typeof obj.cwd === 'string') cwd = obj.cwd;
      // /rename 写的是 {"type":"custom-title","customTitle":...}；AI 自动标题是 ai-title。
      // 两者都可能在文件末尾追加，后出现的覆盖先出现的（取最新一次重命名）。
      if (obj.type === 'custom-title' && typeof obj.customTitle === 'string') customTitle = obj.customTitle;
      if (obj.type === 'ai-title' && typeof obj.aiTitle === 'string') aiTitle = obj.aiTitle;
      // 首条真人输入：新版用 promptSource:"typed" 标识真人敲入（工具结果回灌是 null + 数组 content）；
      // 老版无 promptSource 但有 origin.kind:"human"，做兼容兜底。
      if (
        !firstHuman &&
        obj.type === 'user' &&
        obj.isSidechain === false &&
        (obj.promptSource === 'typed' || obj.origin?.kind === 'human')
      ) {
        firstHuman = contentText(obj.message?.content);
      }
    };

    // --- 头部 ---
    const headBuf = Buffer.alloc(HEAD);
    const { bytesRead: headRead } = await fh.read(headBuf, 0, HEAD, 0);
    const headLines = headBuf.toString('utf8', 0, headRead).split('\n');
    if (headRead === HEAD) headLines.pop(); // 末行可能截断
    for (const line of headLines) scan(line);

    // --- 尾部（/rename 追加的 title 在文件末尾）---
    if (size > HEAD) {
      const tailStart = Math.max(HEAD, size - TAIL);
      const tailBuf = Buffer.alloc(TAIL);
      const { bytesRead: tailRead } = await fh.read(tailBuf, 0, TAIL, tailStart);
      const tailLines = tailBuf.toString('utf8', 0, tailRead).split('\n');
      tailLines.shift(); // 首行可能被截断，丢弃
      for (const line of tailLines) scan(line);
    }

    const raw = customTitle || aiTitle || firstHuman || '';
    const title = raw.replace(/\s+/g, ' ').trim().slice(0, 40) || null;
    return { cwd, title };
  } finally {
    await fh.close();
  }
}

function contentText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.filter((c: any) => c?.type === 'text').map((c: any) => c.text).join(' ');
  }
  return '';
}

// 在 destDir 下为 baseName 找一个不冲突的目标路径：已存在则插入「 副本」/「 副本 2」…
// fs/path 由调用方传入（procedure 内已动态 import）。
async function uniqueDest(
  fs: typeof import('node:fs/promises'),
  path: typeof import('node:path'),
  destDir: string,
  baseName: string,
): Promise<string> {
  const ext = path.extname(baseName);
  const stem = ext ? baseName.slice(0, -ext.length) : baseName;
  let candidate = path.join(destDir, baseName);
  let i = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await fs.access(candidate);
    } catch {
      return candidate; // 不存在 → 可用
    }
    const suffix = i === 1 ? ' 副本' : ` 副本 ${i}`;
    candidate = path.join(destDir, `${stem}${suffix}${ext}`);
    i += 1;
  }
}

// 语义化版本比较：a>b→1, a<b→-1, 相等→0（缺省段按 0）。
function cmpVer(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

// 更新清单地址（见 scripts/gen-update-manifest.mjs 生成）——海外优先、国内备用。
// 依次尝试:先 GitHub Release（全球可达），拉不到再退回国内 OSS 兜底。
// 每份清单里的下载地址各自指向同源（GitHub 清单指 GitHub、OSS 清单指 OSS），
// 命中哪份就用哪份的包地址，天然配对，无需客户端再拼。
const UPDATE_MANIFEST_SOURCES: Array<{ url: string; timeoutMs: number }> = [
  // GitHub 在国内常超时，故设短超时，超时立刻切下一个，不干等
  { url: 'https://github.com/Qing-Gege/kynsage/releases/latest/download/kynsage-latest.json', timeoutMs: 3500 },
  { url: 'https://wizpatent.oss-cn-shenzhen.aliyuncs.com/kynsage-latest.json', timeoutMs: 8000 },
];

interface UpdateManifest {
  version?: string;
  notes?: string;
  downloads?: Record<string, { url?: string }>;
}

// 拉单个清单，带超时（AbortController）。失败/超时抛错，交给上层继续 fallback。
async function fetchManifest(url: string, timeoutMs: number): Promise<UpdateManifest> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { redirect: 'follow', signal: ac.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const m = (await res.json()) as UpdateManifest;
    if (!m.version) throw new Error('清单缺 version 字段');
    return m;
  } finally {
    clearTimeout(timer);
  }
}

// 按顺序尝试所有清单源，第一个成功即返回；全失败则抛出汇总错误。
async function fetchManifestWithFallback(): Promise<UpdateManifest> {
  const errors: string[] = [];
  for (const src of UPDATE_MANIFEST_SOURCES) {
    try {
      return await fetchManifest(src.url, src.timeoutMs);
    } catch (e) {
      errors.push(`${new URL(src.url).host}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  throw new Error(`更新检查失败（已试 ${UPDATE_MANIFEST_SOURCES.length} 个源）：${errors.join('；')}`);
}

function createAppRouter(): any {
  return t.router({
    ping: t.procedure.query(() => 'pong'),
    getPlatform: t.procedure.query(() => process.platform),
    // 检查更新：main 侧直接 fetch 清单 JSON（不走渲染进程，规避 CORS），
    // 海外优先、国内备用地依次尝试，比对当前版本，返回是否有新版及对应平台的下载地址。
    checkUpdate: t.procedure.query(async () => {
      let current = '0.0.0';
      try {
        const { app } = await import('electron');
        current = app.getVersion();
      } catch { /* 非 electron 环境（测试）保留兜底 */ }
      const m = await fetchManifestWithFallback();
      const latest = m.version ?? current;
      const key =
        process.platform === 'win32'
          ? 'win-x64'
          : process.platform === 'darwin'
            ? process.arch === 'arm64' ? 'mac-arm64' : 'mac-x64'
            : 'linux-x64';
      const url = m.downloads?.[key]?.url ?? null;
      return { current, latest, hasUpdate: cmpVer(latest, current) > 0, url, notes: m.notes ?? '' };
    }),
    // 用系统默认浏览器打开外链（下载新版安装包）
    openExternal: t.procedure.input(z.object({ url: z.string() })).mutation(async ({ input }) => {
      if (!/^https?:\/\//.test(input.url)) return false;
      const { shell } = await import('electron');
      await shell.openExternal(input.url);
      return true;
    }),
    // hook settings 文件路径（main 启动 hook server 时写好），供 `claude --settings` 指向
    getHookSettingsPath: t.procedure
      .input(z.object({ claudeTheme: z.enum(['dark', 'light', 'dark-ansi', 'light-ansi', 'dark-daltonized', 'light-daltonized']).optional() }).optional())
      .query(async ({ input, ctx }) => {
        const { getHookSettingsPath } = ctx as { getHookSettingsPath?: (theme?: string) => string | Promise<string> };
        return (await getHookSettingsPath?.(input?.claudeTheme)) ?? '';
      }),
    // 监听某个目录的变化（文件区当前目录）；传 null 停止监听。变化时 main 推送 'fs-changed' 事件
    watchDir: t.procedure
      .input(z.object({ path: z.string().nullable() }))
      .mutation(({ input, ctx }) => {
        const { watchDir } = ctx as { watchDir?: (dir: string | null) => void };
        watchDir?.(input.path);
        return true;
      }),
    getHomeDir: t.procedure.query(async () => {
      const os = await import('node:os');
      return os.homedir();
    }),
    // Windows 盘符列表（C:\ D:\ …），其他平台返回空数组
    getDrives: t.procedure.query(async () => {
      if (process.platform !== 'win32') return [];
      const fs = await import('node:fs/promises');
      const drives: string[] = [];
      for (let c = 65; c <= 90; c++) {
        const drive = `${String.fromCharCode(c)}:\\`;
        try { await fs.access(drive); drives.push(drive); } catch { /* 不存在 */ }
      }
      return drives;
    }),
    // 用 Electron app.getPath() 获取正确的系统目录（Windows 支持重定向路径）
    getSpecialPaths: t.procedure.query(({ ctx }) => {
      const { getSpecialPaths } = ctx as { getSpecialPaths?: () => { home: string; desktop: string; documents: string; downloads: string } };
      if (getSpecialPaths) return getSpecialPaths();
      // fallback for non-electron environments
      const os = require('node:os');
      const nodePath = require('node:path');
      const home = os.homedir();
      return { home, desktop: nodePath.join(home, 'Desktop'), documents: nodePath.join(home, 'Documents'), downloads: nodePath.join(home, 'Downloads') };
    }),
    getRecentClaudeDirs: t.procedure.query(async () => {
      const fs = await import('node:fs/promises');
      const path = await import('node:path');
      const os = await import('node:os');
      const projectsDir = path.join(os.homedir(), '.claude', 'projects');
      try {
        const hashes = await fs.readdir(projectsDir);
        const results: { name: string; path: string; mtime: number }[] = [];
        for (const hash of hashes) {
          const hashDir = path.join(projectsDir, hash);
          try {
            const files = await fs.readdir(hashDir);
            const jsonls = files.filter((f) => f.endsWith('.jsonl'));
            if (jsonls.length === 0) continue;
            // 取最新的 jsonl
            const latest = jsonls[jsonls.length - 1] ?? '';
            if (!latest) continue;
            const stat = await fs.stat(path.join(hashDir, latest));
            const content = await fs.readFile(path.join(hashDir, latest), 'utf-8');
            const lines = content.split('\n').filter(Boolean);
            let cwd = '';
            for (const line of lines) {
              try {
                const obj = JSON.parse(line) as { cwd?: string };
                // Unix 绝对路径以 / 开头；Windows 为盘符 C:\ 或 UNC \\server
                if (obj.cwd && (obj.cwd.startsWith('/') || /^[A-Za-z]:[\\/]/.test(obj.cwd) || obj.cwd.startsWith('\\\\'))) { cwd = obj.cwd; break; }
              } catch { /* skip */ }
            }
            if (!cwd) continue;
            const name = cwd.replace(/[/\\]+$/, '').split(/[/\\]/).pop() || cwd;
            results.push({ name, path: cwd, mtime: stat.mtimeMs });
          } catch { /* skip */ }
        }
        // 去重 + 按时间倒序取前10（Windows 下大小写/分隔符无关，避免同目录多形式重复）
        const seen = new Set<string>();
        return results
          .sort((a, b) => b.mtime - a.mtime)
          .filter((r) => { const k = winPathKey(r.path); if (seen.has(k)) return false; seen.add(k); return true; })
          .slice(0, 10);
      } catch {
        return [];
      }
    }),
    echo: t.procedure.input(z.object({ message: z.string() })).query(({ input }) => input.message),

    // 列出某工作目录的历史 Claude 对话（供「历史对话」下拉恢复）
    listSessions: t.procedure
      .input(z.object({ cwd: z.string() }))
      .query(async ({ input }) => {
        const fs = await import('node:fs/promises');
        const path = await import('node:path');
        const os = await import('node:os');
        const projectsDir = path.join(os.homedir(), '.claude', 'projects');
        const out: { sessionId: string; title: string; mtime: number; cwd: string }[] = [];
        // Windows 下大小写+分隔符无关匹配，兼容旧会话的不同路径写法
        const wantKey = winPathKey(input.cwd);
        try {
          const hashes = await fs.readdir(projectsDir);
          for (const hash of hashes) {
            const dir = path.join(projectsDir, hash);
            let jsonls: string[];
            try {
              jsonls = (await fs.readdir(dir)).filter((f) => f.endsWith('.jsonl'));
            } catch { continue; }
            if (jsonls.length === 0) continue;
            // 逐文件读 cwd 匹配——不能用「探第一个文件，不匹配就跳过整目录」的短路：
            // 首文件可能读不到 cwd（首行是 type:"mode" 无 cwd），会误丢整目录的对话。
            for (const f of jsonls) {
              const full = path.join(dir, f);
              try {
                const meta = await peekSession(fs, full);
                if (!meta.cwd || winPathKey(meta.cwd) !== wantKey) continue;
                const st = await fs.stat(full);
                out.push({
                  sessionId: f.replace(/\.jsonl$/, ''),
                  title: meta.title || '未命名对话',
                  mtime: st.mtimeMs,
                  // 返回会话保存的原始 cwd：resume 时用它启动，Claude 才能重编码命中原 projects 目录
                  cwd: meta.cwd,
                });
              } catch { /* 跳过坏文件 */ }
            }
          }
        } catch { return []; }
        return out.sort((a, b) => b.mtime - a.mtime).slice(0, 20);
      }),

    // 删除某条历史 Claude 对话（按 sessionId 定位 .jsonl 文件删除）
    deleteSession: t.procedure
      .input(z.object({ sessionId: z.string() }))
      .mutation(async ({ input }) => {
        const fs = await import('node:fs/promises');
        const path = await import('node:path');
        const os = await import('node:os');
        // sessionId 必须是纯净的文件名，禁止路径穿越
        if (!/^[A-Za-z0-9._-]+$/.test(input.sessionId)) return false;
        const projectsDir = path.join(os.homedir(), '.claude', 'projects');
        const target = `${input.sessionId}.jsonl`;
        let deleted = false;
        try {
          const hashes = await fs.readdir(projectsDir);
          for (const hash of hashes) {
            const full = path.join(projectsDir, hash, target);
            try {
              await fs.unlink(full);
              deleted = true;
            } catch { /* 该目录下没有这个文件，继续找 */ }
          }
        } catch { return false; }
        return deleted;
      }),

    fs: t.router({
      readdir: t.procedure
        .input(z.object({ path: z.string() }))
        .query(async ({ input }) => {
          const fs = await import('node:fs/promises');
          const path = await import('node:path');

          try {
            const entries = await fs.readdir(input.path, { withFileTypes: true });
            // Windows 隐藏文件不靠 . 前缀，而是文件系统属性（Node 的 Stats 不暴露该位）。
            // 不引原生模块：用 . 前缀 + Windows 常见隐藏/系统项名单覆盖现实中的噪音文件。
            const WIN_HIDDEN = new Set([
              'desktop.ini', 'thumbs.db', 'ehthumbs.db', '$recycle.bin',
              'system volume information', 'pagefile.sys', 'hiberfil.sys', 'swapfile.sys',
            ]);
            const isWin = process.platform === 'win32';
            const isHiddenName = (name: string): boolean => {
              if (name.startsWith('.')) return true;
              if (isWin) {
                const lower = name.toLowerCase();
                if (WIN_HIDDEN.has(lower)) return true;
                if (lower.startsWith('ntuser.')) return true; // ntuser.dat / .ini 等
              }
              return false;
            };
            return await Promise.all(entries.map(async (entry) => {
              const fullPath = path.join(input.path, entry.name);
              let mtime = 0, size = 0;
              try {
                const st = await fs.stat(fullPath);
                mtime = st.mtimeMs;
                size = st.size;
              } catch { /* ignore */ }
              return {
                name: entry.name,
                path: fullPath,
                isDirectory: entry.isDirectory(),
                isFile: entry.isFile(),
                isHidden: isHiddenName(entry.name),
                mtime,
                size,
              };
            }));
          } catch (err) {
            console.error('fs.readdir error:', err);
            return [];
          }
        }),

      // 解析用户粘贴/输入的路径 -> 可跳转的目录绝对路径
      // 兼容 Windows「复制为路径」（外包双引号、反斜杠、裸盘符）；文件路径落到所在目录
      resolveDir: t.procedure
        .input(z.object({ raw: z.string() }))
        .query(async ({ input }) => {
          const fs = await import('node:fs/promises');
          const path = await import('node:path');
          const os = await import('node:os');

          let p = input.raw.trim();
          // 剥掉成对引号：Windows 资源管理器「复制为路径」默认包双引号，偶尔单引号
          if (p.length >= 2 && ((p.startsWith('"') && p.endsWith('"')) || (p.startsWith("'") && p.endsWith("'")))) {
            p = p.slice(1, -1).trim();
          }
          if (!p) return { ok: false as const, reason: 'empty' as const };

          // ~ / ~/x 展开（Windows 少见但无害）
          if (p === '~' || p.startsWith('~/') || p.startsWith('~\\')) {
            p = path.join(os.homedir(), p.slice(1));
          }
          // 裸盘符 "C:" 指当前盘当前目录，并非根，补成 "C:\\"
          if (/^[A-Za-z]:$/.test(p)) p += '\\';

          try {
            const st = await fs.stat(p);
            const dir = st.isDirectory() ? p : path.dirname(p);
            // 统一分隔符/形式，避免地址栏手敲路径与其他入口不一致
            return { ok: true as const, dir: toNativePath(path.resolve(dir)) };
          } catch {
            return { ok: false as const, reason: 'notfound' as const };
          }
        }),

      readFile: t.procedure
        .input(z.object({ path: z.string() }))
        .query(async ({ input }) => {
          const fs = await import('node:fs/promises');
          try {
            const stat = await fs.stat(input.path);
            // 限制 5MB
            if (stat.size > 5 * 1024 * 1024) {
              return `[文件过大: ${(stat.size / 1024 / 1024).toFixed(2)}MB,无法预览]`;
            }
            return await fs.readFile(input.path, 'utf-8');
          } catch (err) {
            throw new Error(err instanceof Error ? err.message : String(err));
          }
        }),

      writeFile: t.procedure
        .input(z.object({ path: z.string(), content: z.string() }))
        .mutation(async ({ input }) => {
          const fs = await import('node:fs/promises');
          try {
            await fs.writeFile(input.path, input.content, 'utf-8');
            return true;
          } catch (err) {
            throw new Error(err instanceof Error ? err.message : String(err));
          }
        }),

      getFileIcon: t.procedure
        .input(z.object({ path: z.string() }))
        .query(async ({ input, ctx }) => {
          const { getFileIcon } = ctx as { getFileIcon?: (path: string) => Promise<string> };
          if (!getFileIcon) throw new Error('getFileIcon not available');
          return getFileIcon(input.path);
        }),

      openInSystem: t.procedure
        .input(z.object({ path: z.string() }))
        .mutation(async ({ input, ctx }) => {
          const { openInSystem } = ctx as { openInSystem?: (path: string) => Promise<void> };
          if (openInSystem) {
            await openInSystem(input.path);
            return true;
          }
          throw new Error('openInSystem not available');
        }),

      // 重命名（仅改名，不跨目录）
      rename: t.procedure
        .input(z.object({ path: z.string(), newName: z.string().min(1) }))
        .mutation(async ({ input }) => {
          const fs = await import('node:fs/promises');
          const path = await import('node:path');
          if (input.newName.includes('/') || input.newName.includes('\\')) {
            throw new Error('名称不能包含斜杠');
          }
          const dest = path.join(path.dirname(input.path), input.newName);
          await fs.rename(input.path, dest);
          return dest;
        }),

      // 复制（粘贴-复制）：每项算唯一目标名，递归复制
      copyEntries: t.procedure
        .input(z.object({ srcPaths: z.array(z.string()), destDir: z.string() }))
        .mutation(async ({ input }) => {
          const fs = await import('node:fs/promises');
          const path = await import('node:path');
          for (const src of input.srcPaths) {
            const dest = await uniqueDest(fs, path, input.destDir, path.basename(src));
            await fs.cp(src, dest, { recursive: true, errorOnExist: false });
          }
          return true;
        }),

      // 移动（粘贴-剪切）：先 rename，跨盘 EXDEV 退化为 复制+删除
      moveEntries: t.procedure
        .input(z.object({ srcPaths: z.array(z.string()), destDir: z.string() }))
        .mutation(async ({ input }) => {
          const fs = await import('node:fs/promises');
          const path = await import('node:path');
          for (const src of input.srcPaths) {
            if (path.dirname(src) === input.destDir) continue; // 原地，跳过
            const dest = await uniqueDest(fs, path, input.destDir, path.basename(src));
            try {
              await fs.rename(src, dest);
            } catch (err) {
              if ((err as NodeJS.ErrnoException).code === 'EXDEV') {
                await fs.cp(src, dest, { recursive: true });
                await fs.rm(src, { recursive: true, force: true });
              } else {
                throw err;
              }
            }
          }
          return true;
        }),

      // 删除到系统回收站（Windows 回收站 / mac 废纸篓）
      trash: t.procedure
        .input(z.object({ paths: z.array(z.string()) }))
        .mutation(async ({ input, ctx }) => {
          const { trashItem } = ctx as { trashItem?: (path: string) => Promise<void> };
          if (!trashItem) throw new Error('trashItem not available');
          for (const p of input.paths) await trashItem(p);
          return true;
        }),

      // 在系统文件管理器中定位（Windows 资源管理器 / mac 访达）
      reveal: t.procedure
        .input(z.object({ path: z.string() }))
        .mutation(async ({ input, ctx }) => {
          const { revealInFolder } = ctx as { revealInFolder?: (path: string) => void };
          if (!revealInFolder) throw new Error('revealInFolder not available');
          revealInFolder(input.path);
          return true;
        }),

      // 新建空文件夹（重名自动加「 副本」）
      createFolder: t.procedure
        .input(z.object({ dir: z.string(), name: z.string().min(1) }))
        .mutation(async ({ input }) => {
          const fs = await import('node:fs/promises');
          const path = await import('node:path');
          const dest = await uniqueDest(fs, path, input.dir, input.name);
          await fs.mkdir(dest);
          return dest;
        }),

      // 新建文件：md/txt 为空白文本，docx 为最小合法 Word 文档
      createFile: t.procedure
        .input(z.object({ dir: z.string(), name: z.string().min(1), kind: z.enum(['md', 'txt', 'docx']) }))
        .mutation(async ({ input }) => {
          const fs = await import('node:fs/promises');
          const path = await import('node:path');
          const dest = await uniqueDest(fs, path, input.dir, input.name);
          if (input.kind === 'docx') await fs.writeFile(dest, emptyDocx());
          else await fs.writeFile(dest, '', 'utf8');
          return dest;
        }),
    }),

    pty: t.router({
      spawn: t.procedure
        .input(
          z.object({
            id: z.string(),
            cwd: z.string(),
            command: z.string().optional(),
            args: z.array(z.string()).optional(),
            cols: z.number().optional(),
            rows: z.number().optional(),
          })
        )
        .mutation(({ input, ctx }) => {
          const { ptyManager } = ctx as { ptyManager: EventEmitter };
          const session = (ptyManager as any).spawn(
            input.id,
            input.cwd,
            input.command,
            input.args,
            input.cols,
            input.rows
          );
          // 不返回 ptyInstance(无法序列化)
          return { id: session.id, pid: session.pid, cwd: session.cwd };
        }),

      write: t.procedure
        .input(z.object({ sessionId: z.string(), data: z.string() }))
        .mutation(({ input, ctx }) => {
          const { ptyManager } = ctx as { ptyManager: EventEmitter };
          (ptyManager as any).write(input.sessionId, input.data);
        }),

      resize: t.procedure
        .input(z.object({ sessionId: z.string(), cols: z.number(), rows: z.number() }))
        .mutation(({ input, ctx }) => {
          const { ptyManager } = ctx as { ptyManager: EventEmitter };
          (ptyManager as any).resize(input.sessionId, input.cols, input.rows);
        }),

      kill: t.procedure
        .input(z.object({ sessionId: z.string() }))
        .mutation(({ input, ctx }) => {
          const { ptyManager } = ctx as { ptyManager: EventEmitter };
          (ptyManager as any).kill(input.sessionId);
        }),

      onData: t.procedure
        .input(z.object({ sessionId: z.string() }))
        .subscription(({ input, ctx }) => {
          const { ptyManager } = ctx as { ptyManager: EventEmitter };
          return observable<string>((emit) => {
            const handler = (id: string, data: string): void => {
              if (id === input.sessionId) {
                emit.next(data);
              }
            };
            ptyManager.on('data', handler);
            return () => {
              ptyManager.off('data', handler);
            };
          });
        }),

      onExit: t.procedure
        .input(z.object({ sessionId: z.string() }))
        .subscription(({ input, ctx }) => {
          const { ptyManager } = ctx as { ptyManager: EventEmitter };
          return observable<number>((emit) => {
            const handler = (id: string, exitCode: number): void => {
              if (id === input.sessionId) {
                emit.next(exitCode);
                emit.complete();
              }
            };
            ptyManager.on('exit', handler);
            return () => {
              ptyManager.off('exit', handler);
            };
          });
        }),
    }),
  });
}

export const appRouter = createAppRouter();
export type AppRouter = typeof appRouter;
