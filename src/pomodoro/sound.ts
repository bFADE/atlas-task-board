// Chime synthesized with the Web Audio API (no audio files).
let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

/** Browsers only allow audio after a user gesture: call this from the Start click. */
export function unlockAudio() {
  getCtx()?.resume().catch(() => {});
}

export function playChime() {
  const ac = getCtx();
  if (!ac) return;
  ac.resume().catch(() => {});
  const t0 = ac.currentTime + 0.05;
  // Three rising bell-like notes, played twice.
  [0, 1].forEach((rep) =>
    [659.25, 783.99, 1046.5].forEach((freq, i) => {
      const start = t0 + rep * 0.9 + i * 0.18;
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.35, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.6);
      osc.connect(gain).connect(ac.destination);
      osc.start(start);
      osc.stop(start + 0.65);
    }),
  );
}
