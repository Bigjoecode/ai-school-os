import { Check, ChevronRight, FlaskConical, GraduationCap, MessageCircleQuestion, PlayCircle, Shapes } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { assistantProfile } from './assistant-profile';

/**
 * The practical as a journey: Learn → Watch the demo → Try (plus the
 * unmarked sandbox), with "Ask Mrs Ada" alongside. Progress is remembered per
 * device; every stage can be opened at any time. Practice mode only.
 */

export type Stage = 'learn' | 'demo' | 'try' | 'sandbox';

function Chip({ active, done, icon, label, onClick }: { active: boolean; done?: boolean; icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'step' : undefined}
      className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium transition-colors', active ? 'bg-white text-slate-900' : 'bg-black/45 text-white hover:bg-black/60')}
    >
      {done ? <Check className={cn('size-3.5', active ? 'text-emerald-600' : 'text-emerald-300')} aria-label="done" /> : icon}
      {label}
    </button>
  );
}

export function JourneyBar({ stage, learned, demoed, onStage, onAsk, asking, sandbox = true }: { stage: Stage; learned: boolean; demoed: boolean; onStage: (s: Stage) => void; onAsk?: () => void; asking: boolean; sandbox?: boolean }) {
  const sep = <ChevronRight className="size-3.5 shrink-0 text-white/50" aria-hidden />;
  return (
    <nav className="pointer-events-auto mx-auto flex max-w-full items-center gap-1 overflow-x-auto rounded-full bg-black/35 p-1 backdrop-blur [scrollbar-width:none]" aria-label="Practical journey">
      <Chip active={stage === 'learn'} done={learned} icon={<GraduationCap className="size-3.5" aria-hidden />} label="Learn" onClick={() => onStage('learn')} />
      {sep}
      <Chip active={stage === 'demo'} done={demoed} icon={<PlayCircle className="size-3.5" aria-hidden />} label="Demo" onClick={() => onStage('demo')} />
      {sep}
      <Chip active={stage === 'try'} icon={<FlaskConical className="size-3.5" aria-hidden />} label="Try" onClick={() => onStage('try')} />
      {sandbox && <Chip active={stage === 'sandbox'} icon={<Shapes className="size-3.5" aria-hidden />} label="Sandbox" onClick={() => onStage('sandbox')} />}
      {onAsk && (
        <button
          type="button"
          onClick={onAsk}
          aria-pressed={asking}
          className={cn('ml-1 inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold', asking ? 'bg-emerald-300 text-emerald-950' : 'bg-emerald-600 text-white hover:bg-emerald-500')}
        >
          <MessageCircleQuestion className="size-3.5" aria-hidden /> <span className="hidden sm:inline">Ask {assistantProfile.name}</span>
          <span className="sm:hidden">Ask</span>
        </button>
      )}
    </nav>
  );
}
