import { SONO_HANGER, SOUND_FORKS, type PhySoundState } from '@aischool/shared';
import { ArrowDown, ArrowUp, Camera, Eye, Hand, Minus, Music, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useLabView, type DragState } from '../../../lab3d-kit/store';
import { dockButton, dockClass } from '../../phy-common/lab3d/common';
import { meterLevel, useLive, type Sound } from '../actions';
import { LoudnessMeter } from '../index';
import { useBench } from './bench-store';
import type { Ops } from './lab-actions';
import { APPARATUS_LABEL, PLACE_LABEL, type SceneState } from './scene-state';

/** The resonance bench's HUD: the dock (set up, fork, length, loudness), the eye-level reading panel and the drag feedback. */

const B = ({ children, onClick, blocked, brand, label, className }: { children: React.ReactNode; onClick: () => void; blocked?: string; brand?: boolean; label?: string; className?: string }) => (
  <Button size="sm" variant={brand && !blocked ? 'brand' : 'outline'} className={cn(!(brand && !blocked) && dockButton, blocked && 'opacity-55', 'h-8 px-2 text-[12px]', className)} aria-disabled={!!blocked} title={blocked} aria-label={label} onClick={onClick}>
    {children}
  </Button>
);

/** What the rider and the sound are doing, in words (for students without sound). */
export function soundStatus(o: Sound, s: PhySoundState): string {
  const t = o.now();
  if (!o.ringing) return s.fork ? `${s.fork} Hz fork — not ringing` : 'No fork in hand';
  const lvl = meterLevel(o.level(t), t);
  const word = lvl > 0.75 ? 'very loud' : lvl > 0.45 ? 'loud' : lvl > 0.2 ? 'clear' : 'faint';
  if (s.task === 'SONO') return s.rider ? (o.riderDrive(t) > 0.3 ? `rider trembling · ${word}` : `ringing · ${word}`) : s.jump ? `rider thrown off at ${s.jump.len.toFixed(1)} cm` : `ringing · ${word}`;
  return `sound ${word}`;
}

function Lengths({ s, ops, compact }: { s: PhySoundState; ops: Ops; compact: boolean }) {
  return (
    <>
      <B onClick={() => ops.nudge(-1)} blocked={ops.why.len} label="Shorter by 1 cm">
        <Minus />1
      </B>
      <B onClick={() => ops.nudge(-0.1)} blocked={ops.why.len} label="Shorter by 0.1 cm">
        −0.1
      </B>
      <span className="min-w-[58px] text-center text-[12px] font-semibold tabular">{compact ? '' : 'l '}{s.len.toFixed(1)} cm</span>
      <B onClick={() => ops.nudge(0.1)} blocked={ops.why.len} label="Longer by 0.1 cm">
        +0.1
      </B>
      <B onClick={() => ops.nudge(1)} blocked={ops.why.len} label="Longer by 1 cm">
        <Plus />1
      </B>
    </>
  );
}

