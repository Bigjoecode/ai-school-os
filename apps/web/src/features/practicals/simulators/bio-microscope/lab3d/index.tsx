import { MICRO_PRACTICAL_SLIDES, MICRO_SLIDES, MICRO_SLIDE_INFO, emptyBioMicroscopeState, type BioMicroscopeState, type CriterionScore, type MicroSlide } from '@aischool/shared';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { ModeBar } from '../../../lab3d-kit/hud';
import { LabShell, useLabKit, useNewLogEntries } from '../../../lab3d-kit/shell';
import { play } from '../../../lab3d-kit/sound';
import { notify, useLabView } from '../../../lab3d-kit/store';
import { bioSafety, bioTour, useBioAssistant } from '../../bio-common/lab3d/common';
import type { SimulatorProps } from '../../types';
import { useMicroscope } from '../actions';
import { bioMicroscopeMissing } from '../missing';
import { Notebook } from '../notebook';
import { ASK_SUGGESTIONS, LEARN_CONFIG, explainer, learnState } from './content';
import { useMicroscopeDemo } from './demo';
import { EyepieceView, MicroDragFeedback } from './eyepiece';
import { COARSE_AT_HIGH, correctionFor, guideSteps } from './guide';
import { nextHint3d, objectPanel, scopeActions } from './lab-actions';
import { SandboxResults, SandboxSetupForm, useSandbox } from './sandbox';
import { LabScene } from './scene';
import { APPARATUS_LABEL, cupboardItems, sceneFromState, type ApparatusId } from './scene-state';
import { BENCH_IDLE, MICRO_VIEW_BUTTONS, useBench } from './spots';

/**
 * The 3D biology laboratory: the light-microscope practical on the shared 3D
 * lab kit, with the same state, actions and marks as the 2D lab. The student
 * puts on a coat, collects a microscope and the slide-making apparatus, makes
 * a temporary mount on the white tile (a drop of the right liquid, the
 * specimen, the cover slip lowered at an angle with the needle, blotted),
 * clips it on the stage, then works the real controls — lamp, diaphragm,
 * nosepiece, coarse and fine focus — and looks down the eyepiece at the field
 * of view the 2D lab draws, captures views, and labels and measures them in
 * the notebook; then disposes of the slide and washes their hands.
 */

const HELP_ROWS: [string, React.ReactNode][] = [
  ['Look through the eyepiece', <><Kbd>R</Kbd> (or “Eyepiece”), then <Kbd>↑</Kbd> <Kbd>↓</Kbd> fine focus, <Kbd>PgUp</Kbd> <Kbd>PgDn</Kbd> coarse, <Kbd>C</Kbd> capture</>],
  ['Knobs and levers', 'Drag the coarse / fine knobs up or down, the diaphragm lever and nosepiece sideways — or select them for buttons'],
];
const TOUR = bioTour({
  focusId: 'scope',
  focusLabel: 'Microscope',
  readLabel: 'Eyepiece',
  readText: 'Once your slide is on the stage, “Eyepiece” shows what you see through the microscope: focus, light and Capture are there too.',
  task: 'The task card says what to prepare and what to measure, with the values you are given (the eyepiece, the field of view).',
});
const SAFETY = bioSafety('microscope');

