import { FORK_TAU } from '@aischool/shared';
import { isMuted } from '../../lab3d-kit/sound';

/**
 * The tuning fork's sound, made on the fly with WebAudio (no sound files): a
 * pure tone at the fork's true frequency that dies away as e^(−t/τ), with the
 * short metallic "clang" partial (about 6.3 f) of a fresh strike — much
 * stronger, with extra overtones, when the fork is struck on the bench. The
 * loudness follows the resonance: the lab sets the level (0–1) from the air
 * column's or the wire's response, smoothed over a few milliseconds as the
 * tube or the bridge moves. Silent where WebAudio is missing, when the lab's
 * sound is off, or in the 2D lab's "sound off".
 */

let ctx: AudioContext | null = null;
let enabled = true;
let voice: { master: GainNode; level: GainNode; oscs: OscillatorNode[] } | null = null;

function audio(): AudioContext | null {
  if (!enabled || isMuted()) return null;
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

/** The 2D lab's own sound toggle. */
export function setForkSound(on: boolean) {
  enabled = on;
  if (!on) forkStop();
}
export const forkSoundOn = () => enabled;

/** Loudness (gain) for a heard level 0–1: a little of the fork's own sound always reaches the ear. */
const gainFor = (level: number) => 0.012 + 0.3 * Math.max(0, Math.min(1, level)) ** 1.3;

/** Strike a fork of true frequency f (Hz); `hard`: on the bench (a harsh clang). `level`: the resonance now. */
export function forkStrike(f: number, hard: boolean, level: number) {
  forkStop();
  const a = audio();
  if (!a) return;
  const t = a.currentTime;
  const master = a.createGain();
  master.gain.setValueAtTime(0.0001, t);
  master.gain.exponentialRampToValueAtTime(1, t + 0.008);
  master.gain.setTargetAtTime(0.0001, t + 0.01, FORK_TAU);
  const level0 = a.createGain();
  level0.gain.setValueAtTime(gainFor(level), t);
  master.connect(level0).connect(a.destination);
  const oscs: OscillatorNode[] = [];
  const partial = (freq: number, vol: number, decay: number) => {
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(vol, t);
    if (decay > 0) g.gain.setTargetAtTime(0.0001, t + 0.005, decay);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + FORK_TAU * 5);
    oscs.push(o);
  };
  partial(f, 1, 0);
  partial(f * 6.27, hard ? 0.9 : 0.12, hard ? 0.35 : 0.06);
  if (hard) {
    partial(f * 17.6, 0.5, 0.12);
    partial(f * 2.03, 0.25, 0.6);
  }
  voice = { master, level: level0, oscs };
}

/** The resonance changed (0–1): the sound swells or fades smoothly. */
export function forkLevel(level: number) {
  if (!voice || !ctx) return;
  try {
    voice.level.gain.setTargetAtTime(gainFor(level), ctx.currentTime, 0.03);
  } catch {
    /* closed */
  }
}

/** Damp the fork (or leave the lab): the sound stops. */
export function forkStop() {
  if (!voice || !ctx) return;
  const v = voice;
  voice = null;
  try {
    v.master.gain.cancelScheduledValues(ctx.currentTime);
    v.master.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.02);
    for (const o of v.oscs) o.stop(ctx.currentTime + 0.15);
  } catch {
    /* already stopped */
  }
}
