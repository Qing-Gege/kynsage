// 「叮」提示音：用 Web Audio 现场合成两声清脆的音，无需打包任何音频资源。
// 同事需要确认时配合标题栏闪烁播放，多开时不容易错过。

let ctx: AudioContext | null = null;

function audioCtx(): AudioContext | null {
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    // 受浏览器自动播放策略影响，挂起时尝试恢复（首次用户交互后即可成功）。
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** 播放一段上扬的「叮—叮—咚」三音提示，尾音留有余韵。 */
export function playConfirmChime(): void {
  const ac = audioCtx();
  if (!ac) return;
  const now = ac.currentTime;
  // 三个音符：上行分解和弦，节奏舒展、尾音更长，整体约 1.3s。
  // [频率, 起始偏移, 衰减时长]
  const notes: Array<[number, number, number]> = [
    [880, 0, 0.55], // A5
    [1174.7, 0.22, 0.55], // D6
    [1318.5, 0.44, 0.85], // E6（尾音留余韵）
  ];
  for (const [freq, offset, decay] of notes) {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const t0 = now + offset;
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(0.18, t0 + 0.012); // 快速起音
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + decay); // 自然衰减
    osc.connect(gain).connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + decay + 0.05);
  }
}
