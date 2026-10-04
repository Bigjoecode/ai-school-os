import { fetchSpeech } from './api';

/**
 * Voice for the AI tutor, without React: recording the student (MediaRecorder,
 * with silence detection), the browser's own speech recognition as a fallback,
 * and reading replies aloud (server MP3 in parts, or the browser's speech).
 * Phones are the target: Chrome on Android and Safari on iPhone, on mobile data.
 */

// ------------------------------------------------------------------ support

interface RecognitionResultList {
  length: number;
  [i: number]: { isFinal: boolean; 0: { transcript: string } };
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { resultIndex: number; results: RecognitionResultList }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;
/** Nigerian English first; dropped for the session if the browser doesn't offer it. */
let langs = ['en-NG', 'en-GB'];

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function canRecord(): boolean {
  return typeof window !== 'undefined' && window.isSecureContext && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';
}

export const canSynthesise = () => typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';

/** How the student's voice becomes text: recorded and sent to the server, the browser's recogniser, or not at all. */
export type MicMode = 'server' | 'browser' | null;
export function micMode(server: boolean): MicMode {
  if (server && canRecord()) return 'server';
  if (recognitionCtor()) return 'browser';
  return null;
}

function recorderMime(): string {
  for (const m of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/ogg']) {
    try {
      if (MediaRecorder.isTypeSupported(m)) return m;
    } catch {
      /* older Safari */
    }
  }
  return '';
}

/** A friendly reason the microphone couldn't be used. */
export class VoiceError extends Error {
  constructor(
    message: string,
    readonly kind: 'denied' | 'no-mic' | 'busy' | 'network' | 'other' = 'other',
  ) {
    super(message);
    this.name = 'VoiceError';
  }
}

const DENIED =
  'Your microphone is blocked. To talk to your tutor, allow the microphone for this site in your browser settings (tap the lock or ⓘ icon beside the web address), then try again.';

function micError(err: unknown): VoiceError {
  const name = err instanceof DOMException || err instanceof Error ? err.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') return new VoiceError(DENIED, 'denied');
  if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'DevicesNotFoundError') return new VoiceError('No microphone was found on this device.', 'no-mic');
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError')
    return new VoiceError('Your microphone is being used by another app. Close it (for example a call) and try again.', 'busy');
  return new VoiceError('The microphone could not be started. Please try again or type your question.');
}

// ------------------------------------------------------------------ live level + interim text (one mic at a time)

type Listener = () => void;
let live = { level: 0, interim: '' };
const liveListeners = new Set<Listener>();
function setLive(next: Partial<typeof live>) {
  live = { ...live, ...next };
  liveListeners.forEach((l) => l());
}
export const liveVoice = {
  subscribe: (l: Listener) => {
    liveListeners.add(l);
    return () => void liveListeners.delete(l);
  },
  level: () => live.level,
  interim: () => live.interim,
};

// ------------------------------------------------------------------ audio unlock (autoplay rules)

let ctx: AudioContext | null = null;
function audioContext(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
  } catch {
    return null;
  }
  return ctx;
}

let player: HTMLAudioElement | null = null;
function audioPlayer(): HTMLAudioElement {
  if (!player) {
    player = new Audio();
    player.preload = 'auto';
    player.setAttribute('playsinline', '');
  }
  return player;
}

function silentWav(): string {
  const samples = 800; // 0.1 s at 8 kHz, 8-bit mono
  const buf = new Uint8Array(44 + samples);
  const v = new DataView(buf.buffer);
  const tag = (o: number, s: string) => [...s].forEach((c, i) => (buf[o + i] = c.charCodeAt(0)));
  tag(0, 'RIFF');
  v.setUint32(4, 36 + samples, true);
  tag(8, 'WAVE');
  tag(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true);
  v.setUint32(28, 8000, true);
  v.setUint16(32, 1, true);
  v.setUint16(34, 8, true);
  tag(36, 'data');
  v.setUint32(40, samples, true);
  buf.fill(128, 44);
  let bin = '';
  buf.forEach((b) => (bin += String.fromCharCode(b)));
  return `data:audio/wav;base64,${btoa(bin)}`;
}
let silent: string | null = null;
let playerUnlocked = false;
let synthUnlocked = false;

