import { Check, Glasses, Hand, ShieldAlert, Utensils, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { play } from './sound';

/**
 * The safety briefing at the lab door: three quick cards, then a mini check
 * (pick the corrosive symbol, what to do after a spill, how to fill a
 * pipette). A wrong answer explains why and lets the student try again.
 * Lines from the practical's own lesson are used where they fit.
 */

type Hazard = 'flame' | 'corrosive' | 'toxic' | 'harmful';
function HazardIcon({ kind }: { kind: Hazard }) {
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

const CARDS: { icon: ReactNode; title: string; lines: string[] }[] = [
  { icon: <Glasses className="size-6" />, title: 'Protect yourself', lines: ['Wear your safety goggles over your eyes the whole time.', 'Wear your lab coat, buttoned. Tie back long hair.'] },
  { icon: <Utensils className="size-6" />, title: 'Behave safely', lines: ['No eating or drinking in the lab.', 'Report every spill and every breakage to the teacher at once.', 'Wash your hands before you leave.'] },
  { icon: <Hand className="size-6" />, title: 'Pipettes and spills', lines: ['Never pipette by mouth: always use the pipette filler.', 'Acid or alkali on your skin: rinse with plenty of water and tell the teacher.'] },
];

interface Question {
  q: string;
  options: { label: ReactNode; aria: string; right: boolean; why: string }[];
  grid?: boolean;
}
const QUESTIONS: Question[] = [
  {
    q: 'Tap the symbol that means CORROSIVE (acids and alkalis carry it).',
    grid: true,
    options: (['flame', 'corrosive', 'toxic', 'harmful'] as Hazard[]).map((k) => ({
      label: <HazardIcon kind={k} />,
      aria: k,
      right: k === 'corrosive',
      why: k === 'corrosive' ? 'Right: liquid eating into a surface and a hand.' : k === 'flame' ? 'That is the flame: flammable. Corrosive shows liquid eating into a surface and a hand.' : k === 'toxic' ? 'That is the skull: toxic. Corrosive shows liquid eating into a surface and a hand.' : 'That is the exclamation mark: harmful or irritant. Corrosive shows liquid eating into a surface and a hand.',
    })),
  },
  {
    q: 'A little acid splashes onto your hand. What do you do first?',
    options: [
      { label: 'Wipe it on my lab coat and carry on', aria: 'wipe', right: false, why: 'The acid keeps burning your skin and soaks into the coat.' },
      { label: 'Rinse with plenty of running water, then tell the teacher', aria: 'rinse', right: true, why: 'Right: water dilutes and washes the acid away quickly.' },
      { label: 'Add some alkali to neutralise it', aria: 'alkali', right: false, why: 'Never: alkalis burn too, and the reaction gives out heat.' },
    ],
  },
  {
    q: 'How do you draw 25.0 cm³ of B into the pipette?',
    options: [
      { label: 'Suck it up gently by mouth', aria: 'mouth', right: false, why: 'Never pipette by mouth — B is corrosive.' },
      { label: 'Use the pipette filler', aria: 'filler', right: true, why: 'Right: the filler draws the liquid up safely.' },
    ],
  },
];

export function SafetyBriefing({ lessonSafety, onDone, onSkip }: { lessonSafety: string[]; onDone: () => void; onSkip: () => void }) {
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const card = step < CARDS.length ? CARDS[step]! : null;
  const question = step >= CARDS.length ? QUESTIONS[step - CARDS.length]! : null;
  const extra = step === 2 ? lessonSafety.filter((l) => /pipette|spill|skin|goggles/i.test(l)).slice(0, 1) : [];
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
