// 拖拽移动的安全守卫（纯字符串、无 fs，可用于渲染进程与主进程）。
//
// 为什么单独抽出来测：把文件夹拖进它自己、或拖进它自己的子目录，是
// 会真丢数据的操作 —— rename 到自身子路径在各平台行为不一（有的报错、
// 有的把目录搬空）。这里在发 IPC 之前就把这类源过滤掉，宁可少移一项。
//
// 判定用「已归一化的分隔符」做前缀比较，而不是拼 path 模块，理由同
// win-path：同一函数要在渲染进程、主进程、ipc 层给出一致结果。

/** 取该路径所用的分隔符（含反斜杠即视为 Windows 风格）。 */
function sepOf(p: string): string {
  return p.includes('\\') ? '\\' : '/';
}

/** 去掉尾部分隔符，让 `/a/b/` 与 `/a/b` 等价（盘根 `C:\` 保留）。 */
function trimEnd(p: string): string {
  if (/^[A-Za-z]:[\\/]?$/.test(p)) return p;
  let out = p;
  while (out.length > 1 && (out.endsWith('/') || out.endsWith('\\'))) out = out.slice(0, -1);
  return out;
}

/** Windows 路径大小写不敏感；POSIX 敏感。比较键按平台风格归一。 */
function key(p: string): string {
  const t = trimEnd(p);
  return sepOf(t) === '\\' ? t.toLowerCase() : t;
}

/** dest 是否等于 src 或落在 src 内部（含多层嵌套）。 */
export function isInsideOrSame(dest: string, src: string): boolean {
  const d = key(dest);
  const s = key(src);
  if (d === s) return true;
  return d.startsWith(s + sepOf(trimEnd(src)));
}

/**
 * 过滤出可安全移入 destDir 的源路径。
 * 剔除三类：目标就是自己、目标在自己内部、源已经直接位于目标目录下（原地移动，无意义）。
 */
export function safeMoveSources(srcPaths: string[], destDir: string): string[] {
  return srcPaths.filter((src) => {
    if (isInsideOrSame(destDir, src)) return false;
    // 已经在目标目录里 → 原地移动，跳过（资源管理器同样不动作）
    const sep = sepOf(src);
    const parent = trimEnd(src).slice(0, trimEnd(src).lastIndexOf(sep));
    if (parent && key(parent) === key(destDir)) return false;
    return true;
  });
}
