import { useLayoutEffect, useRef } from 'react';
import { resolveDrag } from '@kynsage/shared-types';

type Edge = 'left' | 'right' | 'top' | 'bottom';

interface Options {
  cssVar: string;
  storageKey: string;
  edge: Edge;
  min: number;
  max: number;
  initial: number;
  /**
   * 顶到 max 之后还继续往外拖 overshoot 像素时触发（拖到尽头再使劲 = 我要全屏）。
   * 对称地，越界后往回拖同样距离会触发 onUndoOvershoot —— 拖出去能进，拖回来就能出。
   */
  overshoot?: number;
  onOvershoot?: () => void;
  onUndoOvershoot?: () => void;
  /** 当前是否已处于越界（展开）态；决定这次拖拽该判「进」还是判「出」 */
  overshot?: boolean;
}

export function useResizable(opts: Options): {
  ref: React.RefObject<HTMLDivElement | null>;
  onMouseDown: (e: React.MouseEvent) => void;
} {
  const ref = useRef<HTMLDivElement | null>(null);
  const isHorizontal = opts.edge === 'left' || opts.edge === 'right';
  // 回调放进 ref，拖拽过程中不因重渲染丢失最新闭包
  const cb = useRef({ on: opts.onOvershoot, undo: opts.onUndoOvershoot, overshot: opts.overshot });
  cb.current = { on: opts.onOvershoot, undo: opts.onUndoOvershoot, overshot: opts.overshot };

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
    // 判定逻辑抽到 shared-types/overshoot.ts（纯函数 + 17 个回归测试）——
    // 这段坐标系此前错过两次，靠手点验不出来。
    const dragState = {
      startedExpanded: (opts.overshoot ?? 0) > 0 && !!cb.current.overshot,
      startSize,
      max: opts.max,
      threshold: opts.overshoot ?? 0,
      reverse: opts.edge === 'right' || opts.edge === 'bottom',
    };
    // 翻转后立即停手：同一次拖拽再往下跑会把宽度压到 min。
    let fired = false;

    const write = (px: number): void => {
      document.documentElement.style.setProperty(opts.cssVar, `${px}px`);
      localStorage.setItem(opts.storageKey, String(px));
      // 顶到上限时给个「再使劲就全屏」的暗示 —— 否则这个手势没人能发现。
      // 只切一个 class，松手即摘，零常驻开销。
      if (opts.overshoot) {
        document.documentElement.classList.toggle('is-at-max', px >= opts.max);
      }
    };

    const onMove = (ev: MouseEvent): void => {
      if (fired) return;
      const delta = (isHorizontal ? ev.clientX : ev.clientY) - startPos;
      const out = resolveDrag(dragState, delta);

      switch (out.kind) {
        case 'resize':
          write(clamp(out.width, opts.min, opts.max));
          break;
        case 'enter-expanded':
          fired = true;
          write(out.restoreWidth);
          cb.current.on?.();
          break;
        case 'exit-expanded':
          fired = true;
          cb.current.undo?.();
          break;
        default:
          break;
      }
    };
    const onUp = (): void => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.documentElement.classList.remove('is-at-max');
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