/**
 * Call inside a tap/click handler, before anything async: iPhones (and Android
 * without prior interaction) only allow sound that a gesture started, so the
 * shared audio element, AudioContext and speech engine are primed here.
 */
export function unlockAudio() {
  try {
    const c = audioContext();
    if (c) {
      if (c.state === 'suspended') void c.resume();
      const src = c.createBufferSource();
      src.buffer = c.createBuffer(1, 1, 22050);
      src.connect(c.destination);
      src.start(0);
    }
  } catch {
    /* no Web Audio */
  }
  if (!playerUnlocked) {
    playerUnlocked = true;
    const p = audioPlayer();
    silent ??= silentWav();
    p.muted = true;
    p.src = silent;
    const done = () => {
      if (p.src === silent) {
        p.pause();
        p.removeAttribute('src');
      }
      p.muted = false;
    };
    p.play().then(done, () => {
      playerUnlocked = false;
      done();
    });
  }
  if (!synthUnlocked && canSynthesise()) {
    synthUnlocked = true;
    try {
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      window.speechSynthesis.speak(u);
    } catch {
      /* ignore */
    }
  }
}

// ------------------------------------------------------------------ recording (server transcription)

export interface Take {
  /** The recording, or null when cancelled. */
  blob: Blob | null;
  /** Whether anything louder than the room was heard. */
  heard: boolean;
}
export interface Capture {
  result: Promise<Take>;
  /** Finish now and keep what was said. */
  stop(): void;
  /** Throw the recording away. */
  cancel(): void;
}

const SILENCE_MS = 1500;
const MAX_MS = 60_000;
const NO_SPEECH_MS = 12_000;

/** Starts the microphone. Resolves once recording has begun; `result` settles when it ends (tap, silence, 60 s, or cancel). */
export async function record(): Promise<Capture> {
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  } catch (err) {
    throw micError(err);
  }
  const mime = recorderMime();
  let rec: MediaRecorder;
  try {
    rec = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: 32_000 });
  } catch {
    try {
      rec = new MediaRecorder(stream);
    } catch (err) {
      stream.getTracks().forEach((t) => t.stop());
      throw micError(err);
    }
  }

  const chunks: Blob[] = [];
  let cancelled = false;
  let heard = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  let source: MediaStreamAudioSourceNode | null = null;

  const cleanup = () => {
    clearInterval(timer);
    try {
      source?.disconnect();
    } catch {
      /* already gone */
    }
    stream.getTracks().forEach((t) => t.stop());
    setLive({ level: 0 });
  };
  const finish = () => {
    if (rec.state !== 'inactive') {
      try {
        rec.stop();
      } catch {
        cleanup();
      }
    }
  };

  const result = new Promise<Take>((resolve) => {
    rec.ondataavailable = (e) => {
      if (e.data?.size) chunks.push(e.data);
    };
    rec.onstop = () => {
      cleanup();
      resolve(cancelled ? { blob: null, heard } : { blob: new Blob(chunks, { type: rec.mimeType || mime || 'audio/webm' }), heard });
    };
    rec.onerror = () => {
      cleanup();
      resolve({ blob: null, heard });
    };
  });

  try {
    rec.start(1000);
  } catch (err) {
    stream.getTracks().forEach((t) => t.stop());
    throw micError(err);
  }
  const started = Date.now();

  // Level meter and silence detection on the same stream.
  const c = audioContext();
  if (c) {
    try {
      if (c.state === 'suspended') void c.resume();
      source = c.createMediaStreamSource(stream);
      const analyser = c.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      let floor = 0;
      let samples = 0;
      let loudMs = 0;
      let quietSince = 0;
      const STEP = 60;
      timer = setInterval(() => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const x = (data[i]! - 128) / 128;
          sum += x * x;
        }
        const rms = Math.sqrt(sum / data.length);
        const now = Date.now();
        // The first ~300 ms sets the room's noise floor.
        if (samples < 5) {
          floor = (floor * samples + rms) / (samples + 1);
          samples++;
        }
        const threshold = Math.max(0.02, floor * 2.5);
        setLive({ level: Math.min(1, Math.sqrt(rms / 0.3)) });
        if (rms > threshold) {
          loudMs += STEP;
          quietSince = 0;
          if (loudMs >= 180) heard = true;
        } else if (heard) {
          quietSince ||= now;
          if (now - quietSince >= SILENCE_MS) finish();
        }
        if (!heard && now - started >= NO_SPEECH_MS) finish();
        if (now - started >= MAX_MS) finish();
      }, STEP);
    } catch {
      /* no meter: tap to stop, 60 s cap below */
    }
  }
  if (!timer) timer = setInterval(() => Date.now() - started >= MAX_MS && finish(), 1000);

  return {
    result,
    stop: finish,
    cancel: () => {
      cancelled = true;
      finish();
    },
  };
}

