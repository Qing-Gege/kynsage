import { contextBridge, ipcRenderer, webUtils, clipboard } from 'electron';

// Single IPC listener per channel; callbacks registered/removed via pub-sub
const dataCallbacks = new Set<(sessionId: string, data: string) => void>();
const exitCallbacks = new Set<(sessionId: string, exitCode: number) => void>();
const hookCallbacks = new Set<(evt: unknown) => void>();
const titleCallbacks = new Set<(claudeSessionId: string, title: string) => void>();
const fsChangedCallbacks = new Set<(dir: string) => void>();

ipcRenderer.on('pty-data', (_e, sessionId: string, data: string) => {
  dataCallbacks.forEach((cb) => cb(sessionId, data));
});
ipcRenderer.on('pty-exit', (_e, sessionId: string, exitCode: number) => {
  exitCallbacks.forEach((cb) => cb(sessionId, exitCode));
});
// Claude Code hook 事件（Notification/Stop/SessionStart）+ 标题联动（/rename）
ipcRenderer.on('claude-hook', (_e, evt: unknown) => {
  hookCallbacks.forEach((cb) => cb(evt));
});
ipcRenderer.on('claude-title', (_e, claudeSessionId: string, title: string) => {
  titleCallbacks.forEach((cb) => cb(claudeSessionId, title));
});
// 文件区当前目录有增删改 → 通知渲染层刷新列表
ipcRenderer.on('fs-changed', (_e, dir: string) => {
  fsChangedCallbacks.forEach((cb) => cb(dir));
});

contextBridge.exposeInMainWorld('electronTRPC', {
  sendMessage: (op: { type: string; input: unknown; path: string; id: number }) => {
    ipcRenderer.send('electron-trpc-message', op);
  },
  onMessage: (callback: (data: unknown) => void) => {
    ipcRenderer.on('electron-trpc-message', (_event, data) => callback(data));
  },
});

contextBridge.exposeInMainWorld('ptyEvents', {
  onData: (cb: (sessionId: string, data: string) => void) => { dataCallbacks.add(cb); },
  offData: (cb: (sessionId: string, data: string) => void) => { dataCallbacks.delete(cb); },
  onExit: (cb: (sessionId: string, exitCode: number) => void) => { exitCallbacks.add(cb); },
  offExit: (cb: (sessionId: string, exitCode: number) => void) => { exitCallbacks.delete(cb); },
});

// Claude Code hook 信号（状态翻转 + rename 联动），按 claude session_id 对应 tab
contextBridge.exposeInMainWorld('claudeEvents', {
  onHook: (cb: (evt: unknown) => void) => { hookCallbacks.add(cb); },
  offHook: (cb: (evt: unknown) => void) => { hookCallbacks.delete(cb); },
  onTitle: (cb: (claudeSessionId: string, title: string) => void) => { titleCallbacks.add(cb); },
  offTitle: (cb: (claudeSessionId: string, title: string) => void) => { titleCallbacks.delete(cb); },
});

// 文件区目录变化订阅（main 端 fs.watch → 这里转给 FilesArea）
contextBridge.exposeInMainWorld('fsEvents', {
  onChange: (cb: (dir: string) => void) => { fsChangedCallbacks.add(cb); },
  offChange: (cb: (dir: string) => void) => { fsChangedCallbacks.delete(cb); },
});

contextBridge.exposeInMainWorld('windowControls', {
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
  onMaximizeChange: (cb: (maximized: boolean) => void) => {
    ipcRenderer.on('window:maximize-change', (_e, maximized: boolean) => cb(maximized));
  },
  // 上报「处理中」的 agent 数量，供主进程决定关窗前是否提醒
  reportBusyCount: (n: number) => ipcRenderer.send('window:busy-count', n),
});

// 拖入文件取真实路径 —— Electron 32+ 移除了 File.path，须经 webUtils。
contextBridge.exposeInMainWorld('fileBridge', {
  getPathForFile: (file: File): string => webUtils.getPathForFile(file),
});

// 剪贴板操作
contextBridge.exposeInMainWorld('clipboardBridge', {
  writeText: (text: string): void => clipboard.writeText(text),
  // 剪贴板里是图片（截图等）而非文本：用于 Ctrl+V 时区分「粘文本」还是「让 claude 自己读图」。
  // 读 NSPasteboard 的格式，和 claude 读的是同一份系统剪贴板，判断一致。
  hasImage: (): boolean => {
    const formats = clipboard.availableFormats();
    return formats.some((t) => t.startsWith('image/')) && !formats.includes('text/plain');
  },
  // 从「系统剪贴板」读被复制的文件路径（访达 / 资源管理器里 Cmd/Ctrl+C 的文件）。
  // 应用自己的复制/剪切走内部状态，这里专门补上「外部复制 → 应用内粘贴」这条路。
  readFilePaths: (): string[] => {
    try {
      if (process.platform === 'darwin') return readMacFilePaths();
      if (process.platform === 'win32') return readWinFilePaths();
    } catch { /* 读不到就当剪贴板里没有文件 */ }
    return [];
  },
});

// macOS：访达复制文件时写入 NSFilenamesPboardType，内容是一段 plist，
// 每个路径以 <string>…</string> 包裹。不引第三方解析器，直接抽取 string 节点。
function readMacFilePaths(): string[] {
  const raw = clipboard.read('NSFilenamesPboardType');
  if (!raw) return [];
  const out: string[] = [];
  const re = /<string>([\s\S]*?)<\/string>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    const p = decodeXmlEntities(m[1]!.trim());
    if (p) out.push(p);
  }
  return out;
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

// Windows：资源管理器复制文件时写入 CF_HDROP，结构是 DROPFILES 头 + 紧跟的文件名串。
// 头部 20 字节，offset 0 是 pFiles（名字串相对头部的字节偏移），offset 16 是 fWide（是否 UTF-16）。
// 文件名串以「单个分隔符 \0」分隔、整体以「双 \0」结尾。
function readWinFilePaths(): string[] {
  const buf = clipboard.readBuffer('CF_HDROP');
  if (!buf || buf.length < 20) return [];
  const pFiles = buf.readUInt32LE(0);
  const wide = buf.readUInt32LE(16) !== 0;
  if (pFiles >= buf.length) return [];
  const names = buf.subarray(pFiles);
  const text = wide ? names.toString('utf16le') : names.toString('latin1');
  // 去掉结尾的双 \0，再按 \0 切分，丢弃空段。
  return text.replace(/\0+$/, '').split('\0').filter(Boolean);
}
