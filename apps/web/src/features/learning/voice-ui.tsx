import type { AllowanceExhausted } from '@aischool/shared';
import { motion, useReducedMotion } from 'framer-motion';
import { AudioLines, Loader2, Mic, Pause, PhoneOff, Sparkles, Square, Volume2, VolumeX } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { transcribeSpeech } from './api';
import { UpgradeCard } from './components';
import { liveVoice, plainForSpeech, recognise, record, speaker, unlockAudio, VoiceError, type MicMode } from './voice';

// ------------------------------------------------------------------ hooks

export type VoiceInputState = 'idle' | 'starting' | 'listening' | 'transcribing';
export interface VoiceInput {
  mode: MicMode;
  state: VoiceInputState;
  /**
   * Call from a tap. Resolves with what the student said ('' if nothing was
   * heard) or null when cancelled; rejects with a friendly VoiceError.
   */
  listen(): Promise<string | null>;
  /** Finish listening now and use what was said. */
  stop(): void;
  /** Throw the recording away. */
  cancel(): void;
}

/** The microphone, as one shared control for the composer and Talk mode. */
export function useVoiceInput(mode: MicMode, subject: string | null): VoiceInput {
  const [state, setState] = useState<VoiceInputState>('idle');
  const handle = useRef<{ stop(): void; cancel(): void } | null>(null);
  const abort = useRef<AbortController | null>(null);
  const manual = useRef(false);
  const gen = useRef(0);
  const subjectRef = useRef(subject);
  subjectRef.current = subject;

  const cancel = useCallback(() => {
    gen.current++;
    handle.current?.cancel();
    handle.current = null;
    abort.current?.abort();
    abort.current = null;
    setState('idle');
  }, []);

  const listen = useCallback(async (): Promise<string | null> => {
    // Inside the tap: prime audio for the reply, silence any reading.
    unlockAudio();
    speaker.stop();
    if (!mode) throw new VoiceError('Voice is not available in this browser. You can type your question instead.');
    handle.current?.cancel();
    const my = ++gen.current;
    const current = () => my === gen.current;
    manual.current = false;
    setState('starting');
    try {
      if (mode === 'browser') {
        const r = await recognise();
        if (!current()) {
          r.cancel();
          return null;
        }
        handle.current = r;
        setState('listening');
        return await r.result;
      }
      const cap = await record();
      if (!current()) {
        cap.cancel();
        return null;
      }
      handle.current = cap;
      setState('listening');
      const take = await cap.result;
      handle.current = null;
      if (!take.blob || !current()) return null;
      if ((!take.heard && !manual.current) || take.blob.size < 400) return '';
      setState('transcribing');
      const ctrl = new AbortController();
      abort.current = ctrl;
      const text = await transcribeSpeech(take.blob, subjectRef.current, ctrl.signal);
      return current() ? text : null;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return null;
      throw err;
    } finally {
      if (current()) {
        handle.current = null;
        abort.current = null;
        setState('idle');
      }
    }
  }, [mode]);

  const stop = useCallback(() => {
    manual.current = true;
    handle.current?.stop();
  }, []);

  useEffect(() => cancel, [cancel]);

  return { mode, state, listen, stop, cancel };
}

/** What the speaker is doing, for one message's Listen button or the whole page. */
export function useSpeaking() {
  return useSyncExternalStore(speaker.subscribe, speaker.get);
}

// ------------------------------------------------------------------ composer pieces

/** Five bars that follow the microphone level. */
export function LevelBars({ className, indeterminate }: { className?: string; indeterminate?: boolean }) {
  const level = useSyncExternalStore(liveVoice.subscribe, liveVoice.level);
  const reduce = useReducedMotion();
  return (
    <span className={cn('flex h-6 items-center gap-[3px]', className)} aria-hidden>
      {[0.55, 0.85, 1, 0.75, 0.5].map((w, i) => (
        <span
          key={i}
          className={cn('w-[3px] rounded-full bg-ai-2 transition-[height] duration-75 ease-out', indeterminate && !reduce && 'animate-pulse')}
          style={{ height: `${Math.round(4 + (reduce ? 0.4 : indeterminate ? 0.6 : level) * w * 20)}px`, animationDelay: indeterminate ? `${i * 120}ms` : undefined }}
        />
      ))}
    </span>
  );
}

