import type { CriterionScore, PracticalAskStage, PracticalMode, PracticalResult } from '@aischool/shared';
import { Canvas } from '@react-three/fiber';
import { ClipboardList, Clock, Compass, GraduationCap, HelpCircle, Lightbulb, ListChecks, Maximize2, Menu, Minimize2, MonitorSmartphone, NotebookPen, PlayCircle, Send, ShieldCheck, Volume2, VolumeX } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { clock, useCountdown } from '../../learning/components';
import { usePracticalLesson } from '../api';
import { gpuTier, isTouchDevice } from '../simulators/webgl';
import { AskPanel, type AskSuggestions, type AskTurn } from './ask';
import { assistantProfile } from './assistant-profile';
import { Joystick } from './controls';
import { DemoPlayer, type DemoHandle } from './demo-player';
import { justDragged, useCarryDrag } from './drag';
import { lessonLines, type Explainer } from './explain';
import { currentStep, type Correction, type GuideStep } from './guide';
import { AssistantStrip, CorrectionCard, Debrief, GuideChecklist, HandInCheck } from './guide-hud';
import { ContextMenu, CupboardList, DragOverlay, HelpContent, Notice, Panel, type HelpRow, type ObjectPanel } from './hud';
import { JourneyBar, type Stage } from './journey';
import { LearnStage, type LearnConfig } from './learn';
import { loadPrefs, savePrefs, type LabPrefs } from './prefs';
import { SafetyBriefing, type SafetyContent } from './safety';
import { play, setMuted, stopPour } from './sound';
import { useLabView, type CameraMode, type DragState, type Quality } from './store';
import { Tour, type TourStep } from './tour';
import { say, setVoice, voiceAvailable } from './voice';

/**
 * The 3D lab shell: everything around a lab's own bench — the canvas, the top
 * bar (menu, task card, notebook, sound, help, full screen, exam clock), the
 * journey (Learn → Demo → Try, sandbox, Ask), the intro, the controls tour,
 * the safety briefing, the guide (checklist, beacon target, assistant tips,
 * corrections), the object menus with "What is this?" cards, the panels
 * (task, notebook, cupboard, help, pause menu, hand-in check), the debrief
 * after marking, keyboard shortcuts and the lost-context fallback.
 *
 * A lab calls `useLabKit` (it needs the stage to choose what its bench shows),
 * then renders `<LabShell kit={kit} …/>` with its own pieces. See README.md.
 */

export type Sheet = 'notebook' | 'task' | 'cupboard' | 'help' | 'menu' | 'handin' | 'ask' | 'sandbox' | null;
const DPR: Record<Quality, [number, number]> = { low: [1, 1], medium: [1, 1.5], high: [1, 2] };
const LINE_SHOW_MS = 14_000;
const EXAM_LINE = 'This is a timed practical, so I can’t help with the method. Follow the instructions on your task card — you can do it!';

export interface LabKitOptions {
  mode: PracticalMode;
  readOnly: boolean;
  practicalId?: string;
  /** After marking (read-only): opens the debrief. */
  result?: PracticalResult | null;
  /** The attempt has work in it (beyond the safety briefing): Try opens at the bench, and Mrs Ada says "Welcome back". */
  started: boolean;
  /** The stage is changing: the lab clears its own bench state (taps, animations, sequences in progress). */
  onStageChange?: (next: Stage) => void;
}

