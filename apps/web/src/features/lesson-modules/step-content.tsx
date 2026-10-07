import type { CheckInReviewItem, ModuleMaterialRef, ModuleStepKind, ModuleStepRow, MyModuleStep, StudentQuestion } from '@aischool/shared';
import { Check, ExternalLink, FileText, Loader2, Play, X } from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { Markdown } from '@/components/ai/markdown';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { fetchFileBlob, hostOf, openProtectedFile } from '../live/files';
import { stepFileUrl, stepStreamUrl } from './api';
import { savedPicture } from './offline';

/** What a step shows, whether the teacher is presenting it or a student is reading it. */
export interface StepView {
  id: string;
  kind: ModuleStepKind;
  title: string;
  body: string | null;
  url: string | null;
  youtubeId: string | null;
  mimeType: string | null;
  fileName: string | null;
  hasFile: boolean;
  material: ModuleMaterialRef | null;
}

export const fromRow = (r: ModuleStepRow): StepView => ({ id: r.id, kind: r.kind, title: r.title, body: r.body, url: r.url, youtubeId: r.youtubeId, mimeType: r.mimeType, fileName: r.fileName, hasFile: !!r.fileId, material: r.material });
export const fromMine = (r: MyModuleStep): StepView => ({ id: r.id, kind: r.kind, title: r.title, body: r.body, url: r.url, youtubeId: r.youtubeId, mimeType: r.mimeType, fileName: r.fileName, hasFile: r.hasFile, material: r.material });

/** The picture steps (and picture materials), for saving offline. */
export const pictureSteps = (steps: StepView[]) => steps.filter((s) => (s.kind === 'IMAGE' && s.hasFile) || (s.material?.file?.mimeType.startsWith('image/') ?? false)).map((s) => s.id);

/** Video source: a YouTube id, or a file to stream, or a direct https video link. */
export function videoSource(s: StepView): { youtube: string } | { file: true } | { url: string } | null {
  const yt = s.youtubeId ?? s.material?.youtubeId ?? null;
  if (yt) return { youtube: yt };
  if (s.hasFile || s.material?.file?.mimeType.startsWith('video/')) return { file: true };
  const url = s.url ?? s.material?.url;
  return url ? { url } : null;
}

// ------------------------------------------------------------------ content

/** A step's content (not check-ins, which have their own forms). `big` = classroom projector size. */
export function StepContent({ moduleId, step, big, video }: { moduleId: string; step: StepView; big?: boolean; video?: ReactNode }) {
  const text = big ? 'text-[19px] sm:text-[22px] leading-relaxed [&_h2]:text-[28px] [&_h3]:text-[24px]' : '';
  const m = step.material;
  return (
    <div className="space-y-4">
      {step.kind === 'VIDEO' ? video : null}
      {step.kind === 'IMAGE' && step.hasFile && <ProtectedPicture moduleId={moduleId} stepId={step.id} alt={step.title} big={big} />}
      {step.kind === 'FILE' && step.hasFile && <FileButton moduleId={moduleId} step={step} />}
      {step.kind === 'LINK' && step.url && <LinkCard url={step.url} />}
      {step.kind === 'MATERIAL' && m && (
        <>
          {m.kind === 'NOTE' && m.body ? <Markdown text={m.body} className={cn('rounded-xl border border-border bg-card p-4 sm:p-5', text)} /> : null}
          {m.youtubeId || m.file?.mimeType.startsWith('video/') ? video : null}
          {m.file?.mimeType.startsWith('image/') ? <ProtectedPicture moduleId={moduleId} stepId={step.id} alt={m.title} big={big} /> : null}
          {m.file?.mimeType.startsWith('audio/') ? <AudioStream moduleId={moduleId} stepId={step.id} /> : null}
          {m.file && !/^(image|video|audio)\//.test(m.file.mimeType) ? <FileButton moduleId={moduleId} step={{ ...step, fileName: m.file.name, mimeType: m.file.mimeType }} /> : null}
          {!m.file && !m.youtubeId && m.url && m.kind !== 'NOTE' ? <LinkCard url={m.url} /> : null}
        </>
      )}
      {step.body && <Markdown text={step.body} className={cn(step.kind === 'NOTE' ? 'rounded-xl border border-border bg-card p-4 sm:p-6' : '', text)} />}
    </div>
  );
}

export function ProtectedPicture({ moduleId, stepId, alt, big }: { moduleId: string; stepId: string; alt: string; big?: boolean }) {
  const [state, setState] = useState<{ src: string | null; error: string | null }>({ src: null, error: null });
  useEffect(() => {
    const ctrl = new AbortController();
    let made: string | null = null;
    const show = (b: Blob) => {
      made = URL.createObjectURL(b);
      setState({ src: made, error: null });
    };
    fetchFileBlob(stepFileUrl(moduleId, stepId), ctrl.signal)
      .then(show)
      .catch(async (err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        const saved = await savedPicture(moduleId, stepId);
        if (saved) show(saved);
        else setState({ src: null, error: errorMessage(err) });
      });
    return () => {
      ctrl.abort();
      if (made) URL.revokeObjectURL(made);
    };
  }, [moduleId, stepId]);
  if (state.error) return <p className="text-[13px] text-danger">{state.error}</p>;
  if (!state.src) return <div className="grid h-48 place-items-center rounded-xl border border-border bg-muted/40"><Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden /></div>;
  return <img src={state.src} alt={alt} className={cn('mx-auto w-auto rounded-xl border border-border bg-white object-contain', big ? 'max-h-[70vh]' : 'max-h-[60vh]')} />;
}

function FileButton({ moduleId, step }: { moduleId: string; step: StepView }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-info-soft text-info">
        <FileText className="size-[18px]" aria-hidden />
      </span>
      <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{step.fileName ?? step.title}</span>
      <Button
        variant="outline"
        size="sm"
        loading={busy}
        onClick={() => {
          setBusy(true);
          void openProtectedFile(stepFileUrl(moduleId, step.id), step.fileName ?? step.title, step.mimeType).finally(() => setBusy(false));
        }}
      >
        Open
      </Button>
    </div>
  );
}