export function SoundDock({ o, s, scene, ops, compact }: { o: Sound; s: PhySoundState; scene: SceneState; ops: Ops; compact: boolean }) {
  const tab = useBench((b) => b.tab);
  const set = useBench((b) => b.set);
  useLive(o.ringing, 70);
  if (!scene.set)
    return (
      <div className={dockClass} aria-label="Set up">
        {scene.nextPlace && (
          <B brand onClick={ops.placeNext} blocked={ops.why.place}>
            {PLACE_LABEL[scene.nextPlace] ?? `Set out the ${APPARATUS_LABEL[scene.nextPlace].toLowerCase()}`}
          </B>
        )}
      </div>
    );
  const sono = s.task === 'SONO';
  const t = o.now();
  const lvl = o.ringing ? meterLevel(o.level(t), t) : 0;
  return (
    <div className={cn(dockClass, 'max-w-[min(620px,calc(100vw-1rem))] flex-col items-stretch gap-1.5')} aria-label={sono ? 'The sonometer' : 'The resonance tube'}>
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="flex overflow-hidden rounded-lg border border-white/20" role="tablist" aria-label="Dock">
          {(['fork', 'length'] as const).map((k) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => set({ tab: k })} className={cn('px-2.5 py-1 text-[12px] font-medium', tab === k ? 'bg-white text-slate-900' : 'bg-white/10 text-white hover:bg-white/20')}>
              {k === 'fork' ? (sono ? 'Load & fork' : 'Fork') : sono ? 'Bridge' : 'Air column'}
            </button>
          ))}
        </div>
        <LoudnessMeter level={lvl} dark />
        <span className="text-[11.5px] text-white/85" aria-live="polite">
          {soundStatus(o, s)}
        </span>
      </div>
      {tab === 'fork' ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {sono && (
            <>
              {s.load === 0 ? (
                <B brand onClick={ops.hangHanger} blocked={ops.why.hanger}>
                  Hang hanger
                </B>
              ) : (
                <>
                  <B onClick={ops.removeMass} blocked={ops.why.remove} label="Take 0.5 kg off">
                    <Minus /> {s.load === SONO_HANGER ? 'Hanger' : '0.5'}
                  </B>
                  <span className="text-[12px] font-semibold tabular">{s.load.toFixed(1)} kg</span>
                  <B onClick={ops.addMass} blocked={ops.why.add} label="Add 0.5 kg">
                    <Plus /> 0.5
                  </B>
                </>
              )}
              <B onClick={ops.placeRider} blocked={ops.why.rider}>
                Rider
              </B>
            </>
          )}
          <select
            className="h-8 rounded-md border border-white/20 bg-white/10 px-1.5 text-[12px] text-white"
            value={s.fork ?? ''}
            onChange={(e) => ops.pickFork(Number(e.target.value))}
            aria-label="Tuning fork"
          >
            <option value="" disabled className="text-slate-900">
              Fork…
            </option>
            {SOUND_FORKS.map((f) => (
              <option key={f} value={f} className="text-slate-900">
                {f} Hz
              </option>
            ))}
          </select>
          <B brand onClick={() => ops.strike('pad')} blocked={ops.why.strike}>
            <Music /> {compact ? 'Strike' : sono ? 'Strike, press on box' : 'Strike on pad'}
          </B>
          <B onClick={ops.damp} blocked={o.struck ? undefined : 'It is not ringing.'} label="Stop it ringing">
            <Hand />
          </B>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          <Lengths s={s} ops={ops} compact={compact} />
          {!sono && (
            <B onClick={ops.read} blocked={ops.why.read} label="Read at eye level">
              <Eye /> {compact ? '' : 'Read'}
            </B>
          )}
          <B brand onClick={ops.take} blocked={ops.why.take}>
            <Camera /> {compact ? 'Take' : 'Take length'} ({s.readings.length})
          </B>
          <B onClick={() => ops.strike('pad')} blocked={ops.why.strike} label="Strike the fork again">
            <Music />
          </B>
        </div>
      )}
    </div>
  );
}

/** Eye-level reading of the water surface on the tube's rule. */
export function SoundReadingPanel({ o, s, ops, onBack }: { o: Sound; s: PhySoundState; ops: Ops; onBack: () => void }) {
  const eye = useLabView((v) => v.eye);
  const set = useLabView((v) => v.set);
  useLive(o.ringing, 90);
  const level = Math.abs(eye) < 0.003 ? 'level' : eye > 0 ? 'above' : 'below';
  const nudgeEye = (d: number) => set({ eye: Math.max(-0.05, Math.min(0.05, eye + d)) });
  const t = o.now();
  return (
    <section className="pointer-events-auto absolute inset-x-2 bottom-2 z-20 mx-auto max-w-md rounded-2xl border border-border bg-card/97 p-3 text-card-foreground shadow-2xl backdrop-blur sm:bottom-4" aria-label="Reading the length of the air column">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 font-display text-[15px] font-semibold tracking-tight">
          <Eye className="size-4 text-muted-foreground" aria-hidden /> Read l at the water
        </p>
        <span className={cn('rounded-full px-2 py-0.5 text-[11.5px] font-medium', level === 'level' ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning')} aria-live="polite">
          {level === 'level' ? 'Eye level with the water' : `Eye ${level} the water`}
        </span>
      </div>
      <p className="mt-1 text-[12.5px] leading-snug text-muted-foreground">Read the rule (0 at the top of the tube) where the water surface is, to 0.1 cm, with your eye level with it.</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button size="icon-sm" variant="outline" onClick={() => nudgeEye(0.002)} aria-label="Raise your eye">
          <ArrowUp />
        </Button>
        <Button size="icon-sm" variant="outline" onClick={() => nudgeEye(-0.002)} aria-label="Lower your eye">
          <ArrowDown />
        </Button>
        <LoudnessMeter level={o.ringing ? meterLevel(o.level(t), t) : 0} />
        <Button size="sm" variant="brand" onClick={ops.take}>
          <Camera /> Take this length
        </Button>
        <Button size="sm" variant="outline" className="ml-auto" onClick={onBack}>
          Back to bench
        </Button>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">{s.fork ? `${s.fork} Hz fork` : 'No fork'} · {soundStatus(o, s)}</p>
    </section>
  );
}

export function SoundDragFeedback({ drag, s }: { drag: DragState; s: PhySoundState }) {
  if (drag.kind !== 'tube' && drag.kind !== 'bridge') return null;
  return (
    <span className="absolute left-1/2 top-24 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1.5 text-[12.5px] font-medium text-white shadow-lg">
      {drag.kind === 'tube' ? `Air column ${s.len.toFixed(1)} cm — drag up to lengthen` : `Bridges ${s.len.toFixed(1)} cm apart`}
    </span>
  );
}