function TaskBrief({ slide, v }: { slide: MicroSlide; v: ReturnType<typeof useMicroscope>['v'] }) {
  const info = MICRO_SLIDE_INFO[slide];
  return (
    <div className="space-y-2 text-[13.5px] leading-relaxed">
      <p className="font-semibold">{info.title}</p>
      <p>{info.prepare}</p>
      <p>
        Examine the slide under low power, then at ×{info.labelObjective}. Capture a sharp view at ×{info.measureObjective} to measure from{info.labelObjective !== info.measureObjective ? ` and one at ×${info.labelObjective} to label` : ' and label'}. Then answer:
      </p>
      {v && (
        <>
          <ol className="list-[lower-roman] space-y-0.5 pl-6">
            {v.tasks.map((t) => (
              <li key={t.id}>{t.label}</li>
            ))}
          </ol>
          <ul className="space-y-0.5 text-muted-foreground">
            {v.given.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export default function BioMicroscopeLab3D(props: SimulatorProps<'bio-microscope'>) {
  useBioAssistant();
  const { seed, mode, state: attemptState, onChange, readOnly, startedAt, endsAt, onHandIn, onUse2d, practicalId, attemptId, result } = props;
  const started = attemptState.log.some((e) => !e.a.startsWith('safety-briefing') && !e.a.startsWith('slide:'));
  const mAttempt = useMicroscope({ seed, state: attemptState, onChange, readOnly, startedAt });
  const fromLesson = practicalId ? MICRO_PRACTICAL_SLIDES[practicalId] : undefined;
  // The slide the lesson uses, as the 2D lab sets it.
  useEffect(() => {
    if (!readOnly && !mAttempt.ref.current.slide && fromLesson) mAttempt.update((s) => ({ ...s, slide: fromLesson }), `slide:${fromLesson}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromLesson, readOnly]);
  const slide = attemptState.slide ?? fromLesson ?? null;
  const kit = useLabKit({ mode, readOnly, practicalId, result, started, onStageChange: () => useBench.setState(BENCH_IDLE) });
  const { stage, work, guided, practice } = kit;
  const sandbox = useSandbox(startedAt, slide ?? 'ONION');
  const learn = useMemo(() => learnState(slide ?? 'ONION'), [slide]);
  const mLearn = useMicroscope({ seed, state: learn, onChange: () => undefined, readOnly: true, startedAt });
  const demo = useMicroscopeDemo({ studentSeed: seed, slide, startedAt, active: stage === 'demo', onFinished: () => kit.markJourney('demo') });
  // Try and the sandbox share the bench UI; Learn and the demo show their own bench.
  const m = stage === 'sandbox' ? sandbox.m : mAttempt;
  const state = stage === 'sandbox' ? sandbox.state : attemptState;
  const scene = useMemo(() => sceneFromState(state), [state]);
  const shown = stage === 'learn' ? { m: mLearn, state: learn } : stage === 'demo' ? { m: demo.m, state: demo.state } : { m, state };
  const shownScene = useMemo(() => sceneFromState(shown.state), [shown.state]);
  const camMode = useLabView((x) => x.mode);
  useLabView((x) => x.held);
  useEffect(() => () => useBench.setState(BENCH_IDLE), []);
  const v = m.v;

  // ---- guidance: steps, and corrections for what was just recorded
  const steps = useMemo(() => (guided && v && state.slide ? guideSteps(state, scene, camMode, v) : []), [guided, state, scene, camMode, v]);
  useNewLogEntries(state.log, stage, (fresh) => {
    if (!guided || !fresh.length || !v) return;
    let found = null;
    for (const e of fresh) found = correctionFor(e.a, state, v) ?? found;
    if (found) kit.correct(found);
  });
  // The coarse knob at ×40 is counted in the flags, not the log.
  const coarseSeen = useRef({ n: state.flags.coarseAtHigh, stage, at: 0 });
  useEffect(() => {
    const c = coarseSeen.current;
    const n = state.flags.coarseAtHigh;
    if (c.stage !== stage) Object.assign(c, { stage, n });
    else if (n > c.n) {
      c.n = n;
      if (guided && Date.now() - c.at > 8000) {
        c.at = Date.now();
        kit.correct(COARSE_AT_HIGH);
      }
    }
  }, [state.flags.coarseAtHigh, stage, guided, kit]);

  if (import.meta.env.DEV) Object.assign(window, { __lab3dState: attemptState, __lab3dShown: shown.state, __lab3dStage: stage });
  const look = () => {
    if (!scene.collected.has('microscope')) return notify('Get a microscope from the cupboard first.', 'warning');
    useLabView.getState().set({ mode: 'read', selected: null });
    kit.setSheet(null);
  };
  const ctx = { m, s: state, scene, open: (w: 'notebook' | 'task' | 'cupboard') => (useLabView.getState().set({ selected: null }), kit.setSheet(w)), look };
  const onCarry = useCallback(
    (id: string) => {
      m.note(`collect:${id}`);
      notify(`${APPARATUS_LABEL[id as ApparatusId]} is on your bench.`, 'success', 1500);
    },
    [m],
  );
  const canRead = scene.collected.has('microscope');
  const onKey = (e: KeyboardEvent, type: 'down' | 'up') => {
    if (type === 'up' || readOnly) return false;
    const vw = useLabView.getState();
    const k = e.key.toLowerCase();
    const act = scopeActions(m, state);
    if (vw.mode === 'read') {
      if (k === 'arrowup') act.fine(0.02);
      else if (k === 'arrowdown') act.fine(-0.02);
      else if (k === 'pageup') act.coarse(0.5);
      else if (k === 'pagedown') act.coarse(-0.5);
      else if (k === 'c' && state.prep.placed) (play('tick'), m.capture());
      else return false;
      e.preventDefault();
      return true;
    }
    if (vw.mode === 'bench' && k === 'e') return (look(), true);
    return false;
  };
  const debriefView = (c: CriterionScore) =>
    c.id === 'procedure' ? { mode: 'bench' as const, focus: 'prep' } : c.id === 'image' ? { mode: 'read' as const } : { mode: 'bench' as const, focus: 'bench', notebook: true };
  const labelCap = v ? (state.captures.find((c) => c.objective === v.info.labelObjective) ?? null) : null;
  const measureCap = v ? (state.captures.find((c) => c.objective === v.info.measureObjective) ?? null) : null;
  const needsSlide = !attemptState.slide && !fromLesson && stage !== 'sandbox';

  return (
    <div className="relative">
      <LabShell
        kit={kit}
        title="Biology lab"
        heading="Biology laboratory — the light microscope"
        intro={{
          short: 'Coat on, collect a microscope, make your slide, then focus, capture and record.',
          steps: ['Put on your lab coat (hooks by the door).', 'Collect a microscope and the slide-making apparatus from the cupboard.', 'Make your slide at your bench: drop, specimen, cover slip at an angle.', 'Focus at low power first, look through the eyepiece, capture, label and measure.'],
        }}
        readingStatus="looking through the eyepiece"
        scene={<LabScene state={shown.state} scene={shownScene} m={shown.m} guided={guided || stage === 'learn'} interactive={!readOnly && work} readOnly={readOnly} onSlow={kit.onSlow} />}
        endsAt={endsAt}
        onHandIn={onHandIn}
        onUse2d={onUse2d}
        attemptId={attemptId}
        steps={steps}
        hint={practice && !guided ? nextHint3d(state, scene, m) : null}
        objectPanel={(id) => (state.slide ? objectPanel(id, ctx) : null)}
        explain={explainer}
        task={
          <>
            {state.slide ? <TaskBrief slide={state.slide} v={v} /> : <p className="text-[13.5px] text-muted-foreground">No slide chosen yet.</p>}
            <p className="mt-4 text-[12.5px] font-semibold">Safety</p>
            <p className="text-[13px] text-muted-foreground">Lab coat: {scene.coat ? 'on' : 'not on'} · Hands washed at the end: {scene.washedAtEnd ? 'yes' : 'not yet'}</p>
          </>
        }
        notebook={v && state.slide ? <Notebook v={v} state={state} readOnly={readOnly} update={m.update} labelCap={labelCap} measureCap={measureCap} fieldBase={{ v, medium: state.prep.medium, coverslip: state.prep.coverslip, placed: state.prep.placed, crashed: state.flags.crashed }} className="border-0 p-0 shadow-none sm:p-0" /> : <p className="text-[13.5px] text-muted-foreground">Choose a slide first.</p>}
        cupboard={{
          blurb: 'Take what you need for this slide to your bench — or drag things from the cupboard onto the tray.',
          items: cupboardItems(state.slide).map((id) => ({ id, label: APPARATUS_LABEL[id] })),
          has: (id) => scene.collected.has(id as ApparatusId),
          onToggle: (id, take) => m.note(`${take ? 'collect' : 'return'}:${id}`),
          onCarry,
        }}
        modeBar={<ModeBar views={MICRO_VIEW_BUTTONS} read={{ label: 'Eyepiece', can: canRead }} onRead={look} />}
        readingPanel={<EyepieceView m={m} s={state} scene={scene} readOnly={readOnly} onBack={() => useLabView.getState().set({ mode: 'bench', focus: 'scope' })} />}
        canRead={canRead}
        dragFeedback={(drag) => <MicroDragFeedback drag={drag} s={state} />}
        learn={LEARN_CONFIG}
        demo={demo.player}
        demoPanel={demo.panel}
        sandbox={{
          form: (
            <SandboxSetupForm
              initial={sandbox.slide}
              onStart={(x) => {
                sandbox.start(x);
                kit.goStage('sandbox');
              }}
            />
          ),
          results: <SandboxResults sandbox={sandbox} />,
        }}
        ask={{ suggestions: ASK_SUGGESTIONS, extra: slide ? `What should I see on a slide of ${MICRO_SLIDE_INFO[slide].title.toLowerCase()}?` : undefined }}
        tourSteps={TOUR}
        safety={SAFETY}
        briefed={attemptState.log.some((e) => e.a.startsWith('safety-briefing'))}
        onBriefing={(outcome) => mAttempt.note(`safety-briefing:${outcome}`)}
        missing={bioMicroscopeMissing(attemptState, seed)}
        helpRows={HELP_ROWS}
        onResetStation={() => useBench.setState(BENCH_IDLE)}
        onKey={onKey}
        debriefView={debriefView}
      />
      {needsSlide && !kit.intro && (
        <div className="absolute inset-0 z-40 grid place-items-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-card p-4 text-card-foreground shadow-2xl">
            <p className="font-display text-lg font-semibold">Choose a slide</p>
            <p className="mb-3 text-[13px] text-muted-foreground">{readOnly ? 'No slide was chosen.' : 'Which specimen will you examine?'}</p>
            {!readOnly && (
              <div className="grid gap-1.5 sm:grid-cols-2">
                {MICRO_SLIDES.map((sl) => (
                  <Button key={sl} variant="outline" className="h-auto justify-start whitespace-normal py-2 text-left" onClick={() => mAttempt.update((s: BioMicroscopeState) => ({ ...emptyBioMicroscopeState(), log: s.log, slide: sl }), `slide:${sl}`)}>
                    {MICRO_SLIDE_INFO[sl].title}
                  </Button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
