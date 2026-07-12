import { useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { trpc } from '../../trpc';
import { useSettingsStore } from '../../stores/settings';
import { useThemeStore } from '../../stores/theme';
import { playConfirmChime } from '../terminal/chime';
import type { ThemeName } from '@kynsage/design-tokens';
import { THEMES, THEME_META } from '@kynsage/design-tokens';
import './SettingsPanel.css';

interface Props { onClose: () => void; }

type Cat = 'appearance' | 'collab' | 'advanced';
const CAT_TITLE: Record<Cat, string> = { appearance: '外观', collab: '协作', advanced: '高级' };

const FONTS: { label: string; value: string }[] = [
  { label: '霞鹜字体 · 推荐', value: "'LXGW Bright Code GB', 'JetBrains Mono', monospace" },
  { label: 'Maple Mono NL CN', value: "'Maple Mono NL CN', 'JetBrains Mono', monospace" },
  { label: 'JetBrains Mono', value: "'JetBrains Mono', monospace" },
  { label: 'Fira Code', value: "'Fira Code', monospace" },
  { label: 'IBM Plex Mono', value: "'IBM Plex Mono', monospace" },
  { label: '系统默认', value: 'ui-monospace, SFMono-Regular, Menlo, monospace' },
];

export function SettingsPanel({ onClose }: Props): ReactElement {
  const [cat, setCat] = useState<Cat>('appearance');

  return (
    <div className="st-scrim" onClick={onClose}>
      <div className="st" onClick={(e) => e.stopPropagation()}>
        {/* —— 左侧分类导轨 —— */}
        <aside className="st-rail">
          <div className="st-rail-head">
            <span className="st-rail-mark">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"><circle cx="12" cy="12" r="3.2" /><path d="M19.4 13.5c.04-.5.04-1 0-1.5l1.9-1.5-1.9-3.3-2.3.9c-.4-.3-.8-.6-1.3-.8l-.3-2.4H10.5l-.3 2.4c-.5.2-.9.5-1.3.8l-2.3-.9-1.9 3.3 1.9 1.5c-.04.5-.04 1 0 1.5l-1.9 1.5 1.9 3.3 2.3-.9c.4.3.8.6 1.3.8l.3 2.4h3.8l.3-2.4c.5-.2.9-.5 1.3-.8l2.3.9 1.9-3.3z" /></svg>
            </span>
            <div className="st-rail-titles">
              <span className="t">设置</span>
              <span className="s">Settings</span>
            </div>
          </div>

          <nav className="st-rail-nav">
            <CatBtn cat="appearance" active={cat} onPick={setCat}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="9" /><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none" /></svg>
            </CatBtn>
            <CatBtn cat="collab" active={cat} onPick={setCat}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="9" cy="8" r="3" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0" /><path d="M16 6.5a3 3 0 0 1 0 5.8M20.5 19a5.5 5.5 0 0 0-4-5.3" /></svg>
            </CatBtn>
            <CatBtn cat="advanced" active={cat} onPick={setCat}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 7h10m4 0h2M4 17h2m4 0h10" /><circle cx="16" cy="7" r="2.4" /><circle cx="8" cy="17" r="2.4" /></svg>
            </CatBtn>
          </nav>

          <div className="st-rail-foot">
            <div className="st-ver-row">
              <span className="st-ver mono">KYNSAGE V{__APP_VERSION__}</span>
              <span className="st-dot" />
            </div>
            <UpdateChecker />
          </div>
        </aside>

        {/* —— 右侧内容区 —— */}
        <section className="st-pane">
          <header className="st-pane-head">
            <span className="st-ttl">{CAT_TITLE[cat]}</span>
            <button className="st-x" onClick={onClose} type="button" title="关闭（Esc）">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><line x1="3" y1="3" x2="13" y2="13" /><line x1="13" y1="3" x2="3" y2="13" /></svg>
            </button>
          </header>

          <div className="st-body">
            {cat === 'appearance' && <Appearance />}
            {cat === 'collab' && <Collab />}
            {cat === 'advanced' && <Advanced />}
          </div>

          <footer className="st-foot">
            <span className="st-save">
              <span className="st-tick"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8.5 6.5 12 13 4.5" /></svg></span>
              改完自动保存，无需点保存
            </span>
            <button className="st-done" onClick={onClose} type="button">完成</button>
          </footer>
        </section>
      </div>
    </div>
  );
}

// 版本区的「检查更新」：点按 → main 拉 OSS 上的 kynsage-latest.json 比对版本；
// 有新版则给下载按钮(系统浏览器打开 OSS 安装包链接)。纯手动,不做后台自动轮询。
type UpdState =
  | { s: 'idle' }
  | { s: 'checking' }
  | { s: 'latest' }
  | { s: 'available'; latest: string; url: string | null }
  | { s: 'error'; msg: string };

function UpdateChecker(): ReactElement {
  const [st, setSt] = useState<UpdState>({ s: 'idle' });

  const check = async (): Promise<void> => {
    setSt({ s: 'checking' });
    try {
      const r = (await trpc.checkUpdate.query()) as { latest: string; hasUpdate: boolean; url: string | null };
      setSt(r.hasUpdate ? { s: 'available', latest: r.latest, url: r.url } : { s: 'latest' });
    } catch (e) {
      setSt({ s: 'error', msg: e instanceof Error ? e.message : '网络错误' });
    }
  };

  if (st.s === 'available') {
    return (
      <div className="st-upd st-upd-hit">
        <span className="st-upd-txt">发现新版 V{st.latest}</span>
        {st.url ? (
          <button className="st-upd-dl" type="button" onClick={() => void trpc.openExternal.mutate({ url: st.url })}>下载</button>
        ) : (
          <button className="st-upd-btn" type="button" onClick={() => void check()}>重新检查</button>
        )}
      </div>
    );
  }

  return (
    <div className="st-upd">
      <button className="st-upd-btn" type="button" onClick={() => void check()} disabled={st.s === 'checking'}>
        {st.s === 'checking' ? '检查中…' : '检查更新'}
      </button>
      {st.s === 'latest' && <span className="st-upd-ok">已是最新</span>}
      {st.s === 'error' && <span className="st-upd-err" title={st.msg}>检查失败</span>}
    </div>
  );
}

function CatBtn({ cat, active, onPick, children }: { cat: Cat; active: Cat; onPick: (c: Cat) => void; children: ReactNode }): ReactElement {
  return (
    <button className={`st-cat ${active === cat ? 'active' : ''}`} onClick={() => onPick(cat)} type="button">
      <span className="st-cat-ic">{children}</span>
      {CAT_TITLE[cat]}
    </button>
  );
}

/* ===================== 外观 ===================== */
function Appearance(): ReactElement {
  const { fontFamily, fontSize, cursorStyle, cursorBlink, scrollbackLines, copyPasteMode, patchTerminal } = useSettingsStore();
  const { theme, setTheme, applyTheme } = useThemeStore();
  const pickTheme = (t: ThemeName) => { setTheme(t); applyTheme(t); };
  const step = (d: number) => patchTerminal({ fontSize: Math.min(28, Math.max(8, fontSize + d)) });

  return (
    <div className="st-group">
      <GroupLabel>主题</GroupLabel>
      <Row label="配色外观" hint="常用三套直接点，更多主题在右侧下拉里挑">
        <div className="st-theme">
          <div className="st-theme-quick">
            {THEME_META.filter((m) => m.quick).map((m) => (
              <ThemeSwatch key={m.name} name={m.name} label={m.label} on={theme === m.name} onClick={() => pickTheme(m.name)} />
            ))}
          </div>
          <select className="st-theme-more" value={theme} onChange={(e) => pickTheme(e.target.value as ThemeName)}>
            {THEME_META.map((m) => (
              <option key={m.name} value={m.name}>{m.label}{m.quick ? '' : ' ·'}</option>
            ))}
          </select>
        </div>
      </Row>

      <GroupLabel>字体</GroupLabel>
      <div className="st-row st-row--stack">
        <div className="st-row-text">
          <div className="st-row-label">同事终端的字体</div>
          <div className="st-row-hint">点一款喜欢的，下方预览会立刻换上</div>
        </div>
        <div className="st-fontlist">
          {FONTS.map((f) => (
            <button key={f.value} type="button"
              className={`st-fontopt ${fontFamily === f.value ? 'on' : ''}`}
              onClick={() => patchTerminal({ fontFamily: f.value })}>
              <span className="st-fo-l">
                <span className="st-fo-name">{f.label}</span>
                <span className="st-fo-sample" style={{ fontFamily: f.value }}>文档 Aa 0123 ()=&gt;</span>
              </span>
              <span className="st-fo-check"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8.5 6.5 12 13 4.5" /></svg></span>
            </button>
          ))}
        </div>
      </div>
      <Row label="字号" hint="终端里文字的大小">
        <div className="st-stepper">
          <button className="st-step" type="button" aria-label="调小" onClick={() => step(-1)}>−</button>
          <input className="st-tf mono st-tf--num" value={fontSize} inputMode="numeric"
            onChange={(e) => { const n = Number(e.target.value); if (!Number.isNaN(n)) patchTerminal({ fontSize: Math.min(28, Math.max(8, n)) }); }} />
          <button className="st-step" type="button" aria-label="调大" onClick={() => step(1)}>+</button>
        </div>
        <span className="st-unit">px</span>
      </Row>

      <GroupLabel>光标</GroupLabel>
      <Row label="形状" hint="终端里那条输入光标长什么样">
        <div className="st-seg st-seg--text">
          {(['bar', 'block', 'underline'] as const).map((c) => (
            <button key={c} type="button" className={cursorStyle === c ? 'on' : ''}
              onClick={() => patchTerminal({ cursorStyle: c })}>
              {c === 'bar' ? '竖线' : c === 'block' ? '方块' : '下划线'}
            </button>
          ))}
        </div>
      </Row>
      <Row label="闪烁" hint="让光标轻轻闪动">
        <Toggle checked={cursorBlink} onChange={(v) => patchTerminal({ cursorBlink: v })} />
      </Row>

      <GroupLabel>历史</GroupLabel>
      <Row label="保留多少行" hint="终端往上能翻看的旧内容上限，超出后最早的会清掉">
        <input className="st-tf mono st-tf--num" style={{ width: 88 }} value={scrollbackLines} inputMode="numeric"
          onChange={(e) => { const n = Number(e.target.value); if (!Number.isNaN(n)) patchTerminal({ scrollbackLines: n }); }} />
        <span className="st-unit">行</span>
      </Row>

      <GroupLabel>快捷键</GroupLabel>
      <Row label="复制粘贴" hint="终端里 Ctrl+C 本来是「中断」。选「像 Office」后：选中文字时 Ctrl+C 复制、Ctrl+V 粘贴，没选中才中断">
        <div className="st-seg st-seg--text">
          <button type="button" className={copyPasteMode === 'office' ? 'on' : ''} onClick={() => patchTerminal({ copyPasteMode: 'office' })}>像 Office</button>
          <button type="button" className={copyPasteMode === 'term' ? 'on' : ''} onClick={() => patchTerminal({ copyPasteMode: 'term' })}>终端习惯</button>
        </div>
      </Row>

      {/* 实时读数 */}
      <p className="st-prev-cap">实时预览 · 你的改动长这样</p>
      <div className="st-prev">
        <div className="st-prev-bar"><span className="st-sig" /><span className="st-nm">小军 · 法务</span><span className="st-tag">Claude Code</span></div>
        <div className="st-prev-body" style={{ fontSize, fontFamily }}>
          <div className="st-ln"><span className="grn">›</span> 帮我把这份租赁合同改成可终止条款</div>
          <div className="st-ln dim">正在阅读 3 个参考文件…</div>
          <div className="st-ln"><span className="amb">●</span> 已生成草稿 <span className="dim">租赁合同_修订.docx</span> <span className={`st-cur ${cursorStyle} ${cursorBlink ? 'blink' : ''}`} /></div>
        </div>
      </div>
    </div>
  );
}

/* ===================== 协作 ===================== */
function Collab(): ReactElement {
  const { memberLabel, brandTitle, brandSubtitle, startDir, soundOnConfirm, patchCollab, patchGeneral } = useSettingsStore();
  const echo = memberLabel.trim() || '同事';

  return (
    <div className="st-group">
      <GroupLabel>品牌</GroupLabel>
      <Row label="主标题" hint="显示在左上角，应用的名字——默认「狗头军师」">
        <input className="st-tf st-tf--name" value={brandTitle} maxLength={12} spellCheck={false}
          onChange={(e) => patchCollab({ brandTitle: e.target.value })} />
      </Row>
      <Row label="副标题" hint="主标题下面那行小字——默认「一个狗军师，三个诸葛亮」">
        <input className="st-tf" style={{ width: 220 }} value={brandSubtitle} maxLength={24} spellCheck={false}
          onChange={(e) => patchCollab({ brandSubtitle: e.target.value })} />
      </Row>

      <GroupLabel>称呼</GroupLabel>
      <Row label="你怎么称呼你的 AI 帮手" hint="这两个字会出现在「新建」按钮和各处提示里——叫「狗头」「助手」「员工」或者任意都行">
        <input className="st-tf st-tf--name" value={memberLabel} maxLength={6} spellCheck={false}
          onChange={(e) => patchCollab({ memberLabel: e.target.value })} />
      </Row>

      <div className="st-btnprev-wrap">
        <span className="st-btnprev-cap">侧边栏的按钮会变成 ——</span>
        <span className="st-btnprev"><span className="st-bp-plus">＋</span> 新建{echo}</span>
      </div>

      <GroupLabel>在哪干活</GroupLabel>
      <Row label="默认工作文件夹" hint="新建同事时默认打开的文件夹，留空就用你的主文件夹">
        <input className="st-tf mono st-tf--path" placeholder="主文件夹" spellCheck={false}
          value={startDir} onChange={(e) => patchGeneral({ startDir: e.target.value })} />
      </Row>
      {/* TODO: 功能未实现，暂隐藏——接入「每次新建单独选目录」流程后再恢复
      <Row label="每个同事单独问我" hint="开启后，每次新建同事都让你单独挑一个文件夹">
        <Toggle checked={promptDirPerAgent} onChange={(v) => patchCollab({ promptDirPerAgent: v })} />
      </Row>

      <GroupLabel>提醒</GroupLabel>
      <Row label="干完活提醒我" hint="同事忙完、或需要你拍板时，叮一声 + 弹个通知——多开时不怕错过">
        <Toggle checked={notifyOnDone} onChange={(v) => patchCollab({ notifyOnDone: v })} />
      </Row>
      */}

      <GroupLabel>提醒</GroupLabel>
      <Row label="需要确认时响一声" hint="同事需要你拍板时，除了标题栏闪烁，再「叮」一声——多开时不怕错过">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Toggle checked={soundOnConfirm} onChange={(v) => { patchCollab({ soundOnConfirm: v }); if (v) playConfirmChime(); }} />
          <button type="button" className="st-tf" style={{ cursor: 'pointer', padding: '4px 12px' }}
            onClick={() => playConfirmChime()}>试听</button>
        </div>
      </Row>
    </div>
  );
}

/* ===================== 高级 ===================== */
function Advanced(): ReactElement {
  const { claudePath, defaultShell, patchGeneral } = useSettingsStore();

  return (
    <div className="st-group">
      <GroupLabel>Claude</GroupLabel>
      <Row label="Claude 程序位置" hint="一般不用填，留空会自动找到已安装的 Claude">
        <input className="st-tf mono st-tf--path" placeholder="自动查找" spellCheck={false}
          value={claudePath} onChange={(e) => patchGeneral({ claudePath: e.target.value })} />
      </Row>
      <Row label="命令行程序" hint="保持默认即可，技术用户可指定自己惯用的">
        <input className="st-tf mono st-tf--path" placeholder="系统默认" spellCheck={false}
          value={defaultShell} onChange={(e) => patchGeneral({ defaultShell: e.target.value })} />
      </Row>
    </div>
  );
}

/* ===================== 通用控件 ===================== */
function GroupLabel({ children }: { children: ReactNode }): ReactElement {
  return <div className="st-grp-label stencil">{children}</div>;
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }): ReactElement {
  return (
    <div className="st-row">
      <div className="st-row-text">
        <div className="st-row-label">{label}</div>
        {hint && <div className="st-row-hint">{hint}</div>}
      </div>
      <div className="st-row-ctl">{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }): ReactElement {
  return (
    <label className="st-toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="track" /><span className="knob" />
    </label>
  );
}

// 主题色板:用该主题的真实 token 值绘制迷你预览(底/字/强调),所见即所得。
function ThemeSwatch({ name, label, on, onClick }: { name: ThemeName; label: string; on: boolean; onClick: () => void }): ReactElement {
  const t = THEMES[name];
  return (
    <button type="button" className={`st-sw ${on ? 'on' : ''}`} title={label} onClick={onClick}>
      <span className="st-sw-chip" style={{ background: t['--bg-panel'], borderColor: t['--line-strong'] }}>
        <span className="st-sw-ink" style={{ background: t['--ink'] }} />
        <span className="st-sw-acc" style={{ background: t['--bg-selected'] }} />
      </span>
      <span className="st-sw-label">{label}</span>
    </button>
  );
}
