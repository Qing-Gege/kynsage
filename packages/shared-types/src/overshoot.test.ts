import { describe, it, expect } from 'vitest';
import { resolveDrag } from './overshoot.js';
import type { DragState } from './overshoot.js';

// 文件区分隔条的真实参数：起点 220px，上限 520px，越界阈值 90px，边缘 left（不反向）
const base: DragState = {
  startedExpanded: false,
  startSize: 220,
  max: 520,
  threshold: 90,
  reverse: false,
};

describe('常规态拖宽', () => {
  it('正常范围内就是调宽', () => {
    expect(resolveDrag(base, 100)).toEqual({ kind: 'resize', width: 320 });
  });

  it('往回拖也是调宽（负位移）', () => {
    expect(resolveDrag(base, -40)).toEqual({ kind: 'resize', width: 180 });
  });

  it('刚顶到 max 还不翻转 —— 得再使劲才算「我要全屏」', () => {
    expect(resolveDrag(base, 300)).toEqual({ kind: 'resize', width: 520 });
  });

  it('超出 max 但没够阈值，仍不翻转', () => {
    expect(resolveDrag(base, 380)).toEqual({ kind: 'resize', width: 600 });
  });

  it('超出 max 且够阈值 → 进展开态', () => {
    expect(resolveDrag(base, 400)).toEqual({ kind: 'enter-expanded', restoreWidth: 220 });
  });

  it('进展开态时还原的是「拖拽前」的宽度，不是 max —— 这是第一次踩的坑', () => {
    const r = resolveDrag({ ...base, startSize: 260 }, 500);
    expect(r).toEqual({ kind: 'enter-expanded', restoreWidth: 260 });
    // 绝不能是 520（max）
    expect(r).not.toEqual({ kind: 'enter-expanded', restoreWidth: 520 });
  });
});

describe('展开态退出', () => {
  const expanded: DragState = { ...base, startedExpanded: true };

  it('往回拖不够阈值 → 什么都不做', () => {
    expect(resolveDrag(expanded, -50)).toEqual({ kind: 'noop' });
  });

  it('往回拖够阈值 → 退出展开', () => {
    expect(resolveDrag(expanded, -100)).toEqual({ kind: 'exit-expanded' });
  });

  it('展开态里往外拖不触发任何事（已经最大了）', () => {
    expect(resolveDrag(expanded, 200)).toEqual({ kind: 'noop' });
  });

  it('展开态永不返回 resize —— 宽度由 grid 的 1fr 接管，写宽度就是第二次踩的坑', () => {
    for (const d of [-500, -200, -100, -1, 0, 1, 200, 500]) {
      expect(resolveDrag(expanded, d).kind).not.toBe('resize');
    }
  });

  it('退出判定不受 startSize 影响 —— 基准是位移，不是宽度值', () => {
    const a = resolveDrag({ ...expanded, startSize: 180 }, -100);
    const b = resolveDrag({ ...expanded, startSize: 520 }, -100);
    expect(a).toEqual(b);
    expect(a).toEqual({ kind: 'exit-expanded' });
  });
});

describe('对称性 —— 拖出去能进，拖回来就能出', () => {
  it('进与出用同一个阈值', () => {
    const enter = resolveDrag(base, 300 + 91);
    const exit = resolveDrag({ ...base, startedExpanded: true }, -91);
    expect(enter.kind).toBe('enter-expanded');
    expect(exit.kind).toBe('exit-expanded');
  });
});

describe('reverse 边缘（right/bottom）', () => {
  const rev: DragState = { ...base, reverse: true };

  it('反向时位移取反算宽度', () => {
    expect(resolveDrag(rev, -100)).toEqual({ kind: 'resize', width: 320 });
  });

  it('反向时往左拖越界进展开态', () => {
    expect(resolveDrag(rev, -400)).toEqual({ kind: 'enter-expanded', restoreWidth: 220 });
  });

  it('反向的展开态：往右拖才是退出', () => {
    expect(resolveDrag({ ...rev, startedExpanded: true }, 100)).toEqual({ kind: 'exit-expanded' });
    expect(resolveDrag({ ...rev, startedExpanded: true }, -100)).toEqual({ kind: 'noop' });
  });
});

describe('threshold 为 0（未启用越界）', () => {
  const off: DragState = { ...base, threshold: 0 };

  it('永远只调宽，不翻转', () => {
    expect(resolveDrag(off, 9999).kind).toBe('resize');
  });

  it('展开态下也不做任何事', () => {
    expect(resolveDrag({ ...off, startedExpanded: true }, -9999)).toEqual({ kind: 'noop' });
  });
});
