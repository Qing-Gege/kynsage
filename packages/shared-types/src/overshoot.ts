// 拖拽越界判定（纯函数，无 DOM）—— 支撑「拖到尽头再使劲 = 全屏，往回拖 = 退出」。
//
// 为什么抽出来测：这段逻辑已经错过两次。
//   第一次：拖动途中每帧都把宽度写进 localStorage，触发展开后记住的是 max，
//           退出展开就停在一个谁也没要过的巨宽状态。
//   第二次：退出判定沿用「宽度值」做基准，但展开态下宽度已被还原成原值，
//           基准错位 → 鼠标一动立刻退出，且同一次拖拽继续跑把宽度压到 min。
// 两次都是坐标系混用。这里把两种模式的判定彻底分开，并钉死回归测试。

export interface DragState {
  /** 本次拖拽开始时是否已处于展开态 */
  startedExpanded: boolean;
  /** 拖拽起点的宽度（展开态下无意义，仅常规态使用） */
  startSize: number;
  /** 宽度上限 */
  max: number;
  /** 越界阈值：顶到 max 后还需继续拖多少像素才翻转 */
  threshold: number;
  /** 边缘方向是否反向（right/bottom） */
  reverse: boolean;
}

export type DragOutcome =
  | { kind: 'resize'; width: number }
  | { kind: 'enter-expanded'; restoreWidth: number }
  | { kind: 'exit-expanded' }
  | { kind: 'noop' };

/**
 * 给定一次鼠标位移，算出该做什么。
 *
 * @param delta 鼠标相对起点的位移（水平拖拽用 clientX 差值）
 */
export function resolveDrag(s: DragState, delta: number): DragOutcome {
  // ── 展开态：只看「往回拖了多少像素」，完全不碰宽度 ──
  if (s.startedExpanded) {
    if (s.threshold <= 0) return { kind: 'noop' };
    const back = s.reverse ? delta : -delta;
    return back > s.threshold ? { kind: 'exit-expanded' } : { kind: 'noop' };
  }

  // ── 常规态：按位移算目标宽度 ──
  const raw = s.reverse ? s.startSize - delta : s.startSize + delta;

  // 顶到 max 还继续往外拖够 threshold → 进展开态，并把宽度还原成拖拽前的值
  if (s.threshold > 0 && raw > s.max + s.threshold) {
    return { kind: 'enter-expanded', restoreWidth: s.startSize };
  }

  return { kind: 'resize', width: raw };
}