/** The shell's state, used by the lab (stage, guided, speak…) and by LabShell. */
export function useLabKit(o: LabKitOptions) {
  const { mode, readOnly, practicalId, result, started } = o;
  const touch = useMemo(isTouchDevice, []);
  const practice = mode === 'LAB' && !readOnly;
  const [prefs, setPrefs] = useState<LabPrefs>(loadPrefs);
  const updatePrefs = useCallback((p: Partial<LabPrefs>) => setPrefs((x) => (savePrefs({ ...x, ...p }), { ...x, ...p })), []);
  const lesson = usePracticalLesson(practicalId ?? '').data;
  const [stage, setStage] = useState<Stage>('try');
  const journey = prefs.journey?.[practicalId ?? ''] ?? {};
  const markJourney = useCallback(
    (k: 'learn' | 'demo') =>
      setPrefs((x) => {
        const next = { ...x, journey: { ...x.journey, [practicalId ?? '']: { ...x.journey?.[practicalId ?? ''], [k]: true } } };
        savePrefs(next);
        return next;
      }),
    [practicalId],
  );
  const work = stage === 'try' || stage === 'sandbox';
  const guided = practice && prefs.guided && work;
  const [sheet, setSheet] = useState<Sheet>(null);
  const [intro, setIntro] = useState(!readOnly);
  const [tour, setTour] = useState(false);
  const [immersive, setImmersive] = useState(false);
  const [correction, setCorrection] = useState<Correction | null>(null);
  const [stripHidden, setStripHidden] = useState(false);
  const [debrief, setDebrief] = useState(!!result);
  /** The frame-rate monitor gave up at the lowest quality tier: offer the 2D lab (pass `onSlow` to KitScene). */
  const [slow, setSlow] = useState(false);
  const onSlow = useCallback(() => setSlow(true), []);
  const set = useLabView((v) => v.set);

  const speak = useCallback(
    (text: string) => {
      set({ line: { text, at: Date.now() } });
      setStripHidden(false);
      say(text);
    },
    [set],
  );
  /** Shows a correction card (guided mode), says its title and plays the "oops" sound. */
  const correct = useCallback(
    (c: Correction) => {
      setCorrection(c);
      speak(c.title);
      play('oops');
    },
    [speak],
  );
  const startTour = () => {
    setSheet(null);
    set({ walked: 0, looked: 0, picked: 0, selected: null });
    setTour(true);
  };
  const onStageChange = useRef(o.onStageChange);
  onStageChange.current = o.onStageChange;
  const goStage = (next: Stage, opts: { bench?: boolean } = {}) => {
    setSheet(null);
    setCorrection(null);
    onStageChange.current?.(next);
    stopPour();
    const teaching = next === 'learn' || next === 'demo';
    useLabView.setState((x) => ({
      spot: null,
      selected: null,
      held: null,
      target: null,
      ada: { at: teaching ? 'bench' : 'desk', point: null, goggles: teaching },
      mode: teaching || next === 'sandbox' || opts.bench || (next === 'try' && started) ? 'bench' : 'walk',
      focus: 'bench',
      resetTick: next === 'try' && !started ? x.resetTick + 1 : x.resetTick,
    }));
    setStage(next);
    if (next === 'try' && practice && !prefs.tourDone) startTour();
  };
  const enter = (next: Stage, bench = false) => {
    setIntro(false);
    if (touch) setImmersive(true);
    goStage(next, { bench });
  };

  // A fresh view for every visit; the quality tier from the device.
  useEffect(() => {
    const tier = gpuTier();
    useLabView.setState({
      mode: readOnly ? 'bench' : 'walk',
      focus: 'bench',
      hover: null,
      selected: null,
      held: null,
      drag: null,
      target: null,
      line: null,
      eye: 0.03,
      quality: tier === 'high' ? 'high' : tier === 'medium' ? 'medium' : 'low',
    });
    // Development only: lets an automated browser check drive the view.
    if (import.meta.env.DEV) (window as Window & { __lab3d?: typeof useLabView }).__lab3d = useLabView;
    return () => {
      document.body.style.cursor = '';
      stopPour();
    };
  }, [readOnly]);
  useEffect(() => setMuted(prefs.muted), [prefs.muted]);
  useEffect(() => setVoice(prefs.voice), [prefs.voice]);
  // Full screen: no page scroll behind the lab.
  useEffect(() => {
    if (!immersive) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [immersive]);

  return {
    o,
    touch,
    practice,
    prefs,
    updatePrefs,
    lesson,
    stage,
    goStage,
    enter,
    journey,
    markJourney,
    work,
    guided,
    sheet,
    setSheet,
    intro,
    tour,
    setTour,
    startTour,
    immersive,
    setImmersive,
    correction,
    setCorrection,
    correct,
    stripHidden,
    setStripHidden,
    debrief,
    setDebrief,
    speak,
    slow,
    onSlow,
  };
}
export type LabKit = ReturnType<typeof useLabKit>;

/**
 * Watches a lab's action log for new entries (per stage: switching bench
 * starts afresh) and calls `onNew` with them — e.g. to look for mistakes and
 * `kit.correct()` them. Work done before this visit is never looked at.
 */
export function useNewLogEntries(log: { t: number; a: string }[], stage: Stage, onNew: (fresh: { t: number; a: string }[]) => void) {
  const lastSeen = useRef(log.at(-1)?.t ?? -1);
  const seenStage = useRef(stage);
  const cb = useRef(onNew);
  cb.current = onNew;
  useEffect(() => {
    if (seenStage.current !== stage) {
      seenStage.current = stage;
      lastSeen.current = log.at(-1)?.t ?? -1;
      cb.current([]);
      return;
    }
    const fresh = log.filter((e) => e.t > lastSeen.current);
    lastSeen.current = log.at(-1)?.t ?? lastSeen.current;
    cb.current(fresh);
  }, [log, stage]);
}

export interface LabShellProps {
  kit: LabKit;
  /** Top bar title, e.g. "Chemistry lab"; intro heading, e.g. "Chemistry laboratory". */
  title: string;
  heading: string;
  /** Intro text: one line for phones, the numbered steps for larger screens. */
  intro: { short: string; steps: string[] };
  /** What the reading view is called in the top bar ("reading the burette"). */
  readingStatus?: string;
  /** Inside the canvas: the lab's scene (usually <KitScene>…</KitScene>). */
  scene: ReactNode;
  /** The exam clock and hand-in. */
  endsAt?: string | null;
  onHandIn?: () => void;
  onUse2d?: () => void;
  attemptId?: string;
  /** Guided steps (worked out by the lab when kit.guided) and the plain hint (practice, guided mode off). */
  steps: GuideStep[];
  hint: string | null;
  /** The selected object's menu, and its "What is this?" card. */
  objectPanel: (id: string) => ObjectPanel | null;
  explain: (id: string) => Explainer | null;
  /** Panel contents: the task card, the notebook, the cupboard checklist. */
  task: ReactNode;
  notebook: ReactNode;
  cupboard: { blurb: string; items: { id: string; label: string }[]; has: (id: string) => boolean; onToggle: (id: string, take: boolean) => void; onCarry: (id: string) => void };
  /** Bottom right at the bench: the lab's controls (e.g. the tap dock) above its mode bar. */
  dock?: ReactNode;
  modeBar: ReactNode;
  /** Shown in the reading view (the lab's reading panel). */
  readingPanel?: ReactNode;
  /** Feedback for the lab's own drag kinds (inside the kit's drag overlay). */
  dragFeedback?: (drag: DragState) => ReactNode;
  /** Learn stage config; demo player and its side panels. */
  learn: LearnConfig;
  demo: DemoHandle;
  demoPanel?: (id: string) => ReactNode;
  /** Optional unmarked sandbox: its setup form (start → kit.goStage('sandbox')) and results card. */
  sandbox?: { form: ReactNode; results: ReactNode };
  ask: { suggestions: AskSuggestions; extra?: string };
  tourSteps: TourStep[];
  safety: SafetyContent;
  /** The briefing is in the attempt's log (passed or skipped); record the outcome there. */
  briefed: boolean;
  onBriefing: (outcome: 'passed' | 'skipped') => void;
  /** What is still missing before hand-in (the simulator's `missing`). */
  missing: string[];
  helpRows?: HelpRow[];
  /** "Reset station": the lab clears its bench view state (the kit resets the camera and hands). */
  onResetStation: () => void;
  /** The lab's keyboard shortcuts at the bench (Space, D…); return true when handled. Keyup too. */
  onKey?: (e: KeyboardEvent, type: 'down' | 'up') => boolean;
  /** The reading view can open, and opening it (R): the kit switches mode. */
  canRead?: boolean;
  /** Debrief "show me": where the camera goes for a criterion. */
  debriefView: (c: CriterionScore) => { mode: CameraMode; focus?: string; eye?: number; notebook?: boolean };
}

export function LabShell(p: LabShellProps) {
  const { kit } = p;
  const { o, touch, practice, prefs, updatePrefs, lesson, stage, goStage, enter, journey, markJourney, work, guided, sheet, setSheet, intro, tour, setTour, startTour, immersive, setImmersive, correction, setCorrection, stripHidden, setStripHidden, debrief, setDebrief, speak } = kit;
  const { mode, readOnly, practicalId, result } = o;
  const { slow } = kit;
  const [lost, setLost] = useState(false);
  const [learnStep, setLearnStep] = useState<string | null>(null);
  const [askTurns, setAskTurns] = useState<AskTurn[]>([]);
  const [briefAgain, setBriefAgain] = useState(false);
  const camMode = useLabView((v) => v.mode);
  const selected = useLabView((v) => v.selected);
  const quality = useLabView((v) => v.quality);
  const line = useLabView((v) => v.line);
  const set = useLabView((v) => v.set);
  const left = useCountdown(p.endsAt ?? null);
  useCarryDrag(p.cupboard.onCarry);

  // ---- guide: beacon target, assistant tips
  const cur = currentStep(p.steps);
  useEffect(() => {
    if (work) set({ target: guided && cur?.target ? cur.target : null });
  }, [guided, cur?.target, set, work]);
  const nextTip = useCallback(() => {
    if (!practice) return speak(EXAM_LINE);
    if (!cur) return speak('Everything is done — open the menu and hand in your lab. Well done!');
    speak(`${cur.group ? `${cur.group}: ` : ''}${cur.label}. ${cur.why}`);
  }, [practice, cur, speak]);
  // Tapping the assistant asks for the next instruction.
  useEffect(() => {
    if (selected !== 'assistant') return;
    set({ selected: null, picked: useLabView.getState().picked + 1 });
    nextTip();
  }, [selected, set, nextTip]);

  // ---- first visit: the tour, then the safety briefing at the door, then a greeting
  const showBriefing = practice && stage === 'try' && !intro && !tour && (!p.briefed || briefAgain);
  const closeSheet = useCallback(() => setSheet(null), [setSheet]);
  const greeted = useRef(false);
  useEffect(() => {
    if (!practice || stage !== 'try' || intro || tour || showBriefing || greeted.current) return;
    greeted.current = true;
    speak(
      o.started
        ? `Welcome back! ${cur ? `Next: ${cur.label.toLowerCase()}.` : 'Everything is recorded — hand in when you are ready.'} Tap me any time for help.`
        : `Welcome! I’m ${assistantProfile.name}, the ${assistantProfile.role}. ${cur ? `First: ${cur.label.toLowerCase()}.` : ''} Tap me any time for help.`,
    );
  }, [practice, stage, intro, tour, showBriefing, cur, o.started, speak]);

  // ---- after marking: the debrief camera
  const showMe = (c: CriterionScore) => {
    setSheet(null);
    const v = p.debriefView(c);
    set({ mode: v.mode, ...(v.focus ? { focus: v.focus } : {}), ...(v.eye !== undefined ? { eye: v.eye } : {}) });
    if (v.notebook) setSheet('notebook');
  };

  const goRead = () => {
    if (!p.canRead) return;
    set({ mode: 'read', selected: null });
    setSheet(null);
  };
  const panel = work && selected && selected !== 'assistant' ? p.objectPanel(selected) : null;
  // "What is this?" cards teach the method: practice and review only, not in a timed practical.
  const explained = selected && mode === 'LAB' ? p.explain(selected) : null;

  // Keyboard shortcuts.
  useEffect(() => {
    const typing = (el: EventTarget | null) => el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
    const down = (e: KeyboardEvent) => {
      if (typing(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      const vw = useLabView.getState();
      const k = e.key.toLowerCase();
      if (k === 'escape') {
        if (sheet) setSheet(null);
        else if (vw.selected) vw.set({ selected: null });
        else if (vw.mode === 'read') vw.set({ mode: 'bench' });
        else setSheet('menu');
      } else if (!work) return;
      else if (k === 'b' && vw.mode === 'walk') vw.set({ mode: 'bench', focus: 'bench' });
      else if (k === 'r') goRead();
      else if (k === 'n') setSheet((x) => (x === 'notebook' ? null : 'notebook'));
      else if (k === 't') setSheet((x) => (x === 'task' ? null : 'task'));
      else if (k === 'h' || k === '?') setSheet((x) => (x === 'help' ? null : 'help'));
      else p.onKey?.(e, 'down');
    };
    const up = (e: KeyboardEvent) => void p.onKey?.(e, 'up');
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  });

  const lowTime = left != null && left < 5 * 60_000;
  const glass = 'border-white/20 bg-black/45 text-white backdrop-blur hover:bg-black/60 hover:text-white';
  // The assistant's line stays up for a while, then the strip tidies itself away (tap them or "What next?" for more).
  const [, tick] = useState(0);
  useEffect(() => {
    if (!line) return;
    const id = setTimeout(() => tick((n) => n + 1), Math.max(0, LINE_SHOW_MS - (Date.now() - line.at)) + 30);
    return () => clearTimeout(id);
  }, [line]);
  const showLine = !!line && !stripHidden && Date.now() - line.at < LINE_SHOW_MS && (practice || line.text === EXAM_LINE) && !tour;
  const blocking = intro || tour || showBriefing;
  const askOk = practice && !!practicalId;
  const askStage: PracticalAskStage = stage === 'learn' ? 'LEARN' : stage === 'demo' ? 'DEMO' : stage === 'sandbox' ? 'SANDBOX' : 'TRY';
  const askStep = stage === 'learn' ? learnStep : stage === 'demo' ? p.demo.step.title : (cur?.label ?? null);
  const cupboardList = <CupboardList items={p.cupboard.items} has={p.cupboard.has} onToggle={p.cupboard.onToggle} />;
  const labels = useMemo(() => Object.fromEntries(p.cupboard.items.map((x) => [x.id, x.label])), [p.cupboard.items]);

  return (
    <div className={cn('relative isolate overflow-hidden bg-[#1b2328] text-white', immersive ? 'fixed inset-0 z-50' : 'h-[min(70dvh,780px)] min-h-[400px] rounded-2xl border border-border sm:h-[min(78dvh,780px)] sm:min-h-[480px]')}>
      {!lost && (
        <Canvas
          dpr={DPR[quality]}
          gl={{ antialias: quality !== 'low', powerPreference: 'high-performance', alpha: false }}
          camera={{ fov: 62, near: 0.03, far: 40, position: [5.1, 1.58, 4.2] }}
          onCreated={({ gl }) => gl.domElement.addEventListener('webglcontextlost', () => setLost(true))}
          onPointerMissed={() => !justDragged() && set({ selected: null })}
          className="touch-none"
          aria-label={`3D ${p.heading.toLowerCase()}`}
        >
          {p.scene}
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
              {p.onUse2d && (
                <Button variant="outline" className={glass} onClick={p.onUse2d}>
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
          {!readOnly && (
            <Button size="icon-sm" variant="outline" className={cn('pointer-events-auto', glass)} onClick={() => setSheet('menu')} aria-label="Menu" data-tour="menu">
              <Menu />
            </Button>
          )}
          <div className="min-w-0 truncate whitespace-nowrap rounded-full bg-black/45 px-3 py-1 text-[12.5px] backdrop-blur">
            <span className="font-semibold">{p.title}</span>
            <span className="hidden text-white/70 sm:inline">
              {' '}
              · {readOnly ? 'your lab record' : stage === 'learn' ? 'learning' : stage === 'demo' ? 'demonstration' : stage === 'sandbox' ? 'sandbox (unmarked)' : camMode === 'walk' ? 'walking' : camMode === 'bench' ? 'at your bench' : (p.readingStatus ?? 'reading')}
            </span>
          </div>
          {left != null && (
            <span className={cn('inline-flex items-center gap-1 rounded-full bg-black/55 px-2.5 py-1 font-display text-[14px] font-semibold tabular backdrop-blur', lowTime && 'bg-danger text-white')} aria-label="Time left">
              <Clock className="size-3.5" aria-hidden /> {clock(left)}
            </span>
          )}
          <div className="pointer-events-auto ml-auto flex gap-1.5">
            <Button size="sm" variant="outline" className={glass} onClick={() => setSheet(sheet === 'task' ? null : 'task')} aria-label="Task card" data-tour="task">
              <ClipboardList /> <span className="hidden md:inline">Task</span>
            </Button>
            <Button size="sm" variant="outline" className={glass} onClick={() => setSheet(sheet === 'notebook' ? null : 'notebook')} aria-label="Notebook" data-tour="notebook">
              <NotebookPen /> <span className="hidden md:inline">Notebook</span>
            </Button>
            <Button size="icon-sm" variant="outline" className={cn(glass, 'hidden sm:inline-flex')} onClick={() => updatePrefs({ muted: !prefs.muted })} aria-label={prefs.muted ? 'Sound on' : 'Mute sounds'} aria-pressed={prefs.muted}>
              {prefs.muted ? <VolumeX /> : <Volume2 />}
            </Button>
            <Button size="icon-sm" variant="outline" className={glass} onClick={() => setSheet(sheet === 'help' ? null : 'help')} aria-label="Help and controls">
              <HelpCircle />
            </Button>
            <Button size="icon-sm" variant="outline" className={glass} onClick={() => setImmersive((x) => !x)} aria-label={immersive ? 'Exit full screen' : 'Full screen'}>
              {immersive ? <Minimize2 /> : <Maximize2 />}
            </Button>
          </div>
        </div>
        {practice && !intro && !tour && (
          <JourneyBar
            stage={stage}
            learned={!!journey.learn}
            demoed={!!journey.demo}
            sandbox={!!p.sandbox}
            onStage={(x) => (x === 'sandbox' ? setSheet('sandbox') : goStage(x))}
            onAsk={askOk ? () => setSheet(sheet === 'ask' ? null : 'ask') : undefined}
            asking={sheet === 'ask'}
          />
        )}
        {p.hint && !blocking && work && (
          <p className="mx-auto flex max-w-xl items-start gap-1.5 rounded-xl bg-black/55 px-3 py-1.5 text-[12.5px] leading-snug backdrop-blur">
            <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-amber-300" aria-hidden /> {p.hint}
          </p>
        )}
        <Notice />
        {correction && !blocking && <CorrectionCard c={correction} onClose={() => setCorrection(null)} onAsk={() => speak(correction.why)} />}
        {showLine && !correction && !blocking && work && camMode !== 'read' && (
          <div className="mx-auto">
            <AssistantStrip text={line!.text} onNext={nextTip} voice={prefs.voice} voiceOk={voiceAvailable()} onVoice={() => updatePrefs({ voice: !prefs.voice })} onClose={() => setStripHidden(true)} />
          </div>
        )}
        {slow && (
          <p className="pointer-events-auto mx-auto flex items-center gap-2 rounded-xl bg-amber-500/90 px-3 py-1.5 text-[12.5px] text-black">
            Running slowly on this device.
            {p.onUse2d && (
              <button type="button" className="font-semibold underline" onClick={p.onUse2d}>
                Switch to the 2D lab
              </button>
            )}
          </p>
        )}
      </div>

      {/* left: the step checklist (guided practice) */}
      {guided && !intro && !showBriefing && camMode !== 'read' && !(touch && (panel || showLine || sheet)) && (
        <div className="pointer-events-none absolute left-2 top-14 z-[5] sm:left-3 sm:top-16">
          <GuideChecklist steps={p.steps} compact={touch} />
        </div>
      )}

      {/* bottom: joystick, mode buttons, the lab's controls */}
      {!intro && work && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-end justify-between gap-2 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:p-3">
          <div className="pointer-events-auto flex flex-col items-start gap-2">
            {touch && camMode === 'walk' && !panel && (
              <div data-tour="joystick">
                <Joystick />
              </div>
            )}
          </div>
          {!panel && camMode !== 'read' && (
            <div className="pointer-events-auto flex max-w-[78%] flex-col items-end gap-1.5">
              {camMode === 'bench' && !readOnly && p.dock}
              {p.modeBar}
            </div>
          )}
        </div>
      )}
      <DragOverlay labels={labels}>{p.dragFeedback}</DragOverlay>
      {stage === 'sandbox' && !intro && !panel && p.sandbox && <div className="pointer-events-none absolute right-2 top-[6.5rem] z-[5] sm:right-3 sm:top-28">{p.sandbox.results}</div>}
      {stage === 'learn' && <LearnStage lesson={lesson} config={p.learn} practicalId={practicalId ?? ''} onCard={setLearnStep} onClose={() => goStage('try')} onDone={() => (markJourney('learn'), goStage('demo'))} />}
      {stage === 'demo' && !sheet && <DemoPlayer demo={p.demo} panel={p.demoPanel} onClose={() => goStage('try')} />}
      {camMode === 'read' && work && !sheet && !debrief && p.readingPanel}
      {panel && !sheet && camMode !== 'read' && !debrief && (
        <ContextMenu panel={panel} readOnly={readOnly} onClose={() => set({ selected: null })} explain={explained ? { e: explained, lesson: lessonLines(lesson, explained) } : null} />
      )}
      {sheet === 'notebook' && (
        <Panel title="Practical notebook" onClose={() => setSheet(null)}>
          {p.notebook}
        </Panel>
      )}
      {sheet === 'task' && (
        <Panel title="Task card" onClose={() => setSheet(null)}>
          {p.task}
          <p className="mt-4 text-[12.5px] font-semibold">Apparatus</p>
          {cupboardList}
        </Panel>
      )}
      {sheet === 'cupboard' && (
        <Panel title="Apparatus cupboard" onClose={() => setSheet(null)}>
          <p className="mb-2 text-[13px] text-muted-foreground">{p.cupboard.blurb}</p>
          {cupboardList}
        </Panel>
      )}
      {sheet === 'ask' && askOk && (
        <Panel title={`Ask ${assistantProfile.name}`} onClose={() => setSheet(null)}>
          <AskPanel practicalId={practicalId!} stage={askStage} step={askStep} attemptId={p.attemptId} turns={askTurns} setTurns={setAskTurns} suggestions={p.ask.suggestions} extra={p.ask.extra} />
        </Panel>
      )}
      {sheet === 'sandbox' && p.sandbox && (
        <Panel title="Sandbox — your own values" onClose={() => setSheet(null)}>
          {p.sandbox.form}
        </Panel>
      )}
      {sheet === 'help' && (
        <Panel title="Controls" onClose={() => setSheet(null)}>
          <HelpContent touch={touch} extra={p.helpRows} />
          {!readOnly && (
            <Button className="mt-4" variant="brand" onClick={startTour}>
              <Compass /> Replay the lab tour
            </Button>
          )}
        </Panel>
      )}
      {sheet === 'handin' && p.onHandIn && (
        <Panel title="Hand in your lab?" side="center" onClose={() => setSheet(null)}>
          <HandInCheck
            missing={p.missing}
            onBack={() => setSheet(null)}
            onHandIn={() => {
              setSheet(null);
              setImmersive(false);
              p.onHandIn!();
            }}
          />
        </Panel>
      )}
      {sheet === 'menu' && (
        <Panel title="Paused" side="center" onClose={() => setSheet(null)}>
          <div className="grid gap-2">
            <Button variant="brand" onClick={() => setSheet(null)}>
              Resume
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => setSheet('help')}>
                <HelpCircle /> Controls
              </Button>
              <Button variant="outline" onClick={startTour}>
                <Compass /> Lab tour
              </Button>
            </div>
            {practice && (
              <label className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-[13.5px]">
                <span className="flex items-center gap-2">
                  <ListChecks className="size-4 text-muted-foreground" aria-hidden /> Guided mode (steps, arrows, tips)
                </span>
                <Switch checked={prefs.guided} onCheckedChange={(g) => updatePrefs({ guided: g })} />
              </label>
            )}
            <label className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-[13.5px]">
              <span className="flex items-center gap-2">
                <Volume2 className="size-4 text-muted-foreground" aria-hidden /> Sounds
              </span>
              <Switch checked={!prefs.muted} onCheckedChange={(on) => updatePrefs({ muted: !on })} />
            </label>
            {voiceAvailable() && (
              <label className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-[13.5px]">
                <span>
                  {assistantProfile.name} reads {assistantProfile.pronoun} tips aloud
                </span>
                <Switch checked={prefs.voice} onCheckedChange={(on) => updatePrefs({ voice: on })} />
              </label>
            )}
            {practice && p.briefed && (
              <Button variant="outline" onClick={() => (setSheet(null), setBriefAgain(true))}>
                <ShieldCheck /> Safety briefing again
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => {
                p.onResetStation();
                useLabView.setState({ mode: 'bench', focus: 'bench', selected: null, held: null, drag: null, eye: 0.03 });
                setSheet(null);
              }}
            >
              Reset station (camera and hands — your work is kept)
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                useLabView.setState((x) => ({ mode: 'walk', selected: null, held: null, resetTick: x.resetTick + 1 }));
                setSheet(null);
              }}
            >
              Back to the door
            </Button>
            {p.onUse2d && (
              <Button variant="outline" onClick={p.onUse2d}>
                <MonitorSmartphone /> Switch to the 2D lab
              </Button>
            )}
            {p.onHandIn && (
              <Button variant="outline" onClick={() => setSheet('handin')} data-tour="handin">
                <Send /> Hand in
              </Button>
            )}
          </div>
        </Panel>
      )}

      {debrief && result && <Debrief criteria={result.criteria} onShow={showMe} onClose={() => setDebrief(false)} />}
      {tour && (
        <Tour
          steps={p.tourSteps}
          ctx={{ sheet, touch, practice: guided }}
          closeSheet={closeSheet}
          onClose={() => {
            setTour(false);
            setSheet(null);
            updatePrefs({ tourDone: true });
          }}
        />
      )}
      {showBriefing && (
        <SafetyBriefing
          content={p.safety}
          lessonSafety={lesson?.safety ?? []}
          onDone={() => {
            setBriefAgain(false);
            p.onBriefing('passed');
            updatePrefs({ safetyDone: true });
          }}
          onSkip={() => {
            setBriefAgain(false);
            if (!p.briefed) p.onBriefing('skipped');
          }}
        />
      )}

      {intro && (
        <div className="absolute inset-0 z-40 grid place-items-center bg-black/45 p-4 backdrop-blur-[2px]">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-2xl sm:p-5">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">3D virtual lab{mode === 'EXAM' ? ' · timed practical' : ''}</p>
            <h2 className="mt-1 font-display text-xl font-semibold tracking-tight">{p.heading}</h2>
            {practice && <p className="mt-2 text-[13.5px] text-muted-foreground">New to this practical? Learn it first, watch {assistantProfile.name} do it, then try it yourself — you can jump to any stage.</p>}
            <p className="mt-2 text-[13.5px] text-muted-foreground sm:hidden">{p.intro.short}</p>
            <ol className="mt-3 hidden list-decimal space-y-1 pl-5 text-[13.5px] text-muted-foreground sm:block">
              {p.intro.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
            <p className="mt-3 hidden text-[12.5px] text-muted-foreground sm:block">{touch ? 'Joystick to walk, drag to look, tap things to use them.' : 'WASD or arrows to walk, drag to look, click things to use them.'}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {practice && (
                <>
                  <Button variant={journey.learn ? 'outline' : 'brand'} onClick={() => enter('learn')}>
                    <GraduationCap /> 1. Learn first{journey.learn ? ' ✓' : ''}
                  </Button>
                  <Button variant={journey.learn && !journey.demo ? 'brand' : 'outline'} onClick={() => enter('demo')}>
                    <PlayCircle /> 2. Watch {assistantProfile.name}
                    {journey.demo ? ' ✓' : ''}
                  </Button>
                </>
              )}
              <Button variant={!practice || (journey.learn && journey.demo) ? 'brand' : 'outline'} onClick={() => enter('try')}>
                {practice ? '3. Try it: enter the lab' : 'Enter the lab'}
              </Button>
              <Button variant="ghost" onClick={() => enter('try', true)}>
                Go straight to my bench
              </Button>
              {!practice && (
                <Button variant="ghost" onClick={() => (enter('try'), startTour())}>
                  <Compass /> New here? 1-minute controls tour
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
