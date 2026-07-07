import { useEffect, useRef } from 'react';
import type { ReactElement } from 'react';
import { Crepe } from '@milkdown/crepe';
import '@milkdown/crepe/theme/common/style.css';
import './MarkdownEditor.css';
import { useSettingsStore } from '../../stores/settings';
import { useThemeStore } from '../../stores/theme';
import { THEME_META } from '@marshal/design-tokens';

interface MarkdownEditorProps {
  content: string;
  onSave?: (content: string) => void;
  readOnly?: boolean;
  /** 脏标记变化回调：true=有未保存改动 */
  onDirtyChange?: (dirty: boolean) => void;
  /** 暴露一个 flush 句柄，父组件可在关闭前强制保存 */
  flushRef?: React.MutableRefObject<(() => void) | null>;
}

const SAVE_DEBOUNCE_MS = 1500;

export function MarkdownEditor({
  content,
  onSave,
  readOnly = false,
  onDirtyChange,
  flushRef,
}: MarkdownEditorProps): ReactElement {
  const editorRef = useRef<HTMLDivElement>(null);
  const crepeRef = useRef<Crepe | null>(null);
  const { fontFamily } = useSettingsStore();
  const { theme } = useThemeStore();

  // 用 ref 持有最新回调/状态，避免编辑器因依赖变化而重建（重建会丢光标、闪烁）
  const onSaveRef = useRef(onSave);
  const onDirtyRef = useRef(onDirtyChange);
  const dirtyRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const themeRef = useRef(theme);
  onSaveRef.current = onSave;
  onDirtyRef.current = onDirtyChange;
  themeRef.current = theme;

  const setDirty = (next: boolean): void => {
    if (dirtyRef.current === next) return;
    dirtyRef.current = next;
    onDirtyRef.current?.(next);
  };

  // 立即保存当前内容（防抖未触发 / 关闭前调用）
  const flush = (): void => {
    clearTimeout(saveTimerRef.current);
    if (!dirtyRef.current) return;
    const crepe = crepeRef.current;
    if (!crepe || readOnlyRef.current) return;
    try {
      onSaveRef.current?.(crepe.getMarkdown());
      setDirty(false);
    } catch {
      /* 编辑器可能已销毁 */
    }
  };

  const readOnlyRef = useRef(readOnly);
  readOnlyRef.current = readOnly;

  // 把 flush 暴露给父组件
  if (flushRef) flushRef.current = flush;

  // 编辑器只创建一次（仅依赖初始 content —— 切换文件时父组件会用 key 强制重挂载）
  useEffect(() => {
    if (!editorRef.current) return;

    let cancelled = false;
    let createdCrepe: Crepe | null = null;

    const crepe = new Crepe({
      root: editorRef.current,
      defaultValue: content,
      features: {
        [Crepe.Feature.Toolbar]: true,
        [Crepe.Feature.BlockEdit]: false,
        [Crepe.Feature.LinkTooltip]: true,
        [Crepe.Feature.ListItem]: true,
        [Crepe.Feature.ImageBlock]: true,
        [Crepe.Feature.Table]: true,
        [Crepe.Feature.CodeMirror]: true,
        [Crepe.Feature.Cursor]: true,
        [Crepe.Feature.Placeholder]: true,
      },
    });

    void (async () => {
      // 懒加载数学 / 图表插件（katex、mermaid 体积较大，不拖慢首屏）
      try {
        const [{ math }, { diagram, mermaidConfigCtx }] = await Promise.all([
          import('@milkdown/plugin-math'),
          import('@milkdown/plugin-diagram'),
          import('katex/dist/katex.min.css'),
        ]);
        if (cancelled) return;
        // mermaid 主题跟随当前 app 主题
        const isDark = THEME_META.find((m) => m.name === themeRef.current)?.dark ?? false;
        const mermaidTheme = isDark ? 'dark' : 'default';
        // 先 use(diagram) 注册 mermaidConfigCtx slice，再 config 写入它的值
        crepe.editor
          .use(math)
          .use(diagram)
          .config((ctx) => {
            ctx.set(mermaidConfigCtx.key, { startOnLoad: false, theme: mermaidTheme });
          });
      } catch {
        // 插件加载失败不应阻断编辑器本身
      }

      if (cancelled) return;
      await crepe.create();
      if (cancelled) {
        // create 完成时组件已卸载 —— 直接销毁
        void crepe.destroy();
        return;
      }

      createdCrepe = crepe;
      crepeRef.current = crepe;
      crepe.setReadonly(readOnlyRef.current);

      // 事件驱动：内容变化时打脏标记 + 防抖保存（取代轮询）
      crepe.on((listener) => {
        listener.markdownUpdated((_ctx, markdown, prevMarkdown) => {
          if (markdown === prevMarkdown) return;
          if (readOnlyRef.current) return;
          setDirty(true);
          clearTimeout(saveTimerRef.current);
          saveTimerRef.current = setTimeout(() => {
            if (!onSaveRef.current) return;
            onSaveRef.current(markdown);
            setDirty(false);
          }, SAVE_DEBOUNCE_MS);
        });
      });
    })();

    return () => {
      cancelled = true;
      clearTimeout(saveTimerRef.current);
      // 卸载前 flush，杜绝防抖窗口内丢内容（仅当编辑器已建好）
      if (createdCrepe && dirtyRef.current && !readOnlyRef.current) {
        try {
          onSaveRef.current?.(createdCrepe.getMarkdown());
        } catch {
          /* ignore */
        }
      }
      if (createdCrepe) void createdCrepe.destroy();
      crepeRef.current = null;
      if (flushRef) flushRef.current = null;
    };
    // 仅初始化一次。content 仅作为 defaultValue，后续更新走父组件 key 重挂载。
  }, []);

  // 只读模式变化 —— 不重建编辑器
  useEffect(() => {
    crepeRef.current?.setReadonly(readOnly);
  }, [readOnly]);

  return (
    <div className="markdown-editor-container">
      <div
        ref={editorRef}
        className="markdown-editor"
        data-editor-theme={theme}
        style={{
          // 正文与代码字体都跟随设置
          '--crepe-font-default': fontFamily,
          '--crepe-font-code': fontFamily,
        } as React.CSSProperties}
      />
    </div>
  );
}
