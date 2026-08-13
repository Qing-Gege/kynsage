import { useEffect, useRef, type ReactElement } from 'react';
import { useLayoutStore } from '../../stores/layout';
import { useAgentsStore } from '../../stores/agents';
import { DogHead } from './DogHead';
import './BrandMark.css';

// 左上角品牌格 —— 跨顶栏两行。40px 狗头在 84px 里居中。
//
// 闲笔:狗头军师平时是尊纹丝不动的石像,只在「军情」变化那一瞬活过来 ——
// 有人喊你拍板就猛地挺身、点两下头（double-take）、瞪大眼；有人开跑就甩头
// 眨眼接手;全员收工就垂头闭眼打盹。静止时零动画帧,既克制又不耗资源。
// 删了照样跑,但留着这军师才像活的。

type Mood = 'alert' | 'watch' | 'doze';

// 一次性头部手势:全部从 identity 起、回 identity 收 —— 可安全 cancel 重播,
// 不残留位移;持续姿势(瞪眼/闭眼/明暗)全交给 CSS,两套系统各管各的属性。
const GESTURES: Record<Mood, { keyframes: Keyframe[]; options: KeyframeAnimationOptions }> = {
  // 挺身 + 双抖:被叫到名字一个激灵,点两下头
  alert: {
    keyframes: [
      { transform: 'translateY(0)' },
      { transform: 'translateY(-6px)', offset: 0.16 },
      { transform: 'translateY(-2px)', offset: 0.4 },
      { transform: 'translateY(-5px)', offset: 0.62 },
      { transform: 'translateY(-1px)', offset: 0.82 },
      { transform: 'translateY(0)' },
    ],
    options: { duration: 560, easing: 'ease-out' },
  },
  // 甩头:接手了
  watch: {
    keyframes: [
      { transform: 'rotate(0deg)' },
      { transform: 'rotate(-4deg)', offset: 0.25 },
      { transform: 'rotate(3deg)', offset: 0.55 },
      { transform: 'rotate(-1.5deg)', offset: 0.8 },
      { transform: 'rotate(0deg)' },
    ],
    options: { duration: 360, easing: 'ease-in-out' },
  },
  // 垂头:收工打盹,轻轻一沉又回来(留下的睡相靠 CSS 闭眼+压暗)
  doze: {
    keyframes: [
      { transform: 'translateY(0) rotate(0deg)' },
      { transform: 'translateY(3px) rotate(1.5deg)', offset: 0.55 },
      { transform: 'translateY(0) rotate(0deg)' },
    ],
    options: { duration: 620, easing: 'ease-in-out' },
  },
};

export function BrandMark(): ReactElement {
  const sessions = useAgentsStore((s) => s.sessions);
  const { sidebarCollapsed, setSidebar } = useLayoutStore();

  const running = sessions.filter((s) => s.state === 'running').length;
  const mood: Mood = sessions.some((s) => s.state === 'awaiting-confirm')
    ? 'alert'
    : running > 0
      ? 'watch'
      : 'doze';
  const hint = mood === 'alert'
    ? '有同事等你拍板'
    : mood === 'watch'
      ? `${running} 位同事在干活`
      : '一个狗军师，三个诸葛亮';

  const svgRef = useRef<SVGSVGElement>(null);
  const prevMood = useRef<Mood>(mood);
  const gestureAnim = useRef<Animation | null>(null);

  useEffect(() => {
    const prev = prevMood.current;
    prevMood.current = mood;
    if (prev === mood) return; // 首次挂载 / 无变化:不播手势
    const el = svgRef.current;
    if (!el) return;
    // 尊重系统「减少动态效果」:手势全停,靠 CSS 静态姿势区分神色
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const g = GESTURES[mood];
    gestureAnim.current?.cancel(); // 只撤上一段手势,不碰 CSS filter 过渡
    gestureAnim.current = el.animate(g.keyframes, g.options);
  }, [mood]);

  return (
    <>
      <DogHead
        ref={svgRef}
        className={`brand-mark is-${mood}`}
        width={40}
        height={40}
        role="img"
        aria-label="狗头军师"
      >
        <title>{hint}</title>
      </DogHead>
      <button
        className="brand-collapse"
        onClick={() => setSidebar(!sidebarCollapsed)}
        title={sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}
        type="button"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <line x1="9" y1="4" x2="9" y2="20" />
        </svg>
      </button>
    </>
  );
}
