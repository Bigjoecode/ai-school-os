import { useSyncExternalStore } from 'react';

/**
 * Read-aloud with the browser's own voice (free, and offline on most phones):
 * every question and option in young mode, and on request for older primary
 * pupils. Nothing is downloaded or sent anywhere.
 */

export const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';

function voice(): SpeechSynthesisVoice | null {
  const all = window.speechSynthesis.getVoices();
  return all.find((v) => v.lang === 'en-NG') ?? all.find((v) => v.lang === 'en-GB') ?? all.find((v) => v.lang.startsWith('en-GB')) ?? all.find((v) => v.lang.startsWith('en')) ?? null;
}

/** Says the parts one after another (anything already being said stops first). */
export function speak(parts: string[], rate = 0.9) {
  if (!canSpeak()) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const v = voice();
  for (const text of parts) {
    if (!text.trim()) continue;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = v?.lang ?? 'en-GB';
    if (v) u.voice = v;
    u.rate = rate;
    synth.speak(u);
  }
}

export function stopSpeaking() {
  if (canSpeak()) window.speechSynthesis.cancel();
}

/** Symbols a voice reads badly ("₦", "−", "×", "÷", "/k/"), written for the ear. */
export function forTheEar(text: string): string {
  return text
    .replace(/₦\s?([\d,]+)/g, (_, n: string) => `${n.replace(/,/g, '')} naira`)
    .replace(/−/g, ' minus ')
    .replace(/×/g, ' times ')
    .replace(/÷/g, ' divided by ')
    .replace(/\/([a-z])\//gi, ' $1 ')
    .replace(/_+/g, ' blank ')
    .replace(/[“”"]/g, '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{20E3}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** A question and its options, ready to say: "What is 3 + 4? 1: 7. 2: 6…" */
export const questionSpeech = (prompt: string, options: string[]) => [forTheEar(prompt), ...options.map((o, i) => `${i + 1}: ${forTheEar(o)}.`)];

// ------------------------------------------------------------------ "read every question to me" (kept on this device)

const KEY = 'ais-games-autoread';
const listeners = new Set<() => void>();
let auto: boolean | null = (() => {
  try {
    const v = localStorage.getItem(KEY);
    return v === null ? null : v === 'on';
  } catch {
    return null;
  }
})();

export function setAutoRead(next: boolean) {
  auto = next;
  try {
    localStorage.setItem(KEY, next ? 'on' : 'off');
  } catch {
    /* private mode */
  }
  if (!next) stopSpeaking();
  listeners.forEach((l) => l());
}

/** Auto-read: on by default in young mode (children still learning to read), off otherwise; the choice is remembered. */
export function useAutoRead(young: boolean): boolean {
  const v = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => auto,
  );
  return canSpeak() && (v ?? young);
}