// ------------------------------------------------------------------ browser speech recognition (no server voice)

export interface Recognising {
  /** The words heard (empty if nothing), or null when cancelled. */
  result: Promise<string | null>;
  stop(): void;
  cancel(): void;
}

/** The browser's recogniser (Chrome sends audio to Google; Safari to Apple). Interim words go to liveVoice.interim. */
export function recognise(): Promise<Recognising> {
  const Ctor = recognitionCtor();
  if (!Ctor) return Promise.reject(new VoiceError('Voice typing is not available in this browser.'));
  return new Promise((ready, fail) => {
    let finalText = '';
    let interim = '';
    let cancelled = false;
    let begun = false;
    let rec: Recognition;
    let resolveResult: (v: string | null) => void = () => {};
    let rejectResult: (e: VoiceError) => void = () => {};
    const result = new Promise<string | null>((res, rej) => {
      resolveResult = res;
      rejectResult = rej;
    });
    result.catch(() => {});
    const cap = setTimeout(() => rec?.stop(), MAX_MS);

    const begin = () => {
      rec = new Ctor();
      rec.lang = langs[0]!;
      rec.continuous = false; // ends by itself after a pause
      rec.interimResults = true;
      rec.maxAlternatives = 1;
      rec.onresult = (e) => {
        interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i]!;
          if (r.isFinal) finalText += r[0].transcript;
          else interim += r[0].transcript;
        }
        setLive({ interim: `${finalText}${interim}`.trim(), level: 0.6 });
      };
      rec.onerror = (e) => {
        if (e.error === 'language-not-supported' && langs.length > 1) {
          langs = langs.slice(1);
          rec.onend = null;
          begin();
          return;
        }
        if (e.error === 'aborted' || e.error === 'no-speech') return;
        const err =
          e.error === 'not-allowed' || e.error === 'service-not-allowed'
            ? new VoiceError(DENIED, 'denied')
            : e.error === 'network'
              ? new VoiceError('Voice typing needs an internet connection. Check your data and try again.', 'network')
              : e.error === 'audio-capture'
                ? new VoiceError('No microphone was found on this device.', 'no-mic')
                : new VoiceError('Your voice could not be understood just now. Please try again or type your question.');
        rec.onend = null;
        clearTimeout(cap);
        setLive({ interim: '', level: 0 });
        if (!begun) fail(err);
        else rejectResult(err);
      };
      rec.onend = () => {
        clearTimeout(cap);
        setLive({ interim: '', level: 0 });
        resolveResult(cancelled ? null : `${finalText}${interim}`.trim());
      };
      try {
        rec.start();
      } catch (err) {
        clearTimeout(cap);
        fail(micError(err));
        return;
      }
      if (!begun) {
        begun = true;
        setLive({ interim: '', level: 0.6 });
        ready({
          result,
          stop: () => rec.stop(),
          cancel: () => {
            cancelled = true;
            rec.abort();
          },
        });
      }
    };
    begin();
  });
}

