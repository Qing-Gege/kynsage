import { describe, it, expect } from 'vitest';
import { isInsideOrSame, safeMoveSources } from './move-guard.js';

describe('isInsideOrSame', () => {
  it('拖进自己 → 拦', () => {
    expect(isInsideOrSame('/a/b', '/a/b')).toBe(true);
    expect(isInsideOrSame('C:\\work\\x', 'C:\\work\\x')).toBe(true);
  });

  it('拖进自己的子目录 → 拦（这是会丢数据的那条）', () => {
    expect(isInsideOrSame('/a/b/c', '/a/b')).toBe(true);
    expect(isInsideOrSame('/a/b/c/d/e', '/a/b')).toBe(true);
    expect(isInsideOrSame('C:\\work\\x\\deep', 'C:\\work\\x')).toBe(true);
  });

  it('拖进兄弟目录 → 放行', () => {
    expect(isInsideOrSame('/a/c', '/a/b')).toBe(false);
    expect(isInsideOrSame('C:\\work\\y', 'C:\\work\\x')).toBe(false);
  });

  it('前缀相同但不是子目录 → 放行（/a/bc 不在 /a/b 里）', () => {
    expect(isInsideOrSame('/a/bc', '/a/b')).toBe(false);
    expect(isInsideOrSame('C:\\work\\xyz', 'C:\\work\\x')).toBe(false);
  });

  it('拖进父目录 → 放行（合法的往上搬）', () => {
    expect(isInsideOrSame('/a', '/a/b')).toBe(false);
  });

  it('尾部斜杠不影响判定', () => {
    expect(isInsideOrSame('/a/b/', '/a/b')).toBe(true);
    expect(isInsideOrSame('/a/b/c/', '/a/b/')).toBe(true);
  });

  it('Windows 大小写不敏感，POSIX 敏感', () => {
    expect(isInsideOrSame('C:\\Work\\X', 'C:\\work\\x')).toBe(true);
    expect(isInsideOrSame('/a/B', '/a/b')).toBe(false);
  });
});

describe('safeMoveSources', () => {
  it('混合选区里只剔掉危险项，其余照移', () => {
    const src = ['/proj/docs', '/proj/notes.md', '/proj/img.png'];
    expect(safeMoveSources(src, '/proj/docs')).toEqual(['/proj/notes.md', '/proj/img.png']);
  });

  it('源已在目标目录下 → 原地移动，跳过', () => {
    expect(safeMoveSources(['/proj/a.md'], '/proj')).toEqual([]);
  });

  it('从别处移进来 → 放行', () => {
    expect(safeMoveSources(['/other/a.md'], '/proj')).toEqual(['/other/a.md']);
  });

  it('全都危险 → 空数组（调用方据此不发 IPC）', () => {
    expect(safeMoveSources(['/proj/docs'], '/proj/docs/sub')).toEqual([]);
  });

  it('Windows 盘根作目标', () => {
    expect(safeMoveSources(['D:\\stuff\\a.txt'], 'C:\\')).toEqual(['D:\\stuff\\a.txt']);
  });
});
