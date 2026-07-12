import { describe, it, expect } from 'vitest';
import { toNativePath, winPathKey } from './win-path.js';

describe('toNativePath', () => {
  it('leaves POSIX paths untouched', () => {
    expect(toNativePath('/Users/quincy/dev/marshal')).toBe('/Users/quincy/dev/marshal');
    expect(toNativePath('/home/user/')).toBe('/home/user/'); // 非 win 不动末尾
  });

  it('converts forward slashes on drive paths', () => {
    expect(toNativePath('C:/Users/Foo/proj')).toBe('C:\\Users\\Foo\\proj');
    expect(toNativePath('C:\\Users\\Foo\\proj')).toBe('C:\\Users\\Foo\\proj');
  });

  it('handles mixed separators', () => {
    expect(toNativePath('C:\\foo/bar\\baz')).toBe('C:\\foo\\bar\\baz');
  });

  it('strips trailing separators but keeps drive root', () => {
    expect(toNativePath('C:\\Users\\Foo\\')).toBe('C:\\Users\\Foo');
    expect(toNativePath('C:\\')).toBe('C:\\');
    expect(toNativePath('C:/')).toBe('C:\\');
  });

  it('collapses duplicate separators', () => {
    expect(toNativePath('C:\\foo\\\\bar')).toBe('C:\\foo\\bar');
  });

  it('preserves UNC prefix', () => {
    expect(toNativePath('\\\\server\\share\\dir')).toBe('\\\\server\\share\\dir');
    expect(toNativePath('//server/share/dir')).toBe('\\\\server\\share\\dir');
  });

  it('strips surrounding quotes (Windows copy-as-path)', () => {
    expect(toNativePath('"C:\\Users\\Foo"')).toBe('C:\\Users\\Foo');
    expect(toNativePath("'C:/Users/Foo'")).toBe('C:\\Users\\Foo');
  });
});

describe('winPathKey', () => {
  it('is case-insensitive and separator-insensitive for Windows paths', () => {
    expect(winPathKey('C:\\Users\\Foo')).toBe(winPathKey('c:/users/foo'));
    expect(winPathKey('C:\\Users\\Foo\\')).toBe(winPathKey('C:\\users\\FOO'));
  });

  it('preserves case for POSIX paths', () => {
    expect(winPathKey('/Users/Quincy')).toBe('/Users/Quincy');
    expect(winPathKey('/Users/Quincy')).not.toBe(winPathKey('/users/quincy'));
  });
});
