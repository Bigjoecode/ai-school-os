import { MICRO_FOCUS_TOL, MICRO_OBJECTIVES, microBrightness, type BioMicroscopeState } from '@aischool/shared';
import { ArrowLeft, Camera, Ruler } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { play } from '../../../lab3d-kit/sound';
import { type DragState } from '../../../lab3d-kit/store';
import type { Microscope } from '../actions';
import { FieldView } from '../field';
import { Slider } from '../index';
import { scopeActions } from './lab-actions';
import type { SceneState } from './scene-state';
import { useBench } from './spots';

/**
 * Looking down the eyepiece: the field of view the 2D lab draws (the same
 * component, so the same blur, light and contrast from the same maths), with
 * the microscope's controls beside it, the eyepiece graticule and the
 * diameter line, and Capture — the views the notebook labels and measures.
 */
export function EyepieceView({ m, s, scene, readOnly, onBack }: { m: Microscope; s: BioMicroscopeState; scene: SceneState; readOnly: boolean; onBack: () => void }) {
  const v = m.v;
  const graticule = useBench((b) => b.graticule);
  const pointer = useBench((b) => b.pointer);
  const set = useBench((b) => b.set);
  if (!v) return null;
  const sc = s.scope;
  const placed = s.prep.placed && scene.slide === 'stage';
  const dz = sc.coarse + sc.fine - v.focus[sc.objective];
  const inFocus = placed && Math.abs(dz) <= MICRO_FOCUS_TOL[sc.objective];
  const b = microBrightness(sc.lamp, sc.diaphragm, sc.objective);
  const act = scopeActions(m, s);
  const status = !placed ? (scene.slide === 'bin' ? 'Your slide is in the sharps jar' : 'No slide on the stage') : b < 0.08 ? 'Dark — is the lamp on?' : inFocus ? 'In focus' : Math.abs(dz) < 3 ? 'Nearly in focus' : 'Out of focus';
  return (
    <div className="pointer-events-auto absolute inset-0 z-[8] overflow-y-auto overscroll-contain bg-[radial-gradient(circle_at_center,#0b0f12_0%,#05070a_70%)] p-2 pt-[6.5rem] text-white sm:p-4 sm:pt-28" role="dialog" aria-label="Looking through the eyepiece">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-3 md:flex-row md:items-start md:justify-center">
        <div className="flex w-full max-w-[min(560px,62dvh)] flex-col items-center">
          <FieldView v={v} scope={sc} medium={s.prep.medium} coverslip={s.prep.coverslip} placed={placed} crashed={s.flags.crashed} graticule={graticule} pointer={pointer} label="Field of view" className="w-full drop-shadow-[0_0_40px_rgba(255,255,230,0.08)]" />
          <p className={cn('mt-1 text-center text-[12.5px]', inFocus ? 'text-emerald-300' : 'text-white/70')} aria-live="polite">
            ×{sc.objective} objective · ×{v.eyepiece * sc.objective} total · {status}
            {s.flags.crashed ? ' · cover slip cracked' : ''}
          </p>
        </div>
        <section className="w-full max-w-sm rounded-2xl bg-card p-3 text-card-foreground shadow-2xl" aria-label="Microscope controls">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="w-20 text-[12.5px] text-muted-foreground">Objective</span>
            {MICRO_OBJECTIVES.map((o) => (
              <Button key={o} size="sm" variant={sc.objective === o ? 'brand' : 'outline'} aria-pressed={sc.objective === o} disabled={readOnly} onClick={() => act.objective(o)}>
                ×{o}
              </Button>
            ))}
          </div>
          {!readOnly && (
            <div className="mt-2 space-y-1">
              <Slider label="Coarse focus" min={0} max={100} step={0.5} value={sc.coarse} onChange={(x) => m.setScope({ coarse: x }, 'coarse')} nudge={0.5} hint={sc.objective === 40 ? 'Not at high power!' : undefined} />
              <Slider label="Fine focus" min={-2} max={2} step={0.02} value={sc.fine} onChange={(x) => m.setScope({ fine: x }, 'fine')} nudge={0.02} />
              <Slider label="Diaphragm" min={0} max={100} step={1} value={sc.diaphragm} onChange={(x) => m.setScope({ diaphragm: x }, 'light')} nudge={5} suffix="% open" />
              <Slider label="Lamp" min={0} max={100} step={1} value={sc.lamp} onChange={(x) => m.setScope({ lamp: x }, 'light')} nudge={5} suffix="%" />
            </div>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Button size="sm" variant={graticule ? 'brand' : 'outline'} aria-pressed={graticule} onClick={() => set({ graticule: !graticule })}>
              <Ruler /> Graticule
            </Button>
            <Button size="sm" variant={pointer ? 'brand' : 'outline'} aria-pressed={pointer} onClick={() => set({ pointer: !pointer })}>
              Diameter line
            </Button>
            {!readOnly && (
              <Button
                size="sm"
                variant="brand"
                className="ml-auto"
                disabled={!placed}
                onClick={() => {
                  play('tick');
                  m.capture();
                }}
              >
                <Camera /> Capture ×{sc.objective}
              </Button>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[12px]">
            {s.captures.length === 0 && <span className="text-muted-foreground">No views captured yet.</span>}
            {s.captures.map((c) => {
              const d = Math.abs(c.coarse + c.fine - v.focus[c.objective]) <= MICRO_FOCUS_TOL[c.objective];
              return (
                <Badge key={c.objective} variant={d ? 'success' : 'warning'}>
                  ×{c.objective} captured{readOnly ? (d ? ' · sharp' : ' · blurred') : ''}
                </Badge>
              );
            })}
          </div>
          <p className="mt-2 text-[11.5px] text-muted-foreground">Keys: ↑ ↓ fine focus, Page Up / Down coarse, C capture, Esc back.</p>
          <Button className="mt-2 w-full" variant="outline" onClick={onBack}>
            <ArrowLeft /> Back to the bench
          </Button>
        </section>
      </div>
    </div>
  );
}

const PILL = 'absolute left-1/2 top-24 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1.5 text-[12.5px] font-medium text-white shadow-lg';
/** Feedback while turning a knob or moving the slide / a dropper (inside the kit's drag overlay). */
export function MicroDragFeedback({ drag, s }: { drag: DragState; s: BioMicroscopeState }) {
  const sc = s.scope;
  const text: Record<string, string> = {
    coarse: `Coarse focus ${sc.coarse.toFixed(1)} — drag up to raise the stage, down to lower it`,
    fine: `Fine focus ${sc.fine >= 0 ? '+' : ''}${sc.fine.toFixed(2)} — drag up or down`,
    diaphragm: `Diaphragm ${sc.diaphragm}% open — drag left to close, right to open`,
    lamp: `Lamp ${sc.lamp}% — drag up for brighter`,
    turret: `Nosepiece: ×${sc.objective} — drag sideways to turn`,
    slide: 'Drag the slide onto the microscope stage',
    drop: 'Drag the dropper over your slide and let go',
  };
  return text[drag.kind] ? <span className={PILL}>{text[drag.kind]}</span> : null;
}
