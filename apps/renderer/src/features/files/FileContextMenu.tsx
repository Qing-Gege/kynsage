import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import './FileContextMenu.css';

export interface MenuItem {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  /** 在此项之前画一条分隔线 */
  sep?: boolean;
}

interface Props {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

// 定位式右键菜单：固定在 (x,y)，溢出视口时回收，点击外部 / Esc / 滚动即关闭。
export function FileContextMenu({ x, y, items, onClose }: Props): ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const left = Math.min(x, window.innerWidth - width - 8);
    const top = Math.min(y, window.innerHeight - height - 8);
    setPos({ left: Math.max(8, left), top: Math.max(8, top) });
  }, [x, y]);

  useEffect(() => {
    const onDown = (e: MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onClose, true);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onClose, true);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  return (
    <div className="ctx-menu" ref={ref} style={{ left: pos.left, top: pos.top }} role="menu">
      {items.map((it, i) => (
        <div key={i}>
          {it.sep && <div className="ctx-sep" role="separator" />}
          <button
            type="button"
            role="menuitem"
            className={`ctx-item ${it.danger ? 'is-danger' : ''}`}
            disabled={it.disabled}
            onClick={() => { if (!it.disabled) { it.onClick(); onClose(); } }}
          >
            {it.label}
          </button>
        </div>
      ))}
    </div>
  );
}