/** Replaces the text box while the student is talking. */
export function RecordingStrip({ voice }: { voice: VoiceInput }) {
  const interim = useSyncExternalStore(liveVoice.subscribe, liveVoice.interim);
  const listening = voice.state === 'listening';
  const label = voice.state === 'transcribing' ? 'Transcribing…' : voice.state === 'starting' ? 'Starting the microphone…' : 'Listening… tap to stop';
  return (
    <div className="flex min-h-[60px] items-center gap-2.5 px-3 pt-2.5">
      <button
        type="button"
        onClick={() => listening && voice.stop()}
        disabled={!listening}
        className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={listening ? 'Stop and send what you said' : label}
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-ai-2/10">
          {listening ? <LevelBars indeterminate={voice.mode === 'browser'} /> : <Loader2 className="size-4 animate-spin text-ai-2" aria-hidden />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] font-medium" role="status" aria-live="polite">
            {label}
          </span>
          {interim ? (
            <span className="block truncate text-[12.5px] text-muted-foreground">{interim}</span>
          ) : (
            listening && <span className="block truncate text-[12px] text-muted-foreground">I’ll send it when you pause</span>
          )}
        </span>
      </button>
      <Button type="button" variant="ghost" size="sm" onClick={voice.cancel}>
        Cancel
      </Button>
    </div>
  );
}

/** Tap to talk, tap again to stop. */
export function MicButton({ voice, onTap, disabled, className }: { voice: VoiceInput; onTap: () => void; disabled?: boolean; className?: string }) {
  const listening = voice.state === 'listening';
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      onClick={onTap}
      disabled={disabled || voice.state === 'starting' || voice.state === 'transcribing'}
      aria-label={listening ? 'Stop and send what you said' : 'Ask by voice'}
      aria-pressed={listening}
      title={listening ? 'Stop' : 'Ask by voice'}
      className={cn(listening && 'bg-ai-2/15 text-ai-2 hover:bg-ai-2/20 hover:text-ai-2', className)}
    >
      {voice.state === 'transcribing' ? <Loader2 className="animate-spin" /> : listening ? <Square className="fill-current" /> : <Mic />}
    </Button>
  );
}

/** "Voice replies" on/off for the tutor header. */
export function VoiceRepliesToggle({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={() => {
        if (!on) unlockAudio();
        onChange(!on);
      }}
      aria-pressed={on}
      aria-label="Voice replies"
      title={on ? 'Voice replies are on' : 'Voice replies are off'}
      className={cn('px-2', on && 'text-ai-2 hover:text-ai-2')}
    >
      {on ? <Volume2 /> : <VolumeX />}
      <span className="hidden lg:inline">Voice replies</span>
    </Button>
  );
}

/** Replay one tutor message aloud. */
export function ListenButton({ id, text, server }: { id: string; text: string; server: boolean }) {
  const s = useSpeaking();
  const mine = s.id === id;
  return (
    <button
      type="button"
      onClick={() => {
        if (mine) return speaker.stop();
        unlockAudio();
        void speaker.speak(id, text, server);
      }}
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        mine && 'text-ai-2 hover:text-ai-2',
      )}
      aria-label={mine ? 'Stop reading aloud' : 'Listen to this reply'}
    >
      {mine && s.status === 'loading' ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : mine ? <Square className="size-3 fill-current" aria-hidden /> : <Volume2 className="size-3.5" aria-hidden />}
      {mine ? 'Stop' : 'Listen'}
    </button>
  );
}

// ------------------------------------------------------------------ Talk mode

export type AskResult = { id: string; reply: string } | 'blocked' | null;
type Phase = 'paused' | 'listening' | 'thinking' | 'speaking' | 'blocked';
type OrbState = 'paused' | 'listening' | 'thinking' | 'speaking';

const STATUS: Record<OrbState, string> = { listening: 'Listening…', thinking: 'Thinking…', speaking: 'Speaking…', paused: 'Paused' };

/**
 * Hands-free conversation: listen → transcribe → ask (voice) → read the reply
 * → listen again. Every turn lands in the normal chat history.
 */
