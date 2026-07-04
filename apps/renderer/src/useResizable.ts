import { useLayoutEffect, useRef } from 'react';

type Edge = 'left' | 'right' | 'top' | 'bottom';

interface Options {
  cssVar: string;
  storageKey: string;
  edge: Edge;
  min: number;
  max: number;
  initial: number;
}

export function useResizable(opts: Options): {
  ref: React.RefObject<HTMLDivElement | null>;
  onMouseDown: (e: React.MouseEvent) => void;
} {
  const ref = useRef<HTMLDivElement | null>(null);
  const isHorizontal = opts.edge === 'left' || opts.edge === 'right';

  // useLayoutEffect：在首帧绘制「之前」写入 CSS 变量，避免文件区先按 CSS 默认宽度
  // 渲染一帧、随后又被 JS 初值改写而「闪一下变宽」。
  useLayoutEffect(() => {
    const stored = localStorage.getItem(opts.storageKey);
    const value = stored ? Number(stored) : opts.initial;
    document.documentElement.style.setProperty(opts.cssVar, `${clamp(value, opts.min, opts.max)}px`);
  }, [opts.cssVar, opts.storageKey, opts.initial, opts.min, opts.max]);

  const onMouseDown = (e: React.MouseEvent): void => {
    e.preventDefault();
    const startPos = isHorizontal ? e.clientX : e.clientY;
    const stored = localStorage.getItem(opts.storageKey);
    const startSize = stored ? Number(stored) : opts.initial;

    const onMove = (ev: MouseEvent): void => {
      const currentPos = isHorizontal ? ev.clientX : ev.clientY;
      const delta = currentPos - startPos;
      const reverse = opts.edge === 'right' || opts.edge === 'bottom';
      const next = clamp(reverse ? startSize - delta : startSize + delta, opts.min, opts.max);
      document.documentElement.style.setProperty(opts.cssVar, `${next}px`);
      localStorage.setItem(opts.storageKey, String(next));
    };
    const onUp = (): void => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
    };

    document.body.style.cursor = isHorizontal ? 'col-resize' : 'row-resize';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return { ref, onMouseDown };
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
