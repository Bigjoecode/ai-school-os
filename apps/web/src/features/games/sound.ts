import { useSyncExternalStore } from 'react';

/**
 * Small sound effects made on the phone (Web Audio): nothing to download.
 * Off by default (classrooms, buses, shared phones); the choice is kept on this device.
 */

const KEY = 'ais-games-sound';
const listeners = new Set<() => void>();
let on = (() => {
  try {
    return localStorage.getItem(KEY) === 'on';
  } catch {
    return false;
  }
})();

export function setSound(next: boolean) {
  on = next;
  try {
    localStorage.setItem(KEY, next ? 'on' : 'off');
  } catch {
    /* private mode */
  }
  listeners.forEach((l) => l());
  if (next) play('tap');
}

export const useSound = () =>
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => on,
  );

let ctx: AudioContext | null = null;

const TUNES: Record<'right' | 'wrong' | 'tap' | 'done' | 'tick', [number, number][]> = {
  right: [
    [660, 0.08],
    [880, 0.12],
  ],
  wrong: [
    [220, 0.18],
  ],
  tap: [[520, 0.05]],
  tick: [[1000, 0.03]],
  done: [
    [523, 0.1],
    [659, 0.1],
    [784, 0.18],
  ],
};

export function play(kind: keyof typeof TUNES) {
  if (!on || typeof window === 'undefined') return;
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx ??= new AC();
    // iPhone: a context made outside a tap starts suspended; the next tap's sound wakes it.
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
    let t = ctx.currentTime;
    for (const [freq, dur] of TUNES[kind]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = kind === 'wrong' ? 'triangle' : 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.12, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + dur + 0.02);
      t += dur;
    }
  } catch {
    /* audio blocked */
  }
}

/** A short buzz on phones that support it (also off unless sound is on). */
export function buzz(ms = 40) {
  if (!on) return;
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* not supported */
  }
}
