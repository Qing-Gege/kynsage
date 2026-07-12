import { toNativePath } from '@kynsage/shared-types';

export interface CwdSource {
  type: 'initial' | 'pty-cd' | 'periodic';
  cwd: string;
  confidence: number;
  timestamp: number;
}

const CD_PATTERNS = [
  /^cd\s+(?:\/d\s+)?(.+)$/i,
  /^pushd\s+(.+)$/i,
  /^Set-Location\s+-Path\s+(.+)$/i,
  /^Set-Location\s+(.+)$/i,
];

export class CwdTracker {
  private sources: CwdSource[] = [];
  private readonly initialCwd: string;
  private sequence = 0;

  constructor(initialCwd: string) {
    this.initialCwd = initialCwd;
    this.sources.push({
      type: 'initial',
      cwd: initialCwd,
      confidence: 1.0,
      timestamp: Date.now(),
    });
  }

  onPtyOutput(line: string): void {
    for (const pattern of CD_PATTERNS) {
      const match = pattern.exec(line.trim());
      if (match?.[1]) {
        let rawPath = match[1].trim();
        if (
          (rawPath.startsWith('"') && rawPath.endsWith('"')) ||
          (rawPath.startsWith("'") && rawPath.endsWith("'"))
        ) {
          rawPath = rawPath.slice(1, -1);
        }
        const cwd = this.resolvePath(rawPath);
        this.sources.push({
          type: 'pty-cd',
          cwd,
          confidence: 0.9,
          timestamp: Date.now() + this.sequence++,
        });
        return;
      }
    }
  }

  onPeriodicRead(cwd: string): void {
    this.sources.push({
      type: 'periodic',
      cwd,
      confidence: 0.7,
      timestamp: Date.now() + this.sequence++,
    });
  }

  getCurrentCwd(): string {
    if (this.sources.length === 0) return this.initialCwd;
    if (this.sources.length === 1) return this.sources[0]!.cwd;

    const nonInitial = this.sources.filter(s => s.type !== 'initial');
    if (nonInitial.length === 0) return this.initialCwd;

    const recent = nonInitial
      .slice()
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 5);
    const best = recent.reduce((prev, curr) => {
      if (curr.confidence > prev.confidence) return curr;
      if (curr.confidence === prev.confidence && curr.timestamp > prev.timestamp) return curr;
      return prev;
    });
    return best.cwd;
  }

  private resolvePath(rawPath: string): string {
    // 绝对路径：Unix /、Windows 盘符 C:\、UNC \\server、长路径 \\?\
    if (rawPath.startsWith('/') || /^[A-Za-z]:[\\/]/.test(rawPath) || rawPath.startsWith('\\\\')) {
      return toNativePath(rawPath);
    }
    const current = this.getCurrentCwd();
    if (current.endsWith('/') || current.endsWith('\\')) return toNativePath(`${current}${rawPath}`);
    // 用当前路径已有的分隔符风格拼接，避免 C:\foo/bar 混合
    const sep = current.includes('\\') && !current.includes('/') ? '\\' : '/';
    return toNativePath(`${current}${sep}${rawPath}`);
  }

  reset(cwd: string): void {
    this.sequence = 0;
    this.sources = [
      {
        type: 'initial',
        cwd,
        confidence: 1.0,
        timestamp: Date.now(),
      },
    ];
  }
}