export function TalkPanel({
  open,
  onClose,
  voice,
  server,
  ask,
  blocked,
  who = 'tutor',
}: {
  open: boolean;
  onClose: () => void;
  voice: VoiceInput;
  server: boolean;
  ask: (text: string) => Promise<AskResult>;
  blocked: AllowanceExhausted | null;
  /** Who the student is talking to ("tutor", "counsellor"). */
  who?: string;
}) {
  const [phase, setPhase] = useState<Phase>('paused');
  const [heard, setHeard] = useState('');
  const [reply, setReply] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const interim = useSyncExternalStore(liveVoice.subscribe, liveVoice.interim);
  const run = useRef(0);
  const askRef = useRef(ask);
  askRef.current = ask;
  const voiceRef = useRef(voice);
  voiceRef.current = voice;

  const halt = useCallback(() => {
    run.current++;
    voiceRef.current.cancel();
    speaker.stop();
  }, []);

  const turn = useCallback(async () => {
    const my = ++run.current;
    const alive = () => my === run.current;
    setNote(null);
    setPhase('listening');
    let text: string | null;
    try {
      text = await voiceRef.current.listen();
    } catch (err) {
      if (!alive()) return;
      setPhase('paused');
      setNote(err instanceof Error ? err.message : 'The microphone could not be started.');
      return;
    }
    if (!alive() || text === null) return;
    if (!text) {
      setPhase('paused');
      setNote('I didn’t catch that. Tap the circle and try again.');
      return;
    }
    setHeard(text);
    setReply('');
    setPhase('thinking');
    const r = await askRef.current(text);
    if (!alive()) return;
    if (r === 'blocked') {
      setPhase('blocked');
      return;
    }
    if (!r) {
      setPhase('paused');
      setNote('That didn’t go through. Tap the circle to try again.');
      return;
    }
    setReply(r.reply);
    setPhase('speaking');
    await speaker.speak(r.id, r.reply, server);
    if (alive()) void turn();
  }, [server]);

  // Start listening as soon as the panel opens (the opening tap already unlocked audio).
  useEffect(() => {
    if (!open) return;
    setHeard('');
    setReply('');
    void turn();
    return halt;
  }, [open, turn, halt]);

  const orb: OrbState = phase === 'blocked' ? 'paused' : phase === 'listening' && voice.state === 'transcribing' ? 'thinking' : phase;

  const tapOrb = () => {
    if (orb === 'listening') voice.stop();
    else if (orb === 'speaking' || orb === 'paused') {
      if (phase === 'blocked') return;
      speaker.stop();
      void turn();
    }
  };
  const pause = () => {
    halt();
    setPhase('paused');
    setNote(null);
  };
  const end = () => {
    halt();
    onClose();
  };

  const hint =
    phase === 'blocked'
      ? null
      : note ??
        (orb === 'listening'
          ? 'Speak now. I’ll answer when you pause — or tap the circle when you’re done.'
          : orb === 'thinking'
            ? voice.state === 'transcribing'
              ? 'Working out what you said'
              : 'Working out a reply'
            : orb === 'speaking'
              ? 'Tap the circle to interrupt and ask something else.'
              : 'Tap the circle to talk.');
  const orbLabel =
    orb === 'listening' ? 'Stop listening and send' : orb === 'speaking' ? 'Interrupt and talk' : orb === 'thinking' ? `Your ${who} is thinking` : 'Start talking';
  const you = phase === 'listening' && interim ? interim : heard;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && end()}>
      <DialogContent size="sm" hideClose className="h-[92dvh] sm:h-[min(720px,88dvh)]">
        <div className="flex items-center justify-between gap-3 px-5 pt-5">
          <div className="min-w-0">
            <DialogTitle className="text-[16px]">Talk to your {who}</DialogTitle>
            <DialogDescription className="text-[12px]">Hands-free. Everything you say stays in this chat.</DialogDescription>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-ai-2/10 px-2 py-0.5 text-[11px] font-medium text-ai-2">
            <AudioLines className="size-3" aria-hidden /> Voice
          </span>
        </div>

        <div className="flex min-h-0 flex-1 flex-col items-center px-5 pt-6">
          {phase === 'blocked' && blocked ? (
            <UpgradeCard error={blocked} className="w-full" />
          ) : (
            <>
              <Orb state={orb} onTap={tapOrb} label={orbLabel} />
              <p className="mt-5 font-display text-[18px] font-semibold tracking-tight" role="status" aria-live="polite">
                {STATUS[orb]}
              </p>
              {hint && <p className="mt-1 max-w-[30ch] text-center text-[13px] text-muted-foreground">{hint}</p>}
            </>
          )}

          <div className="scrollbar-thin mt-5 min-h-0 w-full flex-1 space-y-3 overflow-y-auto pb-2" aria-label="Captions">
            {you && (
              <div className="ml-auto max-w-[90%] rounded-2xl rounded-br-md bg-primary px-3.5 py-2 text-[13.5px] text-primary-foreground">
                <span className="sr-only">You said: </span>
                {you}
              </div>
            )}
            {reply && (
              <div className="max-w-[95%] rounded-2xl rounded-bl-md bg-muted px-3.5 py-2 text-[13.5px]">
                <span className="sr-only">{who.charAt(0).toUpperCase() + who.slice(1)}: </span>
                <span className="whitespace-pre-wrap break-words">{plainForSpeech(reply)}</span>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 border-t border-border bg-muted/40 p-4">
          {phase === 'paused' || phase === 'blocked' ? (
            <Button type="button" variant="outline" size="lg" onClick={() => void turn()} disabled={phase === 'blocked'}>
              <Mic /> Talk
            </Button>
          ) : (
            <Button type="button" variant="outline" size="lg" onClick={pause}>
              <Pause /> Pause
            </Button>
          )}
          <Button type="button" variant="destructive" size="lg" onClick={end}>
            <PhoneOff /> End
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** The big animated circle: follows your voice while listening, swirls while thinking, breathes while speaking. */
function Orb({ state, onTap, label }: { state: OrbState; onTap: () => void; label: string }) {
  const reduce = useReducedMotion();
  const level = useSyncExternalStore(liveVoice.subscribe, liveVoice.level);
  const lv = state === 'listening' && !reduce ? level : 0;
  const Icon = state === 'listening' ? Mic : state === 'thinking' ? Sparkles : state === 'speaking' ? AudioLines : Mic;
  const loop = (duration: number) => ({ duration, repeat: Infinity, ease: 'easeInOut' as const });

  return (
    <button
      type="button"
      onClick={onTap}
      aria-label={label}
      aria-disabled={state === 'thinking' || undefined}
      className="relative grid size-40 shrink-0 place-items-center rounded-full outline-none focus-visible:ring-4 focus-visible:ring-ring/60 sm:size-44"
    >
      <motion.span
        aria-hidden
        className="absolute inset-0 rounded-full bg-ai-gradient blur-2xl"
        animate={
          reduce
            ? { scale: 1, opacity: 0.25 }
            : state === 'listening'
              ? { scale: 1 + lv * 0.35, opacity: 0.25 + lv * 0.45 }
              : state === 'speaking'
                ? { scale: [1, 1.22, 1], opacity: [0.4, 0.15, 0.4] }
                : state === 'thinking'
                  ? { scale: 1, opacity: [0.15, 0.35, 0.15] }
                  : { scale: 1, opacity: 0.15 }
        }
        transition={state === 'listening' ? { duration: 0.09, ease: 'linear' } : state === 'speaking' ? loop(1.6) : state === 'thinking' ? loop(1.4) : { duration: 0.3 }}
      />
      <motion.span
        aria-hidden
        className={cn('absolute inset-4 rounded-full bg-ai-gradient shadow-[0_24px_60px_-18px_var(--ai-2)] transition-[opacity,filter] duration-300', state === 'paused' && 'opacity-70 saturate-50')}
        animate={
          reduce
            ? { scale: 1, rotate: 0 }
            : state === 'listening'
              ? { scale: 1 + lv * 0.14, rotate: 0 }
              : state === 'speaking'
                ? { scale: [1, 1.06, 1], rotate: 0 }
                : state === 'thinking'
                  ? { scale: 1, rotate: [0, 360] }
                  : { scale: 1, rotate: 0 }
        }
        transition={state === 'listening' ? { duration: 0.09, ease: 'linear' } : state === 'speaking' ? loop(1.1) : state === 'thinking' ? { duration: 2.4, repeat: Infinity, ease: 'linear' } : { duration: 0.3 }}
      />
      {state === 'listening' && !reduce && (
        <motion.span
          aria-hidden
          className="absolute inset-4 rounded-full border-2 border-ai-2/50"
          initial={{ scale: 1, opacity: 0.6 }}
          animate={{ scale: 1.35, opacity: 0 }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
        />
      )}
      <Icon className="relative size-10 text-white drop-shadow" aria-hidden />
    </button>
  );
}
