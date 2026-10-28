import type { PhyMomentsState } from '@aischool/shared';
import { ArrowDown, ArrowUp, Camera, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Eye, Hand, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useLabView, type DragState } from '../../../lab3d-kit/store';
import { dockButton, dockClass } from '../../phy-common/lab3d/common';
import { KNOWN_NAME, type LoopId } from '../actions';
import { useBench } from './bench-store';
import type { Ops } from './lab-actions';
import { APPARATUS_LABEL, PLACE_LABEL, type SceneState } from './scene-state';

/** The knife edge's HUD: the dock (what to do next), the eye-level reading panel and the drag feedback. */

const B = ({ children, onClick, blocked, brand, label }: { children: React.ReactNode; onClick: () => void; blocked?: string; brand?: boolean; label?: string }) => (
  <Button size="sm" variant={brand && !blocked ? 'brand' : 'outline'} className={cn(!brand && dockButton, blocked && 'opacity-55')} aria-disabled={!!blocked} title={blocked} aria-label={label} onClick={onClick}>
    {children}
  </Button>
);
const I = ({ children, onClick, label }: { children: React.ReactNode; onClick: () => void; label: string }) => (
  <Button size="icon-sm" variant="outline" className={dockButton} onClick={onClick} aria-label={label}>
    {children}
  </Button>
);
/** Four nudges (1 cm, 1 mm each way). `d` is called with the change of the thing's mark on the rule. */
function Slide({ name, label, d }: { name: string; label: string; d: (x: number) => void }) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label={label}>
      <span className="text-[12px] text-white/80">{name}</span>
      <I onClick={() => d(-1)} label={`${label}: 1 cm left`}>
        <ChevronsLeft />
      </I>
      <I onClick={() => d(-0.1)} label={`${label}: 1 mm left`}>
        <ChevronLeft />
      </I>
      <I onClick={() => d(0.1)} label={`${label}: 1 mm right`}>
        <ChevronRight />
      </I>
      <I onClick={() => d(1)} label={`${label}: 1 cm right`}>
        <ChevronsRight />
      </I>
    </div>
  );
}

export function MomentsDock({ s, scene, ops, compact }: { s: PhyMomentsState; scene: SceneState; ops: Ops; compact: boolean }) {
  const task = s.task ?? 'MOMENTS';
  if (!scene.set)
    return (
      <div className={dockClass} aria-label="Set up the balance">
        {scene.nextPlace && (
          <B brand onClick={ops.placeNext} blocked={ops.why.place}>
            {PLACE_LABEL[scene.nextPlace] ?? `Set out the ${APPARATUS_LABEL[scene.nextPlace].toLowerCase()}`}
          </B>
        )}
      </div>
    );
  const loops: LoopId[] = task === 'MOMENTS' ? ['known', 'other'] : ['known'];
  const at = (id: LoopId) => (id === 'known' ? s.known : s.other);
  const nothingHung = s.known === null && s.other === null;
  return (
    <div className={cn(dockClass, 'max-w-[min(640px,calc(100vw-1rem))]')} aria-label="The balance">
      {/* moving the rule right moves the edge's mark on it down */}
      <Slide name={compact ? 'Rule' : 'Slide the rule'} label="Slide the rule over the knife edge" d={(x) => ops.movePivot(-x)} />
      <B onClick={ops.release} brand={false} label="Steady the rule and let go">
        <Hand /> {compact ? 'Let go' : 'Steady it and let go'}
      </B>
      {nothingHung && (
        <B brand={s.g === null} onClick={ops.recordG} blocked={ops.why.g}>
          <MapPin /> {compact ? 'Record G' : 'Record the balance point G'}
        </B>
      )}
      {loops.map((id) =>
        at(id) === null ? (
          <B key={id} onClick={() => ops.hang(id)} blocked={id === 'other' ? (ops.why.other ?? ops.why.hang) : ops.why.hang} brand={s.g !== null && (id === 'known' || s.known !== null)}>
            Hang the {id === 'known' ? KNOWN_NAME[task] : 'mass M'}
          </B>
        ) : (
          <Slide key={id} name={id === 'known' ? (task === 'MASS' ? '100 g' : '50 g') : 'M'} label={`Slide the ${id === 'known' ? KNOWN_NAME[task] : 'unknown mass'}’s loop`} d={(x) => ops.moveLoop(id, x)} />
        ),
      )}
      <B onClick={() => ops.read('edge')} blocked={ops.why.bench}>
        <Eye /> {compact ? 'Read' : 'Read the rule'}
      </B>
      {!nothingHung && (
        <B brand={s.g !== null} onClick={ops.take} blocked={ops.why.take}>
          <Camera /> {compact ? 'Take' : 'Take this reading'} ({s.readings.length})
        </B>
      )}
    </div>
  );
}

