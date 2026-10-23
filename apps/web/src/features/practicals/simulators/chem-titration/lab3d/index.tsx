import { Canvas } from '@react-three/fiber';
import { ClipboardList, Clock, HelpCircle, Lightbulb, Maximize2, Menu, Minimize2, MonitorSmartphone, NotebookPen, Send } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { clock, useCountdown } from '../../../../learning/components';
import type { SimulatorProps } from '../../types';
import { gpuTier, isTouchDevice } from '../../webgl';
import { useTitration } from '../actions';
import { Notebook, TaskBrief } from '../notebook';
import { Joystick } from './controls';
import { ContextMenu, CupboardList, HelpContent, ModeBar, Notice, Panel, ReadingPanel, TitrationDock } from './hud';
import { nextHint3d, objectPanel, swirl } from './lab-actions';
import { LabScene } from './scene';
import { sceneFromState } from './scene-state';
import { useLabView, type Quality } from './store';

/**
 * The 3D chemistry laboratory: the same titration as the 2D lab (same state,
 * same actions, same marks) in a walk-in, procedurally built school lab. The
 * student puts on a coat and goggles, collects apparatus from the cupboard,
 * sets up and carries out the titration at their bench, reads the burette at
 * eye level and records everything in the notebook on the bench.
 */

type Sheet = 'notebook' | 'task' | 'cupboard' | 'help' | 'menu' | null;
const DPR: Record<Quality, [number, number]> = { low: [1, 1], medium: [1, 1.5], high: [1, 2] };

