/**
 * The lab assistant's voice: the browser's own speech synthesis, off unless
 * the student turns it on. Prefers an English (Nigeria / UK) voice; does
 * nothing where speech synthesis or voices are missing.
 */

let enabled = false;
let chosen: SpeechSynthesisVoice | null | undefined;

function synth(): SpeechSynthesis | null {
  try {
    return typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
  } catch {
    return null;
  }
}
export const voiceAvailable = () => !!synth();

function pickVoice(s: SpeechSynthesis) {
  if (chosen !== undefined && chosen !== null) return chosen;
  const voices = s.getVoices();
  if (!voices.length) return null;
  chosen = voices.find((v) => v.lang === 'en-NG') ?? voices.find((v) => v.lang === 'en-GB') ?? voices.find((v) => v.lang.startsWith('en')) ?? null;
  return chosen;
}

export function setVoice(on: boolean) {
  enabled = on;
  if (!on) synth()?.cancel();
}

export function say(text: string) {
  const s = synth();
  if (!enabled || !s) return;
  try {
    s.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/cm³/g, 'cubic centimetres').replace(/dm⁻³/g, 'per cubic decimetre'));
    const v = pickVoice(s);
    if (v) u.voice = v;
    u.rate = 1;
    u.pitch = 1.05;
    s.speak(u);
  } catch {
    /* no voice: the speech bubble still shows the words */
  }
}