function LinkCard({ url }: { url: string }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 text-[14px] hover:bg-muted/60">
      <ExternalLink className="size-4 text-muted-foreground" aria-hidden />
      <span className="min-w-0 flex-1 truncate">{hostOf(url)}</span>
      <span className="text-[12.5px] text-brand">Open</span>
    </a>
  );
}

function useStream(moduleId: string, stepId: string, enabled: boolean) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    setSrc(null);
    setError(null);
    stepStreamUrl(moduleId, stepId)
      .then((r) => live && setSrc(r.url))
      .catch((e: unknown) => live && setError(errorMessage(e)));
    return () => {
      live = false;
    };
  }, [moduleId, stepId, enabled]);
  return { src, error };
}

function AudioStream({ moduleId, stepId }: { moduleId: string; stepId: string }) {
  const { src, error } = useStream(moduleId, stepId, true);
  if (error) return <p className="text-[13px] text-danger">{error}</p>;
  return src ? <audio src={src} controls preload="none" className="w-full" /> : <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />;
}

// ------------------------------------------------------------------ video quiz

interface Cue {
  id: string;
  at: number;
}

declare global {
  interface Window {
    YT?: { Player: new (el: HTMLElement, opts: Record<string, unknown>) => YtPlayer; PlayerState: { ENDED: number; PLAYING: number } };
    onYouTubeIframeAPIReady?: () => void;
  }
}
interface YtPlayer {
  getCurrentTime(): number;
  pauseVideo(): void;
  playVideo(): void;
  seekTo(s: number, allowSeekAhead: boolean): void;
  destroy(): void;
}

let ytLoading: Promise<NonNullable<Window['YT']>> | null = null;
/** The YouTube IFrame API, loaded once (rejects after 10 s, e.g. when blocked). */
function loadYouTube(): Promise<NonNullable<Window['YT']>> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!ytLoading) {
    ytLoading = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        ytLoading = null;
        reject(new Error('YouTube did not load'));
      }, 10_000);
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        prev?.();
        clearTimeout(timer);
        if (window.YT) resolve(window.YT);
      };
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      s.async = true;
      s.onerror = () => {
        clearTimeout(timer);
        ytLoading = null;
        reject(new Error('YouTube did not load'));
      };
      document.head.appendChild(s);
    });
  }
  return ytLoading;
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/**
 * A video with questions pinned at timestamps: it pauses at each one and
 * waits for an answer before it plays on (seeking past an unanswered
 * question jumps back to it). Uploaded videos use HTML5 video; YouTube uses
 * the IFrame API, or (if it can't load) shows the questions after the video.
 */
