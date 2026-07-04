import { app, BrowserWindow, shell, ipcMain, nativeImage, dialog } from 'electron';
import path from 'node:path';
import * as fsp from 'node:fs/promises';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { appRouter, peekSession } from '@marshal/ipc-contract';
import { PtyManager } from './pty/index.js';
import { startHookServer } from './hooks/server.js';
import type { HookEvent } from './hooks/server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = !app.isPackaged;

// 应用图标 —— dev 运行时从项目 build/ 目录加载；打包时由 electron-builder 自动处理
const iconExt = process.platform === 'win32' ? 'icon.ico' : 'icon.icns';
const appIcon = nativeImage.createFromPath(path.join(__dirname, '../../../build', iconExt));

let mainWindow: BrowserWindow | null = null;
const ptyManager = new PtyManager();

// Bridge PTY output/exit back to the renderer. The preload listens on the
// 'pty-data' / 'pty-exit' channels (window.ptyEvents); without this forward
// the shell receives keystrokes but its output never reaches xterm — the
// terminal looks frozen / "won't accept input".
ptyManager.on('data', (sessionId: string, data: string) => {
  mainWindow?.webContents.send('pty-data', sessionId, data);
});
ptyManager.on('exit', (sessionId: string, exitCode: number) => {
  mainWindow?.webContents.send('pty-exit', sessionId, exitCode);
});

// --- Claude Code hook 接入 ---
// 本地 HTTP server 收 Notification/Stop/SessionStart 事件，转给 renderer 驱动状态；
// 同时按 transcript_path 监听对应 jsonl，文件变化(含 /rename)时重读标题并联动 UI。
const titleWatchers = new Map<string, fs.FSWatcher>();    // transcriptPath -> watcher
const titleDebounce = new Map<string, NodeJS.Timeout>();  // transcriptPath -> timer
const titleWatchedSessions = new Set<string>();           // 已开始盯标题的 session（按 session-id 去重）

// --- 文件区目录监听 ---
// 渲染层每次切目录就调用 fs.watchDir(path)，主进程只盯「当前这一个」目录。
// 目录内任何增删改（claude 生成文件 / 终端操作 / 外部）去抖后推送 fs-changed，文件区据此自动刷新。
let dirWatcher: fs.FSWatcher | null = null;
let dirWatchPath: string | null = null;
let dirWatchDebounce: NodeJS.Timeout | null = null;

function watchDir(targetPath: string | null): void {
  if (targetPath === dirWatchPath) return; // 同一目录，免重复装
  if (dirWatcher) { dirWatcher.close(); dirWatcher = null; }
  if (dirWatchDebounce) { clearTimeout(dirWatchDebounce); dirWatchDebounce = null; }
  dirWatchPath = targetPath;
  if (!targetPath) return;
  try {
    dirWatcher = fs.watch(targetPath, () => {
      if (dirWatchDebounce) clearTimeout(dirWatchDebounce);
      // 写文件常触发多次事件，去抖后只通知一次；带上路径供渲染层比对当前目录
      dirWatchDebounce = setTimeout(() => {
        mainWindow?.webContents.send('fs-changed', targetPath);
      }, 250);
    });
  } catch { /* 目录不存在/无权限：忽略，下次切目录再试 */ }
}

// hook 的 SessionStart/Notification/Stop payload 里 transcript_path 常为 null（实测 v2.1.185），
// 不能依赖它。但 --session-id 被 claude 采纳作 transcript 文件名（实测），故可按
// <session-id>.jsonl 在 ~/.claude/projects/* 下定位，与 transcript_path 是否下发无关。
async function resolveTranscriptPath(claudeSessionId: string): Promise<string | null> {
  try {
    const base = path.join(app.getPath('home'), '.claude', 'projects');
    const dirs = await fsp.readdir(base);
    for (const d of dirs) {
      const candidate = path.join(base, d, `${claudeSessionId}.jsonl`);
      try {
        await fsp.access(candidate);
        return candidate;
      } catch { /* 不在这个目录，继续 */ }
    }
  } catch { /* projects 目录不存在 */ }
  return null;
}

function watchTranscript(claudeSessionId: string, transcriptPath: string): void {
  if (!claudeSessionId || !transcriptPath || titleWatchers.has(transcriptPath)) return;
  const readAndSend = (): void => {
    void (async () => {
      try {
        const meta = await peekSession(fsp, transcriptPath);
        if (meta.title) {
          mainWindow?.webContents.send('claude-title', claudeSessionId, meta.title);
        }
      } catch { /* 文件正被写/暂不可读，忽略 */ }
    })();
  };
  let watcher: fs.FSWatcher;
  try {
    watcher = fs.watch(transcriptPath, () => {
      // 文件写入频繁，去抖后再读标题
      const prev = titleDebounce.get(transcriptPath);
      if (prev) clearTimeout(prev);
      titleDebounce.set(transcriptPath, setTimeout(readAndSend, 400));
    });
  } catch {
    return; // 文件还不存在等，下一次事件再试
  }
  titleWatchers.set(transcriptPath, watcher);
  // 装上 watcher 时立即读一次：恢复会话 / watcher 装好前已写入的标题不会漏到下次写入才出现。
  readAndSend();
}

