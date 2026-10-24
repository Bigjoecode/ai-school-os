/**
 * Small lab sounds made on the fly with WebAudio (no sound files): glass
 * clink, drip, pouring, the tap's creak and a soft UI tick. Muted by the
 * lab's toggle; silently does nothing where WebAudio is missing.
 */

type Sfx = 'clink' | 'drip' | 'creak' | 'tick' | 'success' | 'oops';

let ctx: AudioContext | null = null;
let muted = false;
let pourNode: { src: AudioBufferSourceNode; gain: GainNode } | null = null;

function audio(): AudioContext | null {
  if (muted) return null;
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

export function setMuted(m: boolean) {
  muted = m;
  if (m) stopPour();
}

function tone(a: AudioContext, freq: number, start: number, dur: number, type: OscillatorType, vol: number, endFreq?: number) {
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, start);
  if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, start + dur);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(vol, start + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g).connect(a.destination);
  o.start(start);
  o.stop(start + dur + 0.02);
}

export function play(s: Sfx) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime;
  if (s === 'clink') {
    tone(a, 2350, t, 0.35, 'sine', 0.12);
    tone(a, 3720, t, 0.22, 'sine', 0.06);
    tone(a, 5100, t + 0.01, 0.12, 'sine', 0.03);
  } else if (s === 'drip') {
    tone(a, 1500, t, 0.09, 'sine', 0.16, 650);
  } else if (s === 'creak') {
    tone(a, 140, t, 0.18, 'sawtooth', 0.035, 95);
  } else if (s === 'tick') {
    tone(a, 900, t, 0.05, 'triangle', 0.05);
  } else if (s === 'success') {
    tone(a, 660, t, 0.16, 'sine', 0.08);
    tone(a, 990, t + 0.12, 0.25, 'sine', 0.08);
  } else {
    tone(a, 300, t, 0.2, 'triangle', 0.07, 220);
  }
}

/** Running liquid (filtered noise) while acid streams or a bottle pours. */
export function startPour() {
  const a = audio();
  if (!a || pourNode) return;
  const buf = a.createBuffer(1, a.sampleRate, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const bp = a.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1300;
  bp.Q.value = 1.4;
  const gain = a.createGain();
  gain.gain.value = 0.0001;
  gain.gain.exponentialRampToValueAtTime(0.05, a.currentTime + 0.12);
  src.connect(bp).connect(gain).connect(a.destination);
  src.start();
  pourNode = { src, gain };
}
export function stopPour() {
  if (!pourNode || !ctx) return;
  const { src, gain } = pourNode;
  pourNode = null;
  try {
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12);
    src.stop(ctx.currentTime + 0.15);
  } catch {
    /* already stopped */
  }
}
