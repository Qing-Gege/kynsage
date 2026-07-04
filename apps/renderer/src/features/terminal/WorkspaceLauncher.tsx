import { useState } from 'react';
import type { ReactElement } from 'react';
import { HistoryMenu } from '../agents/HistoryMenu';
import type { SessionRow } from '../agents/HistoryMenu';

interface Props {
  currentPath: string | null;
  hist: SessionRow[];
  newLabel: string;
  /** true = 浮在终端之上的覆盖层变体（显示 × 关闭） */
  overlay?: boolean;
  onClose?: () => void;
  onNew: () => void;
  onRestore: () => void;
  onPickHistory: (s: SessionRow) => void;
}

// 工作区 launcher —— 空态与按需覆盖层共用，保证两处动作一致
export function WorkspaceLauncher({
  currentPath, hist, newLabel, overlay, onClose, onNew, onRestore, onPickHistory,
}: Props): ReactElement {
  const [histOpen, setHistOpen] = useState(false);
  const hasHist = hist.length > 0;

  return (
    <div className={`terminal-placeholder ${overlay ? 'is-overlay' : ''}`}>
      {overlay && (
        <button className="ph-close" onClick={onClose} title="关闭" type="button">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
            <line x1="1" y1="1" x2="9" y2="9" /><line x1="9" y1="1" x2="1" y2="9" />
          </svg>
        </button>
      )}
      <div className="terminal-placeholder-icon">
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="3" width="20" height="14" rx="1.5"/><polyline points="7 8 10 11 7 14"/><line x1="12" y1="14" x2="17" y2="14"/>
        </svg>
      </div>
      <p className="ph-path mono" title={currentPath ?? undefined}>{currentPath || '（默认目录）'}</p>
      <p>{hasHist ? `这个文件夹有 ${hist.length} 次对话记录` : '尚无 Agent 通道'}</p>
      <div className="ph-actions">
        <button className="terminal-placeholder-cta" onClick={onNew} type="button">
          {hasHist ? '✨ 新对话' : `新建${newLabel}`}
        </button>
        {hasHist && (
          <>
            <button className="ph-cta-ghost" onClick={onRestore} type="button">
              💬 接着上次
            </button>
            <div className="ph-hist-wrap">
              <button className="ph-cta-ghost" onClick={(e) => { e.stopPropagation(); setHistOpen((v) => !v); }} type="button">
                历史对话 ▾
              </button>
              {currentPath && (
                <HistoryMenu
                  cwd={currentPath}
                  open={histOpen}
                  onClose={() => setHistOpen(false)}
                  onPick={onPickHistory}
                  align="left"
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
