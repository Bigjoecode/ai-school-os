import type { CriterionScore } from '@aischool/shared';
import { AlertTriangle, Check, ChevronDown, ChevronLeft, ChevronRight, Circle, Eye, MessageCircle, ThumbsUp, Volume2, VolumeX, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { assistantProfile } from './assistant-profile';
import { currentStep, type Correction, type GuideStep } from './guide';

/**
 * Guided mode's HUD: the step checklist (current step highlighted, with its
 * reason), the correction card ("why?") and Mrs Ada's line with her controls.
 * Also the debrief panels: the checklist before hand-in, and the walkthrough
 * of the marks after it.
 */

export function GuideChecklist({ steps, compact }: { steps: GuideStep[]; compact: boolean }) {
  const [open, setOpen] = useState(!compact);
  const cur = currentStep(steps);
  const doneCount = steps.filter((s) => s.done).length;
  const at = cur ? steps.indexOf(cur) : steps.length;
  // Collapsed: the current step and the next one. Open: everything, grouped.
  const shown = open ? steps : steps.slice(at, at + 2);
  let lastGroup: string | undefined;
  return (
    <section data-tour="guide" className="pointer-events-auto w-[min(300px,calc(100vw-1rem))] rounded-2xl border border-white/15 bg-black/60 p-2.5 text-white shadow-xl backdrop-blur" aria-label="Steps">
      <button type="button" className="flex w-full items-center gap-2 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="text-[12px] font-semibold uppercase tracking-wide text-white/70">Steps</span>
        <span className="text-[12px] text-white/60">
          {doneCount}/{steps.length}
        </span>
        <span className="ml-auto h-1.5 w-20 overflow-hidden rounded-full bg-white/15" aria-hidden>
          <span className="block h-full rounded-full bg-amber-300" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
        </span>
        <ChevronDown className={cn('size-4 text-white/70 transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      <ol className={cn('mt-1.5 space-y-1', open && 'max-h-[42vh] overflow-y-auto overscroll-contain pr-1')}>
        {shown.map((s) => {
          const head = s.group && s.group !== lastGroup ? s.group : null;
          lastGroup = s.group;
          const current = s === cur;
          return (
            <li key={s.id}>
              {head && open && <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-200/80">{head}</p>}
              <div className={cn('flex items-start gap-2 rounded-lg px-1.5 py-1 text-[12.5px] leading-snug', current && 'bg-amber-300/15 ring-1 ring-amber-300/60', s.done && 'text-white/55')}>
                {s.done ? <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-300" aria-label="done" /> : current ? <ChevronRight className="mt-0.5 size-3.5 shrink-0 text-amber-300" aria-label="now" /> : <Circle className="mt-0.5 size-3 shrink-0 text-white/40" aria-hidden />}
                <span>
                  {s.group && !open && current ? `${s.group}: ` : ''}
                  {s.label}
                  {current && <span className="mt-0.5 block text-[11.5px] text-white/70">{s.why}</span>}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function CorrectionCard({ c, onClose, onAsk }: { c: Correction; onClose: () => void; onAsk: () => void }) {
  const [why, setWhy] = useState(false);
  return (
    <section className="pointer-events-auto mx-auto w-full max-w-md rounded-2xl border border-amber-300/60 bg-amber-50 p-3 text-amber-950 shadow-xl" role="alert">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
        <p className="text-[13.5px] font-semibold leading-snug">{c.title}</p>
        <button type="button" onClick={onClose} className="ml-auto rounded p-0.5 text-amber-800 hover:bg-amber-100" aria-label="Close">
          <X className="size-4" />
        </button>
      </div>
      {why ? (
        <p className="mt-1.5 pl-6 text-[13px] leading-snug">{c.why}</p>
      ) : (
        <div className="mt-1.5 flex gap-2 pl-6">
          <Button size="sm" variant="outline" className="h-7 border-amber-300 bg-white text-amber-900" onClick={() => (setWhy(true), onAsk())}>
            Why?
          </Button>
        </div>
      )}
    </section>
  );
}

/** Mrs Ada's latest line, with "next tip" and the voice toggle (always reachable, even far from her desk). */
export function AssistantStrip({ text, onNext, voice, onVoice, voiceOk, onClose }: { text: string; onNext: () => void; voice: boolean; onVoice: () => void; voiceOk: boolean; onClose: () => void }) {
  return (
    <section className="pointer-events-auto flex w-[min(340px,calc(100vw-1rem))] items-start gap-2 rounded-2xl border border-white/15 bg-white/95 p-2.5 text-slate-900 shadow-xl" aria-live="polite" aria-label={`${assistantProfile.name} says`}>
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-emerald-700 text-[13px] font-bold text-white" aria-hidden>
        A
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">{assistantProfile.name}</p>
        <p className="text-[12.5px] leading-snug">{text}</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <Button size="sm" variant="outline" className="h-7 px-2 text-[12px]" onClick={onNext}>
            <MessageCircle /> What next?
          </Button>
          {voiceOk && (
            <Button size="sm" variant="ghost" className="h-7 px-2 text-[12px]" onClick={onVoice} aria-pressed={voice} aria-label={voice ? 'Turn voice off' : 'Turn voice on'}>
              {voice ? <Volume2 /> : <VolumeX />} Voice {voice ? 'on' : 'off'}
            </Button>
          )}
        </div>
      </div>
      <button type="button" onClick={onClose} className="rounded p-0.5 text-slate-500 hover:bg-slate-100" aria-label="Hide">
        <X className="size-4" />
      </button>
    </section>
  );
}

/** Before hand-in: what is still missing (the same list the host uses), then hand in or keep working. */
export function HandInCheck({ missing, onHandIn, onBack }: { missing: string[]; onHandIn: () => void; onBack: () => void }) {
  return (
    <div className="space-y-3 text-[13.5px]">
      {missing.length ? (
        <>
          <p className="text-muted-foreground">Before you hand in, check:</p>
          <ul className="space-y-1.5">
            {missing.map((m) => (
              <li key={m} className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden /> {m}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="flex items-center gap-2 text-success">
          <Check className="size-4" aria-hidden /> Everything is recorded. It will be marked straight away.
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={onBack}>
          Keep working
        </Button>
        <Button variant={missing.length ? 'destructive' : 'brand'} onClick={onHandIn}>
          {missing.length ? 'Hand in anyway' : 'Hand in'}
        </Button>
      </div>
    </div>
  );
}

/** After marking: what went well, then each thing to improve with a "show me" that moves the camera there. */
export function Debrief({ criteria, onShow, onClose }: { criteria: CriterionScore[]; onShow: (c: CriterionScore) => void; onClose: () => void }) {
  const good = criteria.filter((c) => c.awarded >= c.max);
  const improve = criteria.filter((c) => c.awarded < c.max);
  const [i, setI] = useState(-1);
  const item = i >= 0 ? improve[i] : null;
  return (
    <section className="pointer-events-auto absolute inset-x-2 bottom-2 z-30 mx-auto max-w-md rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-2xl sm:bottom-4" aria-label="Debrief">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display text-[16px] font-semibold tracking-tight">{item ? `To improve · ${i + 1} of ${improve.length}` : 'How your lab went'}</h3>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
          <X />
        </Button>
      </div>
      {!item ? (
        <div className="mt-2 space-y-3 text-[13.5px]">
          {good.length > 0 && (
            <div>
              <p className="flex items-center gap-1.5 font-semibold text-success">
                <ThumbsUp className="size-4" aria-hidden /> What you did well
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-6 text-muted-foreground">
                {good.map((c) => (
                  <li key={c.id}>
                    {c.label} — full marks ({c.awarded}/{c.max})
                  </li>
                ))}
              </ul>
            </div>
          )}
          {improve.length > 0 ? (
            <p className="text-muted-foreground">
              {improve.length} thing{improve.length === 1 ? '' : 's'} to improve. Step through them — the camera shows you where it happened.
            </p>
          ) : (
            <p className="text-success">Full marks everywhere — excellent practical work.</p>
          )}
          {improve.length > 0 && (
            <Button
              variant="brand"
              onClick={() => {
                setI(0);
                onShow(improve[0]!);
              }}
            >
              Walk me through it
            </Button>
          )}
        </div>
      ) : (
        <div className="mt-2 space-y-2 text-[13.5px]">
          <p className="font-semibold">
            {item.label} <span className="font-normal text-muted-foreground">({item.awarded}/{item.max})</span>
          </p>
          <p className="text-muted-foreground">{item.note}</p>
          <div className="flex items-center gap-2 pt-1">
            <Button size="sm" variant="outline" onClick={() => onShow(item)}>
              <Eye /> Show me
            </Button>
            <div className="ml-auto flex gap-1.5">
              <Button size="icon-sm" variant="outline" disabled={i === 0} onClick={() => (setI(i - 1), onShow(improve[i - 1]!))} aria-label="Previous">
                <ChevronLeft />
              </Button>
              <Button size="icon-sm" variant="outline" onClick={() => (i + 1 < improve.length ? (setI(i + 1), onShow(improve[i + 1]!)) : setI(-1))} aria-label="Next">
                <ChevronRight />
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
