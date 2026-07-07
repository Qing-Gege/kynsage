import type { IPty } from 'node-pty';
import * as pty from 'node-pty';
import { EventEmitter } from 'node:events';
import * as os from 'node:os';
import * as fs from 'node:fs';

export interface PtySession {
  id: string;
  pid: number;
  cwd: string;
  ptyInstance: IPty;
}

export interface PtyManagerEvents {
  data: [sessionId: string, data: string];
  exit: [sessionId: string, exitCode: number];
}

export declare interface PtyManager {
  on<K extends keyof PtyManagerEvents>(
    event: K,
    listener: (...args: PtyManagerEvents[K]) => void
  ): this;
  emit<K extends keyof PtyManagerEvents>(event: K, ...args: PtyManagerEvents[K]): boolean;
}

export class PtyManager extends EventEmitter {
  private sessions = new Map<string, PtySession>();

  spawn(
    id: string,
    cwd: string,
    command?: string,
    args?: string[],
    cols = 80,
    rows = 24
  ): PtySession {
    if (this.sessions.has(id)) {
      // 已存在则直接返回，避免崩溃
      return this.sessions.get(id)!;
    }

    // 学 FanBox: 用 SHELL 环境变量, 加 -l (login shell) 读 .zprofile 拿到 Homebrew/nvm 路径
    const shellPath =
      command ||
      process.env.SHELL ||
      (process.platform === 'win32' ? 'powershell.exe' : '/bin/zsh');
    const shellArgs =
      args ?? (process.platform === 'win32' ? [] : ['-l']);

    // 目录不存在时回落到主目录,避免 spawn 报错
    const startCwd = cwd && fs.existsSync(cwd) ? cwd : os.homedir();

    // GUI 启动的 app 不继承 shell 的 locale,中文路径会被 zsh 按字节转义成乱码
    const env: Record<string, string> = {
      ...(process.env as Record<string, string>),
      TERM: 'xterm-256color',
      KYNSAGE: '1',
    };
    if (!/UTF-8/i.test(env.LC_ALL || env.LC_CTYPE || env.LANG || '')) {
      env.LANG = process.platform === 'darwin' ? 'zh_CN.UTF-8' : 'C.UTF-8';
    }
    // Windows: Electron 继承的 PATH 通常不含 npm 全局 bin，手动补上
    if (process.platform === 'win32') {
      const appdata = env.APPDATA || os.homedir();
      const npmGlobal = `${appdata}\\npm`;
      const extraPaths = [
        npmGlobal,
        `${env.LOCALAPPDATA || appdata}\\npm`,
        `${env.ProgramFiles || 'C:\\Program Files'}\\nodejs`,
        `${env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'}\\nodejs`,
      ];
      const currentPath = env.PATH || env.Path || '';
      env.PATH = [...extraPaths, currentPath].join(';');
    }

    const ptyInstance = pty.spawn(shellPath, shellArgs, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: startCwd,
      env,
    });

    const session: PtySession = {
      id,
      pid: ptyInstance.pid,
      cwd: startCwd,
      ptyInstance,
    };

    ptyInstance.onData((data) => {
      this.emit('data', id, data);
    });

    ptyInstance.onExit(({ exitCode }) => {
      this.emit('exit', id, exitCode);
      this.sessions.delete(id);
    });

    this.sessions.set(id, session);
    return session;
  }

  write(sessionId: string, data: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.ptyInstance.write(data);
  }

  resize(sessionId: string, cols: number, rows: number): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    try {
      session.ptyInstance.resize(cols, rows);
    } catch {
      // pty 已死,忽略
    }
  }

  kill(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.ptyInstance.kill();
    this.sessions.delete(sessionId);
  }

  getSession(sessionId: string): PtySession | undefined {
    return this.sessions.get(sessionId);
  }

  getAllSessions(): PtySession[] {
    return Array.from(this.sessions.values());
  }
}