const hookServer = startHookServer((evt: HookEvent) => {
  if (evt.session_id) {
    mainWindow?.webContents.send('claude-hook', evt);
  }
  // 开始盯标题变化（/rename 联动）。payload 的 transcript_path 实测常为 null，
  // 故优先用它，缺失时按 <session-id>.jsonl 自行定位。
  if (evt.session_id && !titleWatchedSessions.has(evt.session_id)) {
    const sid = evt.session_id;
    titleWatchedSessions.add(sid);
    void (async () => {
      const p = evt.transcript_path ?? (await resolveTranscriptPath(sid));
      if (p) watchTranscript(sid, p);
      else titleWatchedSessions.delete(sid); // 没找到，下次事件再试
    })();
  }
});

app.on('before-quit', () => {
  hookServer.close();
  for (const w of titleWatchers.values()) w.close();
});

// Manual tRPC IPC handler
ipcMain.on('electron-trpc-message', async (event, op) => {
  try {
    const caller = appRouter.createCaller({
      ptyManager,
      openInSystem: async (filePath: string) => {
        const result = await shell.openPath(filePath);
        if (result) throw new Error(result);
      },
      getFileIcon: async (filePath: string) => {
        const icon = await app.getFileIcon(filePath, { size: 'normal' });
        return icon.toDataURL();
      },
      trashItem: async (filePath: string) => {
        await shell.trashItem(filePath);
      },
      revealInFolder: (filePath: string) => {
        shell.showItemInFolder(filePath);
      },
      getSpecialPaths: () => ({
        home: app.getPath('home'),
        desktop: app.getPath('desktop'),
        documents: app.getPath('documents'),
        downloads: app.getPath('downloads'),
      }),
      getHookSettingsPath: async (theme?: string) => {
        await hookServer.ready; // 确保 settings 已带真实端口写好（listen 异步），否则 claude 拿到 :0 连不上
        hookServer.setTheme(theme); // 让新启动的 claude 配色跟随 app 主题
        return hookServer.settingsPath;
      },
      watchDir: (dir: string | null) => {
        watchDir(dir);
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const procedure = op.path.split('.').reduce((obj: any, key: string) => obj[key], caller);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (procedure as any)(op.input);
    event.reply('electron-trpc-message', { id: op.id, result });
  } catch (error) {
    event.reply('electron-trpc-message', {
      id: op.id,
      error: { message: error instanceof Error ? error.message : 'Unknown error' }
    });
  }
});

ipcMain.on('window:minimize', () => mainWindow?.minimize());
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on('window:close', () => mainWindow?.close());

// 渲染进程上报「处理中」的 agent 数量（state==='running'）。关窗前据此决定是否提醒。
// 未上报时默认 0 —— 安全放行，不弹框。
let busyCount = 0;
ipcMain.on('window:busy-count', (_e, n: number) => { busyCount = Number(n) || 0; });

console.log('PTY Manager ready:', ptyManager);

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: '#0f0f0f',
    frame: false,
    show: false,
    icon: appIcon,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (isDev) {
    const devUrl = process.env.VITE_DEV_SERVER_URL ?? 'http://localhost:5173';
    void mainWindow.loadURL(devUrl);
    mainWindow.webContents.openDevTools();
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      void shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.maximize();
    mainWindow?.show();
  });

  mainWindow.on('maximize', () => mainWindow?.webContents.send('window:maximize-change', true));
  mainWindow.on('unmaximize', () => mainWindow?.webContents.send('window:maximize-change', false));

  // 关窗前：若有 agent 正在处理中，弹原生确认框拦一下（覆盖自定义关闭按钮 / Alt+F4 / Cmd+Q
  // 全部路径——它们最终都走 close 事件）。allowClose 哨兵避免确认后二次关闭又弹一遍。
  let allowClose = false;
  mainWindow.on('close', (e) => {
    if (allowClose || busyCount <= 0) return; // 没人处理中 → 直接放行
    e.preventDefault();
    const choice = dialog.showMessageBoxSync(mainWindow!, {
      type: 'warning',
      buttons: ['取消', '仍要退出'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
      title: '还有终端在处理中',
      message: busyCount === 1 ? '有 1 个终端正在处理中' : `有 ${busyCount} 个终端正在处理中`,
      detail: '关闭窗口会中断它们正在进行的工作，确定要退出吗？',
    });
    if (choice === 1) { allowClose = true; mainWindow?.close(); }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('ready', () => {
  if (process.platform === 'darwin') app.dock?.setIcon(appIcon);
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
