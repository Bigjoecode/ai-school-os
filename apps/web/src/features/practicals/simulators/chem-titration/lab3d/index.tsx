import { Canvas } from '@react-three/fiber';
import { ClipboardList, Clock, Compass, GraduationCap, HelpCircle, PlayCircle, Lightbulb, ListChecks, Maximize2, Menu, Minimize2, MonitorSmartphone, NotebookPen, Send, ShieldCheck, Volume2, VolumeX } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TITRATION_INDICATOR_INFO, type CriterionScore, type PracticalAskStage } from '@aischool/shared';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { clock, useCountdown } from '../../../../learning/components';
import { usePracticalLesson } from '../../../api';
import type { SimulatorProps } from '../../types';
import { gpuTier, isTouchDevice } from '../../webgl';
import { DROP, useTitration } from '../actions';
import { chemTitrationMissing } from '../missing';
import { Notebook, TaskBrief } from '../notebook';
import { AskPanel, type AskTurn } from './ask';
import { ASSISTANT_NAME } from './assistant';
import { DemoPlayer, useDemo } from './demo-player';
import { JourneyBar, type Stage } from './journey';
import { LEARN_STATE, LearnStage } from './learn';
import { SandboxResults, SandboxSetupForm, useSandbox } from './sandbox';
import { Joystick } from './controls';
import { justDragged } from './drag';
import { explainer, lessonLines } from './explain';
import { correctionFor, currentStep, guideSteps, type Correction } from './guide';
import { AssistantStrip, CorrectionCard, Debrief, GuideChecklist, HandInCheck } from './guide-hud';
import { ContextMenu, CupboardList, DragOverlay, HelpContent, ModeBar, Notice, Panel, ReadingPanel, TitrationDock } from './hud';
import { nextHint3d, objectPanel, swirl } from './lab-actions';
import { loadPrefs, savePrefs, type LabPrefs } from './prefs';
import { SafetyBriefing } from './safety';
import { LabScene } from './scene';
import { sceneFromState } from './scene-state';
import { play, setMuted, startPour, stopPour } from './sound';
import { tapLevel, useLabView, type Quality } from './store';
import { Tour } from './tour';
import { say, setVoice, voiceAvailable } from './voice';

/**
 * The 3D chemistry laboratory: the same titration as the 2D lab (same state,
 * same actions, same marks) in a walk-in, procedurally built school lab. The
 * student puts on a coat and goggles, collects apparatus from the cupboard,
 * sets up and carries out the titration at their bench, reads the burette at
 * eye level and records everything in the notebook on the bench.
 *
 * First visit on a device: a controls tour. Practice mode: a safety briefing
 * at the door, the step checklist with beacons, corrections with reasons and
 * Mrs Ada the lab technician. Timed (exam) mode: none of that guidance.
 * After marking, the same lab opens read-only with a debrief walkthrough.
 */

type Sheet = 'notebook' | 'task' | 'cupboard' | 'help' | 'menu' | 'handin' | 'ask' | 'sandbox' | null;
const noop = () => undefined;
const DPR: Record<Quality, [number, number]> = { low: [1, 1], medium: [1, 1.5], high: [1, 2] };
const LINE_SHOW_MS = 14_000;
const EXAM_LINE = 'This is a timed practical, so I can’t help with the method. Follow the instructions on your task card — you can do it!';

