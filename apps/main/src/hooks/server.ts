import * as http from 'node:http';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

/**
 * Claude Code hook 事件（取我们关心的字段；其余忽略）。
 * 见 https://code.claude.com/docs/en/hooks —— 每个事件都带 session_id / cwd，
 * 多数还带 transcript_path。
 */
export interface HookEvent {
  hook_event_name: string;          // 'Notification' | 'Stop' | 'SessionStart' | ...
  session_id?: string;
  cwd?: string;
  transcript_path?: string;
  notification_type?: string;       // Notification: 'permission_prompt' | 'idle_prompt' | ...
  message?: string;
}

export interface HookServer {
  /** 传给 `claude --settings <这个文件>`，里面是 Notification/Stop → http hook 配置 */
  settingsPath: string;
  /** server 真实监听端口（ephemeral）。listen 完成前为 0。 */
  port: number;
  /** settings 文件已带真实端口写好后 resolve（listen 是异步绑定，端口要等回调才确定） */
  ready: Promise<void>;
  /** 把 Claude Code 主题写进 settings（让新启动的 claude 配色跟随 app 主题）。
   *  传 undefined 则移除 theme 键，回退到用户全局设置。只应在 ready resolve 后调用。 */
  setTheme(theme: string | undefined): void;
  close(): void;
}

/**
 * 起一个只听 127.0.0.1 的本地 HTTP server 接收 Claude Code hook 回调，
 * 并把对应的 settings 文件写到磁盘（供 `--settings` 指向）。
 *
 * 安全：仅绑定回环地址；用一次性随机 token 走 query 校验，挡掉本机其它进程乱发。
 * 跨平台：纯 http hook，不依赖 osascript/notify-send 等平台命令（Windows 友好）。
 */
export function startHookServer(onEvent: (evt: HookEvent) => void): HookServer {
  const token = crypto.randomBytes(16).toString('hex');

  const server = http.createServer((req, res) => {
    if (req.method !== 'POST' || !req.url?.includes(`token=${token}`)) {
      res.writeHead(403).end();
      return;
    }
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) req.destroy(); // 防滥用
    });
    req.on('end', () => {
      try {
        const evt = JSON.parse(body) as HookEvent;
        onEvent(evt);
      } catch {
        // 坏 payload 忽略
      }
      // hook 期望 JSON 响应；空对象=放行、不干预 Claude 行为
      res.writeHead(200, { 'Content-Type': 'application/json' }).end('{}');
    });
  });

  // 写到 app 专属临时目录，不污染用户 ~/.claude/settings.json
  const dir = path.join(os.tmpdir(), 'kynsage-hooks');
  fs.mkdirSync(dir, { recursive: true });
  const settingsPath = path.join(dir, 'hooks.settings.json');

  // 当前写出的 settings 对象（listen 回调里赋值）；setTheme 据此合并 theme 后重写文件。
  let settings: Record<string, unknown> | null = null;

  const result: HookServer = {
    settingsPath,
    port: 0,
    ready: Promise.resolve(), // 占位，下面覆盖
    setTheme: (theme: string | undefined) => {
      if (!settings) return; // ready 前不会被调用，防御性兜底
      if (theme) settings.theme = theme;
      else delete settings.theme;
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
    },
    close: () => server.close(),
  };

  // listen 是异步绑定——必须在 'listening' 回调里读 address() 才拿得到真实端口；
  // 此前 server.address().port 为 0，会写出连不上的 127.0.0.1:0（Stop hook error）。
  result.ready = new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = addr && typeof addr === 'object' ? addr.port : 0;
      result.port = port;

      const url = `http://127.0.0.1:${port}/?token=${token}`;
      settings = {
        hooks: {
          // 需要用户介入：权限确认 / 空闲等待输入
          Notification: [
            { hooks: [{ type: 'http', url, timeout: 5 }] },
          ],
          // Claude 回复结束 → 「该你了」
          Stop: [
            { hooks: [{ type: 'http', url, timeout: 5 }] },
          ],
          // 会话开始/恢复 → 拿到 transcript_path 以便监听 rename
          SessionStart: [
            { hooks: [{ type: 'http', url, timeout: 5 }] },
          ],
        },
      };
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
      resolve();
    });
  });

  return result;
}