// ------------------------------------------------------------------ text for speech

/** Markdown and simple maths as plain words, for the browser's speech engine and captions. */
export function plainForSpeech(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/\\frac\{([^}]*)}\{([^}]*)}/g, '$1 over $2')
    .replace(/\\sqrt\{([^}]*)}/g, 'the square root of $1')
    .replace(/\\(times|cdot)/g, ' times ')
    .replace(/\\div/g, ' divided by ')
    .replace(/\\pm/g, ' plus or minus ')
    .replace(/\\(le|leq)\b/g, ' less than or equal to ')
    .replace(/\\(ge|geq)\b/g, ' greater than or equal to ')
    .replace(/\\pi\b/g, ' pi ')
    .replace(/\^2\b/g, ' squared')
    .replace(/\^3\b/g, ' cubed')
    .replace(/\^\{?([^}\s]+)}?/g, ' to the power of $1')
    .replace(/\\[a-zA-Z]+/g, ' ')
    .replace(/[$`{}]/g, '')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*[-*+•]\s+/gm, '')
    .replace(/\*\*|__|~~/g, '')
    .replace(/(^|\s)[*_](\S[^*_]*\S|\S)[*_](?=\s|[.,!?]|$)/g, '$1$2')
    .replace(/^\s*\|?[-:\s|]+\|?\s*$/gm, '')
    .replace(/\s*\|\s*/g, ', ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function splitLong(s: string, max: number): string[] {
  const out: string[] = [];
  let rest = s;
  while (rest.length > max) {
    let cut = rest.lastIndexOf(', ', max);
    if (cut < max / 3) cut = rest.lastIndexOf(' ', max);
    if (cut < max / 3) cut = max;
    out.push(rest.slice(0, cut + 1).trim());
    rest = rest.slice(cut + 1);
  }
  if (rest.trim()) out.push(rest.trim());
  return out;
}

/** Parts of at most `max` characters, cut at paragraphs and sentences. The first is short so sound starts sooner. */
export function chunkForSpeech(text: string, max = 600, first = 280): string[] {
  const sentences = text
    .split(/\n{2,}/)
    .flatMap((p) => p.replace(/([.!?…]["')\]]*)\s+/g, '$1\u0000').split('\u0000'))
    .map((s) => s.trim())
    .filter(Boolean);
  const out: string[] = [];
  let cur = '';
  for (const s of sentences) {
    const limit = out.length === 0 ? first : max;
    if (cur && cur.length + 1 + s.length > limit) {
      out.push(cur);
      cur = '';
    }
    const lim = out.length === 0 ? first : max;
    if (s.length > lim) {
      const parts = splitLong(s, lim);
      out.push(...parts.slice(0, -1));
      cur = parts.at(-1) ?? '';
    } else cur = cur ? `${cur} ${s}` : s;
  }
  if (cur) out.push(cur);
  return out;
}

// ------------------------------------------------------------------ speaking

export interface SpeakState {
  /** The message being read, or null. */
  id: string | null;
  status: 'idle' | 'loading' | 'playing';
}

let voices: SpeechSynthesisVoice[] = [];
function pickVoice(): SpeechSynthesisVoice | null {
  if (!canSynthesise()) return null;
  if (!voices.length) voices = window.speechSynthesis.getVoices();
  const lang = (v: SpeechSynthesisVoice) => v.lang.replace('_', '-').toLowerCase();
  return voices.find((v) => lang(v) === 'en-ng') ?? voices.find((v) => lang(v) === 'en-gb') ?? voices.find((v) => lang(v).startsWith('en')) ?? null;
}
if (canSynthesise()) {
  try {
    window.speechSynthesis.addEventListener?.('voiceschanged', () => (voices = window.speechSynthesis.getVoices()));
  } catch {
    /* older engines */
  }
}

class Speaker {
  private state: SpeakState = { id: null, status: 'idle' };
  private listeners = new Set<Listener>();
  private gen = 0;
  private abort: AbortController | null = null;
  private interrupt: (() => void) | null = null;

  subscribe = (l: Listener) => {
    this.listeners.add(l);
    return () => void this.listeners.delete(l);
  };
  get = () => this.state;
  private set(next: SpeakState) {
    this.state = next;
    this.listeners.forEach((l) => l());
  }

  /**
   * Reads `text` aloud. With server voice, each part is fetched as MP3 while the
   * one before plays; if that fails (or there is no server voice) the browser's
   * own speech takes over. Resolves when finished or stopped.
   */
  async speak(id: string, text: string, server: boolean): Promise<void> {
    this.stop();
    const my = this.gen;
    const alive = () => my === this.gen;
    this.set({ id, status: 'loading' });
    const ctrl = new AbortController();
    this.abort = ctrl;
    const parts = chunkForSpeech(text);
    let useServer = server;
    const fetched: Promise<Blob>[] = [];
    const get = (i: number) => (fetched[i] ??= fetchSpeech(parts[i]!, ctrl.signal));

    for (let i = 0; i < parts.length && alive(); i++) {
      if (useServer) {
        try {
          const blob = await get(i);
          if (!alive()) return;
          if (i + 1 < parts.length) get(i + 1).catch(() => {});
          this.set({ id, status: 'playing' });
          await this.play(blob, alive);
          continue;
        } catch {
          if (!alive()) return;
          useServer = false; // fall back for the rest of this reply
        }
      }
      if (!canSynthesise()) break;
      this.set({ id, status: 'playing' });
      for (const piece of chunkForSpeech(plainForSpeech(parts[i]!), 220, 220)) {
        if (!alive()) return;
        await this.synth(piece);
      }
    }
    if (alive()) {
      this.abort = null;
      this.set({ id: null, status: 'idle' });
    }
  }

  private play(blob: Blob, alive: () => boolean): Promise<void> {
    const p = audioPlayer();
    const url = URL.createObjectURL(blob);
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const end = (err?: unknown) => {
        if (settled) return;
        settled = true;
        p.onended = null;
        p.onerror = null;
        this.interrupt = null;
        URL.revokeObjectURL(url);
        if (err && alive()) reject(err);
        else resolve();
      };
      this.interrupt = () => end();
      p.onended = () => end();
      p.onerror = () => end(new Error('playback failed'));
      p.muted = false;
      p.src = url;
      p.play().catch((e: unknown) => end(e));
    });
  }

  private synth(text: string): Promise<void> {
    return new Promise<void>((resolve) => {
      const s = window.speechSynthesis;
      const u = new SpeechSynthesisUtterance(text);
      const v = pickVoice();
      if (v) u.voice = v;
      u.lang = v?.lang ?? 'en-GB';
      u.rate = 0.98;
      let done = false;
      // Some engines never fire `end` (no voices, background tab): don't wait forever.
      const guard = setTimeout(() => end(), 8000 + text.length * 120);
      const end = () => {
        if (done) return;
        done = true;
        clearTimeout(guard);
        this.interrupt = null;
        resolve();
      };
      u.onend = end;
      u.onerror = end;
      this.interrupt = end;
      s.speak(u);
    });
  }

  /** Silence now (mic tap, new message, voice off, page left). */
  stop() {
    this.gen++;
    this.abort?.abort();
    this.abort = null;
    if (player && player.src && !player.paused) player.pause();
    if (canSynthesise() && (window.speechSynthesis.speaking || window.speechSynthesis.pending)) window.speechSynthesis.cancel();
    this.interrupt?.();
    this.interrupt = null;
    if (this.state.status !== 'idle') this.set({ id: null, status: 'idle' });
  }
}

export const speaker = new Speaker();
