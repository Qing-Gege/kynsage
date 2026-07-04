import { useState, useEffect, useRef } from 'react';
import type { ReactElement } from 'react';
import { MarkdownEditor } from './MarkdownEditor';
import { trpc } from '../../trpc';
import toast from 'react-hot-toast';
import './MarkdownPanel.css';

interface MarkdownPanelProps {
  filePath: string;
  onClose: () => void;
}

type SaveState = 'saved' | 'dirty' | 'saving';

export function MarkdownPanel({ filePath, onClose }: MarkdownPanelProps): ReactElement {
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const flushRef = useRef<(() => void) | null>(null);

  // 加载文件内容
  useEffect(() => {
    void (async () => {
      setLoading(true);
      setSaveState('saved');
      try {
        const text = (await (trpc as any).fs.readFile.query({ path: filePath })) as string;
        setContent(text);
      } catch (err) {
        toast.error(`无法读取文件: ${err instanceof Error ? err.message : String(err)}`);
        setContent('');
      } finally {
        setLoading(false);
      }
    })();
  }, [filePath]);

  // 保存文件
  const handleSave = async (newContent: string): Promise<void> => {
    setSaveState('saving');
    try {
      await (trpc as any).fs.writeFile.mutate({ path: filePath, content: newContent });
      setSaveState('saved');
    } catch (err) {
      setSaveState('dirty');
      toast.error(`保存失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // 关闭前先 flush 未保存内容
  const handleClose = (): void => {
    flushRef.current?.();
    onClose();
  };

  const fileName = filePath.replace(/[/\\]+$/, '').split(/[/\\]/).pop() || 'untitled.md';

  const statusLabel =
    saveState === 'saving' ? '保存中…' : saveState === 'dirty' ? '未保存' : '已保存';

  if (loading) {
    return (
      <div className="markdown-panel">
        <div className="markdown-panel-header">
          <div className="markdown-panel-title">加载中...</div>
          <button className="markdown-panel-close" onClick={onClose} aria-label="关闭">
            <CloseIcon />
          </button>
        </div>
        <div className="markdown-panel-loading">正在加载文件...</div>
      </div>
    );
  }

  return (
    <div className="markdown-panel">
      <div className="markdown-panel-header">
        <div className="markdown-panel-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
            <polyline points="10 9 9 9 8 9"/>
          </svg>
          <span className="markdown-panel-name">{fileName}</span>
          <span className={`markdown-panel-status is-${saveState}`}>
            <span className="markdown-panel-status-dot" />
            {statusLabel}
          </span>
        </div>
        <div className="markdown-panel-actions">
          <button className="markdown-panel-close" onClick={handleClose} aria-label="关闭" title="关闭">
            <CloseIcon />
          </button>
        </div>
      </div>
      <div className="markdown-panel-body">
        <MarkdownEditor
          key={filePath}
          content={content}
          onSave={handleSave}
          onDirtyChange={(dirty) => setSaveState((s) => (dirty ? 'dirty' : s === 'saving' ? s : 'saved'))}
          flushRef={flushRef}
        />
      </div>
    </div>
  );
}

function CloseIcon(): ReactElement {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