export default function ChemTitrationLab3D(props: SimulatorProps<'chem-titration'>) {
  const { seed, mode, state: attemptState, onChange, readOnly, startedAt, endsAt, onHandIn, onUse2d, practicalId, attemptId, result } = props;
  const touch = useMemo(isTouchDevice, []);
  const practice = mode === 'LAB' && !readOnly;
  const [prefs, setPrefs] = useState<LabPrefs>(loadPrefs);
  const updatePrefs = useCallback((p: Partial<LabPrefs>) => setPrefs((x) => (savePrefs({ ...x, ...p }), { ...x, ...p })), []);
  const lesson = usePracticalLesson(practicalId ?? '').data;

  // ---- the journey: Learn -> Watch demo -> Try (and the unmarked sandbox); timed practicals only Try
  const [stage, setStage] = useState<Stage>('try');
  const journey = prefs.journey?.[practicalId ?? ''] ?? {};
  const markJourney = useCallback((k: 'learn' | 'demo') => setPrefs((x) => {
    const next = { ...x, journey: { ...x.journey, [practicalId ?? '']: { ...x.journey?.[practicalId ?? ''], [k]: true } } };
    savePrefs(next);
    return next;
  }), [practicalId]);
  const tAttempt = useTitration({ seed, state: attemptState, onChange, readOnly, startedAt });
  const sandbox = useSandbox(startedAt);
  const learnT = useTitration({ seed, state: LEARN_STATE, onChange: noop, readOnly: true, startedAt });
  const precautions = useMemo(() => lesson?.precautions ?? [], [lesson]);
  const demo = useDemo({ studentSeed: seed, startedAt, precautions, active: stage === 'demo', onFinished: () => markJourney('demo') });
  const work = stage === 'try' || stage === 'sandbox';
  // Try and the sandbox share the bench UI; Learn and the demo show their own bench.
  const t = stage === 'sandbox' ? sandbox.t : tAttempt;
  const state = stage === 'sandbox' ? sandbox.state : attemptState;
  const scene = useMemo(() => sceneFromState(state), [state]);
  const shown = stage === 'learn' ? { t: learnT, state: LEARN_STATE } : stage === 'demo' ? { t: demo.t, state: demo.state } : { t, state };
  const shownScene = useMemo(() => sceneFromState(shown.state), [shown.state]);
  const guided = practice && prefs.guided && work;
  const [sheet, setSheet] = useState<Sheet>(null);
  const [intro, setIntro] = useState(!readOnly);
  const [tour, setTour] = useState(false);
  const [immersive, setImmersive] = useState(false);
  const [slow, setSlow] = useState(false);
  const [lost, setLost] = useState(false);
  const [correction, setCorrection] = useState<Correction | null>(null);
  const [stripHidden, setStripHidden] = useState(false);
  const [debrief, setDebrief] = useState(!!result);
  const [learnStep, setLearnStep] = useState<string | null>(null);
  const [askTurns, setAskTurns] = useState<AskTurn[]>([]);
  const camMode = useLabView((v) => v.mode);
  const selected = useLabView((v) => v.selected);
  const quality = useLabView((v) => v.quality);
  const line = useLabView((v) => v.line);
  const tap = useLabView((v) => v.tap);
  const set = useLabView((v) => v.set);
  // The object panels read these: re-render when they change.
  useLabView((v) => v.pip);
  useLabView((v) => v.held);
  const left = useCountdown(endsAt ?? null);

  // A fresh view for every visit; the quality tier from the device.
  useEffect(() => {
    const tier = gpuTier();
    useLabView.setState({
      mode: readOnly ? 'bench' : 'walk',
      focus: 'bench',
      hover: null,
      selected: null,
      held: null,
      pip: 'idle',
      streaming: false,
      tap: 0,
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

  // ---- the tap: turned by dragging (closed / drop by drop / stream) or held open with the button
  const canRun = work && t.canDeliver && scene.flaskUnder;
  const level = tapLevel(tap);
  useEffect(() => {
    if (!work) return;
    if (!canRun) {
      if (useLabView.getState().streaming) t.stopStream();
      if (useLabView.getState().tap || useLabView.getState().streaming) set({ streaming: false, tap: 0 });
      stopPour();
      return;
    }
    if (level === 'stream') {
      set({ streaming: true });
      t.startStream();
      startPour();
      return () => {
        t.stopStream();
        set({ streaming: false });
        stopPour();
      };
    }
    if (level === 'drops') {
      const id = setInterval(() => {
        t.deliver(DROP, false);
        set({ dropAt: performance.now() });
        play('drip');
      }, 450);
      return () => clearInterval(id);
    }
    // t's actions read the latest state through a ref, so the ones from this render stay valid.
  }, [level, canRun, work]);

  // ---- guidance
  const v = t.v;
  const steps = useMemo(() => (guided ? guideSteps(state, scene, camMode, v) : []), [guided, state, scene, camMode, v]);
  const cur = currentStep(steps);
  useEffect(() => {
    if (work) set({ target: guided && cur?.target ? cur.target : null });
  }, [guided, cur?.target, set, work]);
  const speak = useCallback(
    (text: string) => {
      set({ line: { text, at: Date.now() } });
      setStripHidden(false);
      say(text);
    },
    [set],
  );
  const nextTip = useCallback(() => {
    if (!practice) return speak(EXAM_LINE);
    if (!cur) return speak('Everything is done — open the menu and hand in your lab. Well done!');
    speak(`${cur.group ? `${cur.group}: ` : ''}${cur.label}. ${cur.why}`);
  }, [practice, cur, speak]);
  // Tapping Mrs Ada asks for the next instruction.
  useEffect(() => {
    if (selected !== 'assistant') return;
    set({ selected: null, picked: useLabView.getState().picked + 1 });
    nextTip();
  }, [selected, set, nextTip]);
  // Corrections: look at what was just recorded (never at work done before this visit).
  const lastSeen = useRef(state.log.at(-1)?.t ?? -1);
  const sceneBefore = useRef(scene);
  const seenStage = useRef(stage);
  useEffect(() => {
    if (seenStage.current !== stage) {
      // A different bench (sandbox / attempt): only what is done from now on is looked at.
      seenStage.current = stage;
      lastSeen.current = state.log.at(-1)?.t ?? -1;
      sceneBefore.current = scene;
      return;
    }
    const fresh = state.log.filter((e) => e.t > lastSeen.current);
    lastSeen.current = state.log.at(-1)?.t ?? lastSeen.current;
    if (guided && fresh.length) {
      let found: Correction | null = null;
      for (const e of fresh) found = correctionFor(e.a, state, v, sceneBefore.current) ?? found;
      if (found) {
        setCorrection(found);
        speak(found.title);
        play('oops');
      }
    }
    sceneBefore.current = scene;
  }, [state, scene, guided, v, speak, stage]);

  // ---- first visit: the tour, then the safety briefing at the door
  const [briefAgain, setBriefAgain] = useState(false);
  const briefed = attemptState.log.some((e) => e.a.startsWith('safety-briefing'));
  const showBriefing = practice && stage === 'try' && !intro && !tour && (!briefed || briefAgain);
  const goStage = (next: Stage, opts: { bench?: boolean } = {}) => {
    setSheet(null);
    setCorrection(null);
    t.stopStream();
    stopPour();
    const teaching = next === 'learn' || next === 'demo';
    const started = attemptState.log.some((e) => !e.a.startsWith('safety-briefing'));
    useLabView.setState((x) => ({
      spot: null,
      selected: null,
      held: null,
      pip: 'idle',
      streaming: false,
      tap: 0,
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
  const closeSheet = useCallback(() => setSheet(null), []);
  const startTour = () => {
    setSheet(null);
    set({ walked: 0, looked: 0, picked: 0, selected: null });
    setTour(true);
  };
  const greeted = useRef(false);
  useEffect(() => {
    if (!practice || stage !== 'try' || intro || tour || showBriefing || greeted.current) return;
    greeted.current = true;
    const started = state.log.some((e) => !e.a.startsWith('safety-briefing'));
    speak(
      started
        ? `Welcome back! ${cur ? `Next: ${cur.label.toLowerCase()}.` : 'Everything is recorded — hand in when you are ready.'} Tap me any time for help.`
        : `Welcome! I’m ${ASSISTANT_NAME}, the lab technician. ${cur ? `First: ${cur.label.toLowerCase()}.` : ''} Tap me any time for help.`,
    );
  }, [practice, stage, intro, tour, showBriefing, cur, state.log, speak]);

  // ---- after marking: the debrief camera
  const showMe = (c: CriterionScore) => {
    setSheet(null);
    if (c.id === 'setup') set({ mode: 'bench', focus: 'burette' });
    else if (c.id === 'procedure') set({ mode: 'bench', focus: 'flask' });
    else if (c.id === 'readings') set({ mode: 'read', eye: 0 });
    else {
      set({ mode: 'bench', focus: 'bench' });
      setSheet('notebook');
    }
  };

  if (import.meta.env.DEV) Object.assign(window, { __lab3dState: attemptState, __lab3dShown: shown.state, __lab3dStage: stage });
  const canRead = scene.clamped && state.burette !== null;
  const goRead = () => {
    if (!canRead) return;
    set({ mode: 'read', selected: null });
    setSheet(null);
  };
  const ctx = { t, s: state, scene, open: (w: 'notebook' | 'task' | 'cupboard') => (set({ selected: null }), setSheet(w)) };
  const panel = work && selected && selected !== 'assistant' ? objectPanel(selected, ctx) : null;
  // "What is this?" cards teach the method: practice and review only, not in a timed practical.
  const explained = selected && mode === 'LAB' ? explainer(selected) : null;
  const missing = chemTitrationMissing(attemptState, seed);

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
      else if (vw.mode !== 'walk' && k === ' ' && !e.repeat && canRun) {
        e.preventDefault();
        vw.set({ streaming: true });
        t.startStream();
        startPour();
      } else if (vw.mode !== 'walk' && k === 'd' && canRun) {
        t.deliver(DROP, false);
        vw.set({ dropAt: performance.now() });
        play('drip');
      } else if (vw.mode !== 'walk' && k === 'f' && t.open) swirl(t);
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === ' ' && useLabView.getState().streaming && tapLevel(useLabView.getState().tap) !== 'stream') {
        useLabView.getState().set({ streaming: false });
        t.stopStream();
        stopPour();
      }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  });

  const hint = practice && !guided ? nextHint3d(state, scene, t) : null;
  const lowTime = left != null && left < 5 * 60_000;
  const glass = 'border-white/20 bg-black/45 text-white backdrop-blur hover:bg-black/60 hover:text-white';
  // Mrs Ada's line stays up for a while, then the strip tidies itself away (tap her or "What next?" for more).
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
  const askStep = stage === 'learn' ? learnStep : stage === 'demo' ? demo.step.title : (cur?.label ?? null);

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
          aria-label="3D chemistry laboratory"
        >
          <LabScene state={shown.state} scene={shownScene} t={shown.t} v={shown.t.v} guided={guided || stage === 'learn'} interactive={!readOnly && work} onSlow={() => setSlow(true)} />
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
          {!readOnly && (
            <Button size="icon-sm" variant="outline" className={cn('pointer-events-auto', glass)} onClick={() => setSheet('menu')} aria-label="Menu" data-tour="menu">
              <Menu />
            </Button>
          )}
          <div className="min-w-0 truncate whitespace-nowrap rounded-full bg-black/45 px-3 py-1 text-[12.5px] backdrop-blur">
            <span className="font-semibold">Chemistry lab</span>
            <span className="hidden text-white/70 sm:inline"> · {readOnly ? 'your lab record' : stage === 'learn' ? 'learning' : stage === 'demo' ? 'demonstration' : stage === 'sandbox' ? 'sandbox (unmarked)' : camMode === 'walk' ? 'walking' : camMode === 'bench' ? 'at your bench' : 'reading the burette'}</span>
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
          <JourneyBar stage={stage} learned={!!journey.learn} demoed={!!journey.demo} onStage={(x) => (x === 'sandbox' ? setSheet('sandbox') : goStage(x))} onAsk={askOk ? () => setSheet(sheet === 'ask' ? null : 'ask') : undefined} asking={sheet === 'ask'} />
        )}
        {hint && !blocking && work && (
          <p className="mx-auto flex max-w-xl items-start gap-1.5 rounded-xl bg-black/55 px-3 py-1.5 text-[12.5px] leading-snug backdrop-blur">
            <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-amber-300" aria-hidden /> {hint}
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
            {onUse2d && (
              <button type="button" className="font-semibold underline" onClick={onUse2d}>
                Switch to the 2D lab
              </button>
            )}
          </p>
        )}
      </div>

      {/* left: the step checklist (guided practice) */}
      {guided && !intro && !showBriefing && camMode !== 'read' && !(touch && (panel || showLine || sheet)) && (
        <div className="pointer-events-none absolute left-2 top-14 z-[5] sm:left-3 sm:top-16">
          <GuideChecklist steps={steps} compact={touch} />
        </div>
      )}

      {/* bottom: joystick, Mrs Ada, mode buttons, tap controls */}
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
              {camMode === 'bench' && scene.clamped && !readOnly && <TitrationDock t={t} scene={scene} s={state} compact={touch} />}
              <ModeBar canRead={canRead} onRead={goRead} />
            </div>
          )}
        </div>
      )}
      <DragOverlay />
      {stage === 'sandbox' && !intro && !panel && (
        <div className="pointer-events-none absolute right-2 top-[6.5rem] z-[5] sm:right-3 sm:top-28">
          <SandboxResults sandbox={sandbox} />
        </div>
      )}
      {stage === 'learn' && <LearnStage lesson={lesson} practicalId={practicalId ?? ''} onCard={setLearnStep} onClose={() => goStage('try')} onDone={() => (markJourney('learn'), goStage('demo'))} />}
      {stage === 'demo' && !sheet && <DemoPlayer demo={demo} onClose={() => goStage('try')} />}
      {camMode === 'read' && work && !sheet && !debrief && <ReadingPanel t={t} s={state} onBack={() => set({ mode: 'bench', focus: 'burette' })} />}
      {panel && !sheet && camMode !== 'read' && !debrief && (
        <ContextMenu panel={panel} readOnly={readOnly} onClose={() => set({ selected: null })} explain={explained ? { e: explained, lesson: lessonLines(lesson, explained) } : null} />
      )}
      {sheet === 'notebook' && (
        <Panel title="Practical notebook" onClose={() => setSheet(null)}>
          <Notebook v={v} state={state} readOnly={readOnly} update={t.update} book className="border-0 p-0 shadow-none sm:p-0" />
        </Panel>
      )}
      {sheet === 'task' && (
        <Panel title="Task card" onClose={() => setSheet(null)}>
          <TaskBrief v={v} />
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
          <p className="mb-2 text-[13px] text-muted-foreground">Take what you need for this titration to your bench — or drag things from the cupboard onto the tray.</p>
          <CupboardList scene={scene} t={t} />
        </Panel>
      )}
      {sheet === 'ask' && askOk && (
        <Panel title={`Ask ${ASSISTANT_NAME}`} onClose={() => setSheet(null)}>
          <AskPanel practicalId={practicalId!} stage={askStage} step={askStep} attemptId={attemptId} turns={askTurns} setTurns={setAskTurns} indicatorHint={stage === 'try' ? undefined : TITRATION_INDICATOR_INFO[shown.t.v.indicators[0]!].label.toLowerCase()} />
        </Panel>
      )}
      {sheet === 'sandbox' && (
        <Panel title="Sandbox — your own values" onClose={() => setSheet(null)}>
          <SandboxSetupForm
            initial={sandbox.setup}
            onStart={(x) => {
              sandbox.start(x);
              goStage('sandbox');
            }}
          />
        </Panel>
      )}
      {sheet === 'help' && (
        <Panel title="Controls" onClose={() => setSheet(null)}>
          <HelpContent touch={touch} />
          {!readOnly && (
            <Button className="mt-4" variant="brand" onClick={startTour}>
              <Compass /> Replay the lab tour
            </Button>
          )}
        </Panel>
      )}
      {sheet === 'handin' && onHandIn && (
        <Panel title="Hand in your lab?" side="center" onClose={() => setSheet(null)}>
          <HandInCheck
            missing={missing}
            onBack={() => setSheet(null)}
            onHandIn={() => {
              setSheet(null);
              setImmersive(false);
              onHandIn();
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
                <span>{ASSISTANT_NAME} reads her tips aloud</span>
                <Switch checked={prefs.voice} onCheckedChange={(on) => updatePrefs({ voice: on })} />
              </label>
            )}
            {practice && briefed && (
              <Button variant="outline" onClick={() => (setSheet(null), setBriefAgain(true))}>
                <ShieldCheck /> Safety briefing again
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => {
                t.stopStream();
                useLabView.setState({ mode: 'bench', focus: 'bench', selected: null, held: null, pip: 'idle', streaming: false, tap: 0, drag: null, eye: 0.03 });
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
            {onUse2d && (
              <Button variant="outline" onClick={onUse2d}>
                <MonitorSmartphone /> Switch to the 2D lab
              </Button>
            )}
            {onHandIn && (
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
          lessonSafety={lesson?.safety ?? []}
          onDone={() => {
            setBriefAgain(false);
            t.note('safety-briefing:passed');
            updatePrefs({ safetyDone: true });
          }}
          onSkip={() => {
            setBriefAgain(false);
            if (!briefed) t.note('safety-briefing:skipped');
          }}
        />
      )}

      {intro && (
        <div className="absolute inset-0 z-40 grid place-items-center bg-black/45 p-4 backdrop-blur-[2px]">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-2xl sm:p-5">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">3D virtual lab{mode === 'EXAM' ? ' · timed practical' : ''}</p>
            <h2 className="mt-1 font-display text-xl font-semibold tracking-tight">Chemistry laboratory</h2>
            {practice && <p className="mt-2 text-[13.5px] text-muted-foreground">New to this practical? Learn it first, watch {ASSISTANT_NAME} do it, then try it yourself — you can jump to any stage.</p>}
            <p className="mt-2 text-[13.5px] text-muted-foreground sm:hidden">Put on your coat and goggles, collect apparatus, then titrate at your bench.</p>
            <ol className="mt-3 hidden list-decimal space-y-1 pl-5 text-[13.5px] text-muted-foreground sm:block">
              <li>Put on your lab coat and goggles (hooks by the door).</li>
              <li>Collect your apparatus from the cupboard on the right.</li>
              <li>Go to your bench, set up and titrate A against B.</li>
              <li>Read the burette at eye level and record it in your notebook.</li>
            </ol>
            <p className="mt-3 hidden text-[12.5px] text-muted-foreground sm:block">{touch ? 'Joystick to walk, drag to look, tap things to use them.' : 'WASD or arrows to walk, drag to look, click things to use them.'}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {practice && (
                <>
                  <Button variant={journey.learn ? 'outline' : 'brand'} onClick={() => enter('learn')}>
                    <GraduationCap /> 1. Learn first{journey.learn ? ' ✓' : ''}
                  </Button>
                  <Button variant={journey.learn && !journey.demo ? 'brand' : 'outline'} onClick={() => enter('demo')}>
                    <PlayCircle /> 2. Watch {ASSISTANT_NAME}{journey.demo ? ' ✓' : ''}
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
