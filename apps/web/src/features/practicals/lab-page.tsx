import type { PracticalAttemptView, SimulatorId, SimulatorStates } from '@aischool/shared';
import { ArrowLeft, Box, CheckCircle2, Clock, Eye, FlaskConical, Loader2, Send, Square } from 'lucide-react';
import { Component, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ErrorState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { clock, useCountdown } from '../learning/components';
import { saveLabDraft, useLabAttempt, useSubmitLab } from './api';
import { LabResult } from './result';
import { simulatorUi } from './simulators/registry';
import { defaultLabView, gpuTier, saveLabView } from './simulators/webgl';

/** The virtual lab: loads the attempt, mounts its simulator, autosaves, times EXAM mode, hands in and shows the marked result. */
export default function LabPage() {
  const { id = '' } = useParams();
  const q = useLabAttempt(id);
  const a = q.data;
  return (
    <Page className="max-w-6xl">
      {q.error && !a ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !a ? (
        <div className="space-y-4">
          <Skeleton className="h-16 rounded-2xl" />
          <Skeleton className="h-[480px] rounded-2xl" />
        </div>
      ) : (
        <LabHost key={a.id} a={a} />
      )}
    </Page>
  );
}

function LabHost({ a }: { a: PracticalAttemptView }) {
  const entry = simulatorUi(a.simulatorId);
  const [state, setState] = useState<SimulatorStates[SimulatorId]>(() => a.state ?? entry.empty());
  const latest = useRef(state);
  latest.current = state;
  const dirty = useRef(false);
  const handedIn = useRef(false);
  const [saved, setSaved] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [confirm, setConfirm] = useState(false);
  const [showWork, setShowWork] = useState(false);
  const submit = useSubmitLab(a.id);
  const done = !!a.submittedAt;
  const left = useCountdown(done ? null : a.endsAt);
  // Labs with a 3D view open in 3D on a capable device (or as this device last chose); the 2D lab is always one tap away.
  const can3d = !!entry.component3d && gpuTier() !== 'none';
  const [use3d, setUse3d] = useState(() => can3d && defaultLabView() === '3d');
  const chooseView = (v: '3d' | '2d') => {
    saveLabView(v);
    setUse3d(v === '3d');
  };

  const flush = useCallback(() => {
    if (!dirty.current || handedIn.current) return;
    dirty.current = false;
    setSaved('saving');
    saveLabDraft(a.id, latest.current).then(
      () => setSaved('saved'),
      () => {
        dirty.current = true;
        setSaved('error');
      },
    );
  }, [a.id]);
  // Autosave a moment after the student stops, and at least every 15 seconds while working.
  useEffect(() => {
    if (!dirty.current) return;
    const t = setTimeout(flush, 1500);
    return () => clearTimeout(t);
  }, [state, flush]);
  useEffect(() => {
    const t = setInterval(flush, 15_000);
    return () => clearInterval(t);
  }, [flush]);
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      if (dirty.current && !handedIn.current) e.preventDefault();
    };
    window.addEventListener('beforeunload', before);
    return () => window.removeEventListener('beforeunload', before);
  }, []);

  const handIn = useCallback(() => {
    if (handedIn.current) return;
    handedIn.current = true;
    setConfirm(false);
    submit.mutate(latest.current, { onError: () => (handedIn.current = false) });
  }, [submit]);

  // Time's up in a timed practical: hand in what is recorded.
  useEffect(() => {
    if (left != null && left <= 0 && !handedIn.current && !submit.isError) handIn();
  }, [left, handIn, submit.isError]);

  const Sim = entry.component;
  const Sim3d = entry.component3d;
  const missing = done ? [] : entry.missing(state as never, a.seed);
  const lowTime = left != null && left < 5 * 60_000;
  const view = submit.data ?? a;

  if (submit.isPending) {
    return (
      <Card className="mt-6 flex flex-col items-center gap-4 p-8 text-center" role="status" aria-live="polite">
        <div className="grid size-16 place-items-center rounded-2xl bg-ai-gradient text-white">
          <Loader2 className="size-7 animate-spin" aria-hidden />
        </div>
        <div>
          <p className="font-display text-lg font-semibold tracking-tight">{left != null && left <= 0 ? 'Time’s up — your lab has been handed in' : 'Marking your lab'}</p>
          <p className="mt-1 text-[13.5px] text-muted-foreground">Readings and calculations are marked exactly; written answers are checked against the marking guide.</p>
        </div>
      </Card>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow={`${view.subject} · Virtual lab`}
        title={view.title}
        description={view.topic ?? view.spec.title}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to={`/learn/practicals/lesson/${encodeURIComponent(view.practicalId)}`}>
              <ArrowLeft /> Lesson
            </Link>
          </Button>
        }
      />
      {view.submittedAt ? (
        <div className="space-y-4">
          <LabResult a={view} />
          <Button variant="outline" onClick={() => setShowWork((s) => !s)}>
            <Eye /> {showWork ? 'Hide' : 'Show'} your lab record
          </Button>
          {showWork && view.state && (
            <Suspense fallback={<Skeleton className="h-96 rounded-2xl" />}>
              <Sim seed={view.seed} mode={view.mode} state={view.state as never} onChange={() => undefined} readOnly startedAt={view.startedAt} practicalId={view.practicalId} />
            </Suspense>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card/95 p-3 shadow-soft backdrop-blur">
            <Badge variant={a.mode === 'EXAM' ? 'warning' : 'brand'}>
              <FlaskConical /> {a.mode === 'EXAM' ? 'Timed practical' : 'Practice — untimed'}
            </Badge>
            {left != null && (
              <span className={cn('inline-flex items-center gap-1 font-display text-[15px] font-semibold tabular', lowTime ? 'text-danger' : 'text-foreground')} aria-live="off">
                <Clock className="size-4" aria-hidden /> {clock(left)}
              </span>
            )}
            <span className="text-[12px] text-muted-foreground">{saved === 'saving' ? 'Saving…' : saved === 'saved' ? 'Saved' : saved === 'error' ? 'Not saved — will retry' : ''}</span>
            {can3d && (
              <div className="ml-auto inline-flex rounded-lg border border-border p-0.5" role="group" aria-label="Lab view">
                {(['3d', '2d'] as const).map((v) => (
                  <Button key={v} size="sm" variant={(v === '3d') === use3d ? 'secondary' : 'ghost'} className="h-7 px-2.5" onClick={() => chooseView(v)} aria-pressed={(v === '3d') === use3d}>
                    {v === '3d' ? <Box /> : <Square />} {v === '3d' ? '3D lab' : '2D lab'}
                  </Button>
                ))}
              </div>
            )}
            <Button size="sm" className={cn(!can3d && 'ml-auto')} onClick={() => setConfirm(true)}>
              <Send /> Hand in
            </Button>
          </div>
          {submit.error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">{errorMessage(submit.error)}</p>}
          {(() => {
            const props = {
              seed: a.seed,
              mode: a.mode,
              state: state as never,
              onChange: (next: SimulatorStates[SimulatorId]) => {
                dirty.current = true;
                setState(next);
              },
              readOnly: false,
              startedAt: a.startedAt,
              practicalId: a.practicalId,
            };
            const flat = (
              <Suspense fallback={<Skeleton className="h-[480px] rounded-2xl" />}>
                <Sim {...props} />
              </Suspense>
            );
            if (!use3d || !Sim3d) return flat;
            return (
              <Lab3DBoundary fallback={flat} onError={() => setUse3d(false)}>
                <Suspense fallback={<Skeleton className="h-[min(78dvh,780px)] min-h-[480px] rounded-2xl" />}>
                  <Sim3d {...props} endsAt={a.endsAt} onHandIn={() => setConfirm(true)} onUse2d={() => chooseView('2d')} />
                </Suspense>
              </Lab3DBoundary>
            );
          })()}
        </div>
      )}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        destructive={missing.length > 0}
        title={missing.length ? 'Hand in with work missing?' : 'Hand in your lab?'}
        description={
          missing.length ? (
            <ul className="list-disc space-y-0.5 pl-5">
              {missing.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="size-4 text-success" aria-hidden /> Everything is recorded. It will be marked now.
            </span>
          )
        }
        confirmLabel="Hand in"
        onConfirm={handIn}
      />
    </>
  );
}

/** If the 3D view fails (no WebGL after all, a driver or memory error), the 2D lab takes over with the same work. */
class Lab3DBoundary extends Component<{ fallback: ReactNode; onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