/** Eye-level reading of a mark on the rule: which mark, and the eye up or down. */
export function MomentsReadingPanel({ s, onBack }: { s: PhyMomentsState; onBack: () => void }) {
  const eye = useLabView((v) => v.eye);
  const set = useLabView((v) => v.set);
  const readAt = useBench((b) => b.readAt);
  const task = s.task ?? 'MOMENTS';
  const nudge = (d: number) => set({ eye: Math.max(-0.05, Math.min(0.05, eye + d)) });
  const tabs: { id: 'edge' | 'known' | 'other'; label: string }[] = [
    { id: 'edge', label: 'Knife edge' },
    ...(s.known !== null ? [{ id: 'known' as const, label: task === 'MASS' ? '100 g loop' : '50 g loop' }] : []),
    ...(task === 'MOMENTS' && s.other !== null ? [{ id: 'other' as const, label: 'M’s loop' }] : []),
  ];
  return (
    <section className="pointer-events-auto absolute inset-x-2 bottom-2 z-20 mx-auto max-w-md rounded-2xl border border-border bg-card/97 p-3 text-card-foreground shadow-2xl backdrop-blur sm:bottom-4" aria-label="Reading the metre rule">
      <p className="flex items-center gap-1.5 font-display text-[15px] font-semibold tracking-tight">
        <Eye className="size-4 text-muted-foreground" aria-hidden /> Read the metre rule
      </p>
      <p className="mt-1 text-[12.5px] leading-snug text-muted-foreground">
        Read {readAt === 'edge' ? 'the mark directly over the knife edge' : 'the centre line of the thread loop'} against the scale to 0.1 cm, with your eye straight in front of it (raise or lower your eye: no parallax). {task === 'MASS' ? 'd₁ = P − x, d₂ = G − P.' : 'Distances are measured from G, where the knife edge is.'}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-border p-0.5" role="tablist" aria-label="Which mark">
          {tabs.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={readAt === t.id} onClick={() => useBench.setState({ readAt: t.id })} className={cn('rounded-md px-2 py-1 text-[12px]', readAt === t.id ? 'bg-foreground text-background' : 'text-muted-foreground')}>
              {t.label}
            </button>
          ))}
        </div>
        <Button size="icon-sm" variant="outline" onClick={() => nudge(0.004)} aria-label="Raise your eye">
          <ArrowUp />
        </Button>
        <Button size="icon-sm" variant="outline" onClick={() => nudge(-0.004)} aria-label="Lower your eye">
          <ArrowDown />
        </Button>
        <Button size="sm" variant="outline" className="ml-auto" onClick={onBack}>
          Back to bench
        </Button>
      </div>
    </section>
  );
}

/** Feedback while sliding the rule or a thread loop. */
export function MomentsDragFeedback({ drag }: { drag: DragState }) {
  if (drag.kind !== 'slide-rule' && drag.kind !== 'slide-known' && drag.kind !== 'slide-other') return null;
  return (
    <span className="absolute left-1/2 top-24 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1.5 text-[12.5px] font-medium text-white shadow-lg">
      {drag.kind === 'slide-rule' ? 'Sliding the rule over the knife edge — let go and watch whether it stays level' : 'Sliding the thread loop — let go and watch the rule'}
    </span>
  );
}
