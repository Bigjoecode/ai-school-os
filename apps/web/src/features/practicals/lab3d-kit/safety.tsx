import { Check, ShieldAlert, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { play } from './sound';

/**
 * The safety briefing at the lab door: quick cards, then a mini check (the
 * lab's own content: SafetyContent; CHEM_SAFETY in safety-content.tsx for
 * chemistry). A wrong answer explains why and lets the student try again.
 * Lines from the practical's own lesson are used where they fit.
 */

export type Hazard = 'flame' | 'corrosive' | 'toxic' | 'harmful';
export function HazardIcon({ kind }: { kind: Hazard }) {
  return (
    <svg viewBox="0 0 100 100" className="size-full" aria-hidden>
      <rect x="16" y="16" width="68" height="68" transform="rotate(45 50 50)" fill="#fff" stroke="#d4202a" strokeWidth="7" />
      {kind === 'flame' && <path d="M50 28 C64 44 62 52 60 62 L40 62 C38 52 36 44 50 28 Z M36 66 H64 V70 H36 Z" fill="#111" />}
      {kind === 'corrosive' && (
        <g fill="#111">
          <path d="M33 34 h12 l-6 14 z" />
          <path d="M55 36 h10 l-5 12 z" />
          <rect x="30" y="58" width="22" height="6" />
          <rect x="54" y="60" width="18" height="10" rx="2" />
        </g>
      )}
      {kind === 'toxic' && (
        <g fill="#111">
          <circle cx="50" cy="45" r="13" />
          <rect x="43" y="52" width="14" height="8" />
          <path d="M32 62 L68 74 M68 62 L32 74" stroke="#111" strokeWidth="5" />
        </g>
      )}
      {kind === 'harmful' && (
        <g fill="#111">
          <rect x="46" y="30" width="8" height="26" />
          <circle cx="50" cy="65" r="5" />
        </g>
      )}
    </svg>
  );
}

export interface SafetyCard {
  icon: ReactNode;
  title: string;
  lines: string[];
  /** The practical lesson's safety lines that match are added to this card (the first one). */
  lessonMatch?: RegExp;
}
export interface SafetyQuestion {
  q: string;
  options: { label: ReactNode; aria: string; right: boolean; why: string }[];
  /** Options laid out as a 4-up grid of pictures (e.g. hazard symbols). */
  grid?: boolean;
}
export interface SafetyContent {
  cards: SafetyCard[];
  questions: SafetyQuestion[];
}

const words = (l: string) => new Set((l.toLowerCase().match(/[a-z]{4,}/g) ?? []).map((w) => w.replace(/s$/, '')));
/** A lesson line that says what a briefing card already says (most of its words are on one card line), e.g. "Wear safety goggles throughout." beside "Wear your safety goggles over your eyes the whole time.". */
export function repeatsCard(line: string, cards: SafetyCard[]): boolean {
  const mine = [...words(line)];
  if (!mine.length) return false;
  return cards.some((c) => c.lines.some((cl) => {
    const theirs = words(cl);
    return mine.filter((w) => theirs.has(w)).length / mine.length >= 0.5;
  }));
}

export function SafetyBriefing({ content, lessonSafety, onDone, onSkip }: { content: SafetyContent; lessonSafety: string[]; onDone: () => void; onSkip: () => void }) {
  const { cards: CARDS, questions: QUESTIONS } = content;
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const card = step < CARDS.length ? CARDS[step]! : null;
  const question = step >= CARDS.length ? QUESTIONS[step - CARDS.length]! : null;
  const extra = card?.lessonMatch ? lessonSafety.filter((l) => card.lessonMatch!.test(l) && !repeatsCard(l, CARDS)).slice(0, 1) : [];
  const total = CARDS.length + QUESTIONS.length;
  const answer = question && picked !== null ? question.options[picked]! : null;

  const next = () => {
    setPicked(null);
    if (step + 1 >= total) {
      play('success');
      onDone();
    } else setStep(step + 1);
  };

  return (
    <div className="absolute inset-0 z-40 grid place-items-center bg-black/50 p-3 backdrop-blur-[2px]">
      <section className="w-full max-w-md rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-2xl sm:p-5" role="dialog" aria-label="Safety briefing">
        <div className="flex items-center gap-2">
          <ShieldAlert className="size-5 text-warning" aria-hidden />
          <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Safety briefing · {step + 1} of {total}</p>
          <button type="button" className="ml-auto text-[12px] text-muted-foreground underline" onClick={onSkip}>
            Skip
          </button>
        </div>
        {card && (
          <div className="mt-3">
            <div className="flex items-center gap-2">
              <span className="grid size-10 place-items-center rounded-xl bg-warning-soft text-warning">{card.icon}</span>
              <h3 className="font-display text-[17px] font-semibold tracking-tight">{card.title}</h3>
            </div>
            <ul className="mt-3 space-y-1.5 text-[14px]">
              {[...card.lines, ...extra].map((l) => (
                <li key={l} className="flex gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> {l}
                </li>
              ))}
            </ul>
            <div className="mt-4 flex justify-end">
              <Button variant="brand" size="sm" onClick={next}>
                {step === CARDS.length - 1 ? 'Quick check' : 'Next'}
              </Button>
            </div>
          </div>
        )}
        {question && (
          <div className="mt-3">
            <h3 className="font-display text-[16px] font-semibold tracking-tight">{question.q}</h3>
            <div className={cn('mt-3', question.grid ? 'grid grid-cols-4 gap-2' : 'grid gap-2')}>
              {question.options.map((o, k) => (
                <button
                  key={o.aria}
                  type="button"
                  aria-label={o.aria}
                  onClick={() => {
                    setPicked(k);
                    play(o.right ? 'success' : 'oops');
                  }}
                  className={cn(
                    'rounded-xl border p-2 text-left text-[13.5px] transition-colors hover:bg-muted',
                    question.grid && 'aspect-square p-1.5',
                    picked === k && (o.right ? 'border-success bg-success-soft' : 'border-danger bg-danger-soft'),
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
            {answer && (
              <p className={cn('mt-3 flex items-start gap-1.5 rounded-lg px-3 py-2 text-[13px]', answer.right ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger')} role="status">
                {answer.right ? <Check className="mt-0.5 size-4 shrink-0" aria-hidden /> : <X className="mt-0.5 size-4 shrink-0" aria-hidden />} {answer.why}
              </p>
            )}
            <div className="mt-4 flex justify-end">
              <Button variant="brand" size="sm" disabled={!answer?.right} onClick={next}>
                {step + 1 >= total ? 'Enter the lab' : 'Next'}
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