export default function ChemTitrationLab3D(props: SimulatorProps<'chem-titration'>) {
  const { seed, mode, state, onChange, readOnly, startedAt, endsAt, onHandIn, onUse2d } = props;
  const t = useTitration({ seed, state, onChange, readOnly, startedAt });
  const scene = useMemo(() => sceneFromState(state), [state]);
  const touch = useMemo(isTouchDevice, []);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [intro, setIntro] = useState(true);
  const [immersive, setImmersive] = useState(false);
  const [slow, setSlow] = useState(false);
  const [lost, setLost] = useState(false);
  const camMode = useLabView((v) => v.mode);
  const selected = useLabView((v) => v.selected);
  const quality = useLabView((v) => v.quality);
  const set = useLabView((v) => v.set);
  // The object panels read these: re-render when they change.
  useLabView((v) => v.pip);
  useLabView((v) => v.held);
  const left = useCountdown(endsAt ?? null);

  // A fresh view for every visit; the quality tier from the device.
  useEffect(() => {
    const tier = gpuTier();
    useLabView.setState({ mode: 'walk', focus: 'bench', hover: null, selected: null, held: null, pip: 'idle', streaming: false, eye: 0.03, quality: tier === 'high' ? 'high' : tier === 'medium' ? 'medium' : 'low' });
    // Development only: lets an automated browser check drive the view.
    if (import.meta.env.DEV) (window as Window & { __lab3d?: typeof useLabView }).__lab3d = useLabView;
    return () => {
      document.body.style.cursor = '';
    };
  }, []);
  // Full screen: no page scroll behind the lab.
  useEffect(() => {
    if (!immersive) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [immersive]);
  // The tap closes itself when acid can no longer run (flask moved, burette empty, run finished).
  const canRun = t.canDeliver && scene.flaskUnder;
  useEffect(() => {
    if (!canRun && useLabView.getState().streaming) {
      t.stopStream();
      useLabView.getState().set({ streaming: false });
    }
  }, [canRun, t]);

  if (import.meta.env.DEV) (window as Window & { __lab3dState?: unknown }).__lab3dState = state;
  const canRead = scene.clamped && state.burette !== null;
  const goRead = () => {
    if (!canRead) return;
    set({ mode: 'read', selected: null });
    setSheet(null);
  };
  const ctx = { t, s: state, scene, open: (w: 'notebook' | 'task' | 'cupboard') => (set({ selected: null }), setSheet(w)) };
  const panel = selected ? objectPanel(selected, ctx) : null;

  // Keyboard shortcuts.
  useEffect(() => {
    const typing = (el: EventTarget | null) => el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
    const down = (e: KeyboardEvent) => {
      if (typing(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      const v = useLabView.getState();
      const k = e.key.toLowerCase();
      if (k === 'escape') {
        if (sheet) setSheet(null);
        else if (v.selected) v.set({ selected: null });
        else if (v.mode === 'read') v.set({ mode: 'bench' });
        else setSheet('menu');
      } else if (k === 'b' && v.mode === 'walk') v.set({ mode: 'bench', focus: 'bench' });
      else if (k === 'r') goRead();
      else if (k === 'n') setSheet((x) => (x === 'notebook' ? null : 'notebook'));
      else if (k === 't') setSheet((x) => (x === 'task' ? null : 'task'));
      else if (k === 'h' || k === '?') setSheet((x) => (x === 'help' ? null : 'help'));
      else if (v.mode !== 'walk' && k === ' ' && !e.repeat && canRun) {
        e.preventDefault();
        v.set({ streaming: true });
        t.startStream();
      } else if (v.mode !== 'walk' && k === 'd' && canRun) {
        t.deliver(0.05, false);
        v.set({ dropAt: performance.now() });
      } else if (v.mode !== 'walk' && k === 'f' && t.open) swirl(t);
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === ' ' && useLabView.getState().streaming) {
        useLabView.getState().set({ streaming: false });
        t.stopStream();
      }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  });

  const hint = mode === 'LAB' ? nextHint3d(state, scene, t) : null;
  const lowTime = left != null && left < 5 * 60_000;
  const glass = 'border-white/20 bg-black/45 text-white backdrop-blur hover:bg-black/60 hover:text-white';

  return (
    <div className={cn('relative isolate overflow-hidden bg-[#1b2328] text-white', immersive ? 'fixed inset-0 z-50' : 'h-[min(70dvh,780px)] min-h-[400px] rounded-2xl border border-border sm:h-[min(78dvh,780px)] sm:min-h-[480px]')}>
      {!lost && (
        <Canvas
          dpr={DPR[quality]}
          gl={{ antialias: quality !== 'low', powerPreference: 'high-performance', alpha: false }}
          camera={{ fov: 62, near: 0.03, far: 40, position: [5.1, 1.58, 4.2] }}
          onCreated={({ gl }) => gl.domElement.addEventListener('webglcontextlost', () => setLost(true))}
          onPointerMissed={() => set({ selected: null })}
          className="touch-none"
          aria-label="3D chemistry laboratory"
        >
          <LabScene state={state} scene={scene} t={t} v={t.v} onSlow={() => setSlow(true)} />
        </Canvas>
      )}
      {lost && (
        <div className="absolute inset-0 grid place-items-center p-6 text-center">
          <div className="max-w-sm space-y-3">
            <p className="font-display text-lg font-semibold">The 3D view stopped</p>
            <p className="text-[13.5px] text-white/75">Your device ran out of graphics memory. Your work is saved.</p>
            <div className="flex justify-center gap-2">
              <Button variant="brand" onClick={() => setLost(false)}>
                Try again
              </Button>
              {onUse2d && (
                <Button variant="outline" className={glass} onClick={onUse2d}>
                  Use the 2D lab
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col gap-1.5 p-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:p-3">
        <div className="flex items-center gap-1.5">
          <Button size="icon-sm" variant="outline" className={cn('pointer-events-auto', glass)} onClick={() => setSheet('menu')} aria-label="Menu">
            <Menu />
          </Button>
          <div className="min-w-0 truncate whitespace-nowrap rounded-full bg-black/45 px-3 py-1 text-[12.5px] backdrop-blur">
            <span className="font-semibold">Chemistry lab</span>
            <span className="hidden text-white/70 sm:inline"> · {camMode === 'walk' ? 'walking' : camMode === 'bench' ? 'at your bench' : 'reading the burette'}</span>
          </div>
          {left != null && (
            <span className={cn('inline-flex items-center gap-1 rounded-full bg-black/55 px-2.5 py-1 font-display text-[14px] font-semibold tabular backdrop-blur', lowTime && 'bg-danger text-white')} aria-label="Time left">
              <Clock className="size-3.5" aria-hidden /> {clock(left)}
            </span>
          )}
          <div className="pointer-events-auto ml-auto flex gap-1.5">
            <Button size="sm" variant="outline" className={glass} onClick={() => setSheet(sheet === 'task' ? null : 'task')} aria-label="Task card">
              <ClipboardList /> <span className="hidden md:inline">Task</span>
            </Button>
            <Button size="sm" variant="outline" className={glass} onClick={() => setSheet(sheet === 'notebook' ? null : 'notebook')} aria-label="Notebook">
              <NotebookPen /> <span className="hidden md:inline">Notebook</span>
            </Button>
            <Button size="icon-sm" variant="outline" className={glass} onClick={() => setSheet(sheet === 'help' ? null : 'help')} aria-label="Help and controls">
              <HelpCircle />
            </Button>
            <Button size="icon-sm" variant="outline" className={glass} onClick={() => setImmersive((x) => !x)} aria-label={immersive ? 'Exit full screen' : 'Full screen'}>
              {immersive ? <Minimize2 /> : <Maximize2 />}
            </Button>
          </div>
        </div>
        {hint && !intro && (
          <p className="mx-auto flex max-w-xl items-start gap-1.5 rounded-xl bg-black/55 px-3 py-1.5 text-[12.5px] leading-snug backdrop-blur">
            <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-amber-300" aria-hidden /> {hint}
          </p>
        )}
        <Notice />
        {slow && (
          <p className="pointer-events-auto mx-auto flex items-center gap-2 rounded-xl bg-amber-500/90 px-3 py-1.5 text-[12.5px] text-black">
            Running slowly on this device.
            {onUse2d && (
              <button type="button" className="font-semibold underline" onClick={onUse2d}>
                Switch to the 2D lab
              </button>
            )}
          </p>
        )}
      </div>

      {/* bottom: joystick, mode buttons, tap controls */}
      {!intro && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-end justify-between gap-2 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:p-3">
          <div className="pointer-events-auto">{touch && camMode === 'walk' && !panel && <Joystick />}</div>
          {!panel && camMode !== 'read' && (
            <div className="pointer-events-auto flex max-w-[78%] flex-col items-end gap-1.5">
              {camMode === 'bench' && scene.clamped && <TitrationDock t={t} scene={scene} s={state} compact={touch} />}
              <ModeBar canRead={canRead} onRead={goRead} />
            </div>
          )}
        </div>
      )}
      {camMode === 'read' && !sheet && <ReadingPanel t={t} s={state} onBack={() => set({ mode: 'bench', focus: 'burette' })} />}
      {panel && !sheet && camMode !== 'read' && <ContextMenu panel={panel} onClose={() => set({ selected: null })} />}
      {sheet === 'notebook' && (
        <Panel title="Practical notebook" onClose={() => setSheet(null)}>
          <Notebook v={t.v} state={state} readOnly={readOnly} update={t.update} book className="border-0 p-0 shadow-none sm:p-0" />
        </Panel>
      )}
      {sheet === 'task' && (
        <Panel title="Task card" onClose={() => setSheet(null)}>
          <TaskBrief v={t.v} />
          <p className="mt-4 text-[12.5px] font-semibold">Safety</p>
          <p className="text-[13px] text-muted-foreground">
            Lab coat: {scene.coat ? 'on' : 'not on'} · Goggles: {scene.goggles ? 'on' : 'not on'}
          </p>
          <p className="mt-4 text-[12.5px] font-semibold">Apparatus</p>
          <CupboardList scene={scene} t={t} />
        </Panel>
      )}
      {sheet === 'cupboard' && (
        <Panel title="Apparatus cupboard" onClose={() => setSheet(null)}>
          <p className="mb-2 text-[13px] text-muted-foreground">Take what you need for this titration to your bench.</p>
          <CupboardList scene={scene} t={t} />
        </Panel>
      )}
      {sheet === 'help' && (
        <Panel title="Controls" onClose={() => setSheet(null)}>
          <HelpContent touch={touch} />
        </Panel>
      )}
      {sheet === 'menu' && (
        <Panel title="Paused" side="center" onClose={() => setSheet(null)}>
          <div className="grid gap-2">
            <Button variant="brand" onClick={() => setSheet(null)}>
              Resume
            </Button>
            <Button variant="outline" onClick={() => setSheet('help')}>
              <HelpCircle /> Controls
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                t.stopStream();
                useLabView.setState({ mode: 'bench', focus: 'bench', selected: null, held: null, pip: 'idle', streaming: false, eye: 0.03 });
                setSheet(null);
              }}
            >
              Reset station (camera and hands — your work is kept)
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                useLabView.setState((v) => ({ mode: 'walk', selected: null, held: null, resetTick: v.resetTick + 1 }));
                setSheet(null);
              }}
            >
              Back to the door
            </Button>
            {onUse2d && (
              <Button variant="outline" onClick={onUse2d}>
                <MonitorSmartphone /> Switch to the 2D lab
              </Button>
            )}
            {onHandIn && (
              <Button
                variant="outline"
                onClick={() => {
                  setSheet(null);
                  setImmersive(false);
                  onHandIn();
                }}
              >
                <Send /> Hand in
              </Button>
            )}
          </div>
        </Panel>
      )}

      {intro && (
        <div className="absolute inset-0 z-40 grid place-items-center bg-black/45 p-4 backdrop-blur-[2px]">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-2xl sm:p-5">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">3D virtual lab</p>
            <h2 className="mt-1 font-display text-xl font-semibold tracking-tight">Chemistry laboratory</h2>
            <p className="mt-2 text-[13.5px] text-muted-foreground sm:hidden">Put on your coat and goggles, collect apparatus, then titrate at your bench.</p>
            <ol className="mt-3 hidden list-decimal space-y-1 pl-5 text-[13.5px] text-muted-foreground sm:block">
              <li>Put on your lab coat and goggles (hooks by the door).</li>
              <li>Collect your apparatus from the cupboard on the right.</li>
              <li>Go to your bench, set up and titrate A against B.</li>
              <li>Read the burette at eye level and record it in your notebook.</li>
            </ol>
            <p className="mt-3 hidden text-[12.5px] text-muted-foreground sm:block">{touch ? 'Joystick to walk, drag to look, tap things to use them.' : 'WASD or arrows to walk, drag to look, click things to use them.'}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                variant="brand"
                onClick={() => {
                  setIntro(false);
                  if (touch) setImmersive(true);
                }}
              >
                Enter the lab
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setIntro(false);
                  if (touch) setImmersive(true);
                  set({ mode: 'bench', focus: 'bench' });
                }}
              >
                Go straight to my bench
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