export function VideoQuiz({
  moduleId,
  step,
  cues,
  isDone,
  renderCue,
  onEnded,
  big,
}: {
  moduleId: string;
  step: StepView;
  cues: Cue[];
  isDone: (id: string) => boolean;
  renderCue: (id: string, resume: () => void) => ReactNode;
  onEnded?: () => void;
  big?: boolean;
}) {
  const source = videoSource(step);
  const sorted = [...cues].sort((a, b) => a.at - b.at);
  const [active, setActive] = useState<string | null>(null);
  const next = () => sorted.find((c) => !isDone(c.id)) ?? null;
  const nextRef = useRef(next);
  nextRef.current = next;
  const activeRef = useRef(active);
  activeRef.current = active;

  // ---- HTML5
  const videoRef = useRef<HTMLVideoElement>(null);
  const stream = useStream(moduleId, step.id, !!source && 'file' in source);
  const html5Src = source && 'file' in source ? stream.src : source && 'url' in source ? source.url : null;
  const onTime = () => {
    const v = videoRef.current;
    const c = nextRef.current();
    if (!v || !c || activeRef.current) return;
    if (v.currentTime >= c.at) {
      if (v.currentTime > c.at + 1.5) v.currentTime = c.at;
      v.pause();
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
      setActive(c.id);
    }
  };

  // ---- YouTube
  const ytBox = useRef<HTMLDivElement>(null);
  const player = useRef<YtPlayer | null>(null);
  const [ytState, setYtState] = useState<'idle' | 'loading' | 'ready' | 'failed'>('idle');
  const startYouTube = useCallback(() => {
    if (!source || !('youtube' in source) || !ytBox.current) return;
    setYtState('loading');
    loadYouTube()
      .then((YT) => {
        if (!ytBox.current) return;
        const el = document.createElement('div');
        ytBox.current.replaceChildren(el);
        player.current = new YT.Player(el, {
          videoId: source.youtube,
          host: 'https://www.youtube-nocookie.com',
          width: '100%',
          height: '100%',
          playerVars: { autoplay: 1, rel: 0, modestbranding: 1, playsinline: 1 },
          events: {
            onReady: () => setYtState('ready'),
            onStateChange: (e: { data: number }) => {
              if (e.data === YT.PlayerState.ENDED && !nextRef.current()) onEnded?.();
            },
          },
        });
      })
      .catch(() => setYtState('failed'));
  }, [source, onEnded]);
  useEffect(() => {
    if (ytState !== 'ready') return;
    const t = setInterval(() => {
      const p = player.current;
      const c = nextRef.current();
      if (!p || !c || activeRef.current) return;
      const now = p.getCurrentTime?.() ?? 0;
      if (now >= c.at) {
        p.pauseVideo();
        if (now > c.at + 2) p.seekTo(c.at, true);
        setActive(c.id);
      }
    }, 400);
    return () => clearInterval(t);
  }, [ytState]);
  useEffect(() => () => player.current?.destroy(), []);

  const resume = () => {
    setActive(null);
    if (videoRef.current) void videoRef.current.play().catch(() => undefined);
    player.current?.playVideo();
  };

  if (!source) return <p className="text-[13px] text-muted-foreground">This video isn’t available.</p>;

  const overlay = active && (
    <div className="absolute inset-0 z-10 flex items-center justify-center overflow-y-auto bg-black/75 p-3 sm:p-6">
      <div className={cn('w-full rounded-2xl bg-popover p-4 text-popover-foreground shadow-pop sm:p-6', big ? 'max-w-3xl' : 'max-w-lg')}>{renderCue(active, resume)}</div>
    </div>
  );
  const pending = sorted.filter((c) => !isDone(c.id));

  return (
    <div className="space-y-2">
      <div className={cn('relative w-full overflow-hidden rounded-xl border border-border bg-black', 'youtube' in source ? 'aspect-video' : '')}>
        {'youtube' in source ? (
          ytState === 'failed' ? (
            <iframe src={`https://www.youtube-nocookie.com/embed/${source.youtube}?rel=0&modestbranding=1&playsinline=1`} title={step.title} className="absolute inset-0 size-full" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
          ) : (
            <>
              <div ref={ytBox} className="absolute inset-0 [&>iframe]:size-full" />
              {ytState !== 'ready' && (
                <button type="button" onClick={startYouTube} disabled={ytState === 'loading'} className="absolute inset-0 grid place-items-center text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Play ${step.title}`}>
                  <span className="flex flex-col items-center gap-2">
                    <span className="grid size-14 place-items-center rounded-full bg-danger shadow-lg">{ytState === 'loading' ? <Loader2 className="size-6 animate-spin" /> : <Play className="ml-0.5 size-6 fill-current" aria-hidden />}</span>
                    <span className="text-[12.5px] text-white/80">Tap to play{cues.length ? ` · ${cues.length} question${cues.length === 1 ? '' : 's'} on the way` : ''}</span>
                  </span>
                </button>
              )}
            </>
          )
        ) : stream.error ? (
          <p className="p-4 text-[13px] text-white">{stream.error}</p>
        ) : html5Src ? (
          <video
            ref={videoRef}
            src={html5Src}
            controls
            preload="metadata"
            playsInline
            controlsList="nodownload nofullscreen"
            onTimeUpdate={onTime}
            onSeeked={onTime}
            onEnded={() => !nextRef.current() && onEnded?.()}
            className={cn('w-full bg-black', big ? 'max-h-[72vh]' : 'max-h-[65vh]')}
            aria-label={step.title}
          />
        ) : (
          <div className="grid h-48 place-items-center">
            <Loader2 className="size-5 animate-spin text-white/70" aria-hidden />
          </div>
        )}
        {overlay}
      </div>
      {cues.length > 0 && (
        <p className="text-[12px] text-muted-foreground">
          {pending.length ? `The video stops for a question at ${pending.map((c) => fmt(c.at)).join(', ')}.` : 'All the video questions are answered.'}
        </p>
      )}
      {'youtube' in source && ytState === 'failed' && pending.length > 0 && (
        <div className="space-y-3 rounded-xl border border-border bg-card p-4">
          <p className="text-[13px] font-medium">Answer these after watching</p>
          {renderCue(pending[0]!.id, () => undefined)}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ questions

/** A set of check-in questions to answer: big tappable options; short answers typed. */
export function QuestionForm({
  questions,
  onSubmit,
  pending,
  big,
  submitLabel = 'Check my answers',
}: {
  questions: StudentQuestion[];
  onSubmit: (answers: Record<string, number | string>) => void;
  pending?: boolean;
  big?: boolean;
  submitLabel?: string;
}) {
  const [answers, setAnswers] = useState<Record<string, number | string>>({});
  const missing = questions.filter((q) => answers[q.id] === undefined || answers[q.id] === '').length;
  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!missing) onSubmit(answers);
      }}
    >
      {questions.map((q, i) => (
        <fieldset key={q.id} className="space-y-2">
          <legend className={cn('mb-2 font-medium', big ? 'text-[20px]' : 'text-[14.5px]')}>
            {questions.length > 1 ? `${i + 1}. ` : ''}
            {q.prompt}
          </legend>
          {q.type === 'SHORT' ? (
            <Input value={String(answers[q.id] ?? '')} onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))} placeholder="Type your answer" aria-label={`Answer to question ${i + 1}`} maxLength={200} className={big ? 'h-12 text-[18px]' : ''} />
          ) : (
            <div className={cn('grid gap-2', q.type === 'TRUE_FALSE' ? 'grid-cols-2' : 'sm:grid-cols-2')}>
              {q.options.map((o, j) => {
                const on = answers[q.id] === o.key;
                return (
                  <button
                    key={o.key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setAnswers((a) => ({ ...a, [q.id]: o.key }))}
                    className={cn(
                      'flex min-h-11 items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      big ? 'text-[18px]' : 'text-[14px]',
                      on ? 'border-brand bg-brand-soft text-foreground' : 'border-border bg-card hover:bg-muted/60',
                    )}
                  >
                    {q.type === 'MCQ' && <span className={cn('grid size-6 shrink-0 place-items-center rounded-full border text-[12px] font-semibold', on ? 'border-brand bg-brand text-brand-foreground' : 'border-border')}>{'ABCDEF'[j]}</span>}
                    <span className="min-w-0">{o.text}</span>
                  </button>
                );
              })}
            </div>
          )}
        </fieldset>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="brand" size={big ? 'lg' : 'default'} loading={pending} disabled={!!missing}>
          {submitLabel}
        </Button>
        {missing > 0 && <span className="text-[12.5px] text-muted-foreground">{missing === questions.length ? 'Answer every question' : `${missing} left to answer`}</span>}
      </div>
    </form>
  );
}

export function CheckInReview({ review }: { review: CheckInReviewItem[] }) {
  return (
    <ul className="space-y-2">
      {review.map((r, i) => (
        <li key={r.questionId} className={cn('rounded-xl border p-3', r.correct ? 'border-success/30 bg-success-soft/40' : 'border-danger/30 bg-danger-soft/40')}>
          <p className="flex items-start gap-2 text-[13.5px] font-medium">
            {r.correct ? <Check className="mt-0.5 size-4 shrink-0 text-success" aria-label="Right" /> : <X className="mt-0.5 size-4 shrink-0 text-danger" aria-label="Not quite" />}
            <span>
              {i + 1}. {r.prompt}
            </span>
          </p>
          <p className="ml-6 mt-1 text-[12.5px] text-muted-foreground">
            {r.correct ? `Your answer: ${r.yourAnswer}` : `You said: ${r.yourAnswer ?? '—'} · Answer: ${r.correctAnswer}`}
          </p>
          {r.explanation && <p className="ml-6 mt-0.5 text-[12.5px] text-muted-foreground">{r.explanation}</p>}
        </li>
      ))}
    </ul>
  );
}
