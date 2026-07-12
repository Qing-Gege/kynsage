// Windows 路径归一化（纯字符串、无 fs，可安全用于渲染进程）。
//
// 判定「是否 Windows 路径」看内容而非 process.platform：cwd 总是绝对路径，
// 盘符 (C:\ / C:/) 或 UNC (\\server) 即 Windows；以 / 开头即 POSIX。这样
// 同一函数在主进程、渲染进程、ipc 层行为一致，无需各处探测平台。
//
// 为什么要归一化：Claude Code 把会话存到 ~/.claude/projects/<cwd 编码名>/，
// 编码把 \ / : 都换成 -（对分隔符不敏感），但 node-pty/conpty 无法用正斜杠
// cwd 去 chdir，且我们各处（地址栏/侧栏/OSC7/cd-tracker）产出的分隔符、大小写
// 不一，导致「列表匹配 / PTY 启动 / resume 重编码」三处对不上。统一到反斜杠原生
// 形式即可对齐。

const DRIVE_RE = /^[A-Za-z]:[\\/]/;   // C:\ 或 C:/
const UNC_RE = /^[\\/]{2}/;           // \\server 或 //server

function isWinPath(p: string): boolean {
  return DRIVE_RE.test(p) || UNC_RE.test(p);
}

function stripQuotes(p: string): string {
  const t = p.trim();
  if (t.length >= 2 && ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'")))) {
    return t.slice(1, -1).trim();
  }
  return t;
}

/**
 * 把 Windows 风格路径归一化为原生反斜杠形式；POSIX 路径原样返回。
 * - 剥去成对引号（Windows「复制为路径」带双引号）
 * - / 全换成 \；合并重复分隔符（UNC 前导 \\ 除外）
 * - 去掉末尾分隔符（盘符根 C:\、UNC 根除外）
 */
export function toNativePath(input: string): string {
  const p = stripQuotes(input);
  if (!p || !isWinPath(p)) return p;

  const isUnc = UNC_RE.test(p);
  let s = p.replace(/\//g, '\\');
  if (isUnc) {
    // 保留前导 \\，其余重复分隔符合并
    s = '\\\\' + s.slice(2).replace(/\\+/g, '\\');
  } else {
    s = s.replace(/\\+/g, '\\');
  }
  // 去末尾 \，但保留盘符根 "C:\" 与 UNC 根 "\\"
  if (s.length > 3 && s.endsWith('\\') && !(isUnc && s.length <= 3)) {
    if (!/^[A-Za-z]:\\$/.test(s)) s = s.replace(/\\+$/, '');
  }
  return s;
}

/**
 * 用于相等比较 / 去重的规范化 key：Windows 路径大小写无关（NTFS 不区分），
 * POSIX 保留原大小写（保持既有行为）。
 */
export function winPathKey(input: string): string {
  const native = toNativePath(input);
  return isWinPath(native) ? native.toLowerCase() : native;
}
