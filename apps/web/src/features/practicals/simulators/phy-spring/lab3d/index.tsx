import { springReading, type CriterionScore, type PhySpringState, type SpringTask } from '@aischool/shared';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Kbd } from '@/components/ui/kbd';
import { ModeBar } from '../../../lab3d-kit/hud';
import { KitScene } from '../../../lab3d-kit/scene';
import { LabShell, useLabKit, useNewLogEntries } from '../../../lab3d-kit/shell';
import { play } from '../../../lab3d-kit/sound';
import { notify, useLabView } from '../../../lab3d-kit/store';
import { BAYO_SPOT, physicsTour, usePhysicsAssistant } from '../../phy-common/lab3d/common';
import type { SimulatorProps } from '../../types';
import { lessonTask, springHint, useSpring, type Spring } from '../actions';
import { Notebook, SpringTaskText } from '../index';
import { phySpringMissing } from '../missing';
import { SpringDock, SpringDragFeedback, SpringReadingPanel } from './bench-hud';
import { BENCH_IDLE, useBench } from './bench-store';
import { ASK_SUGGESTIONS, explainer, learnConfig, learnState } from './content';
import { demoSeed } from './demo';
import { useSpringDemo } from './demo-hook';
import { DragController } from './drag';
import { correctionFor, guideSteps } from './guide';
import { makeOps, objectPanel, type ActionCtx } from './lab-actions';
import { SPRING_SAFETY } from './safety';
import { SandboxResults, SandboxSetupForm, useSandbox } from './sandbox';
import { APPARATUS, APPARATUS_LABEL, sceneFromState, type ApparatusId, type SceneState } from './scene-state';
import { SpringCupboard, Station } from './station';
import { readPoint, SPRING_VIEWS, springRoom, VIEW_BUTTONS } from './views';

/**
 * The 3D physics laboratory: the spiral spring on a retort stand (Hooke's law,
 * or the oscillations of a loaded spring), on the shared lab kit — the same
 * state, actions and marks as the 2D lab. The student collects the stand, the
 * spring, the rule and pointer (or the stopwatch and fiducial pointer), the
 * hanger and the slotted masses, sets them up at the bench edge, then loads
 * the spring in 50 g steps reading the pointer at eye level (it bounces until
 * steadied), or times 20 oscillations of each mass on the stopwatch; then
 * plots e against W or T² against m and finds k.
 */

const noop = () => undefined;
const TOURS: Record<SpringTask, ReturnType<typeof physicsTour>> = {
  HOOKE: physicsTour({
    focusId: 'spring',
    focusLabel: 'Spiral spring',
    readLabel: 'Read the pointer',
    readText: '“Read the pointer” puts your eye beside the pointer’s tip on the metre rule. Raise or lower your eye until it is level with the pointer, then read the rule to 0.1 cm.',
    taskText: 'The task card is the question paper: the loads to use and what to plot. Open it now.',
  }),
  OSC: physicsTour({
    focusId: 'spring',
    focusLabel: 'Spiral spring',
    readLabel: 'Close-up',
    readText: 'The close-up views show the hanger and the fiducial mark, and the stopwatch. Start and stop the watch as the hanger passes the mark.',
    taskText: 'The task card is the question paper: the masses to use and what to plot. Open it now.',
  }),
};
const HELP_ROWS: [string, React.ReactNode][] = [
  ['Load the spring', <>The dock’s <Kbd>+</Kbd> 50 g / <Kbd>−</Kbd> 50 g, or the masses’ menu</>],
  ['Steady it', <><Kbd>H</Kbd> or “Steady it”: stops the bounce before you read</>],
  ['Oscillate', 'Drag the hanger down and let go, or the dock’s “Pull down and release”'],
  ['Stopwatch', <><Kbd>S</Kbd> start / stop, <Kbd>Enter</Kbd> records the timing</>],
];
const CUPBOARD_ITEMS = APPARATUS.map((a) => ({ id: a.id, label: a.label }));
const TASK_LINES: Record<SpringTask, string[]> = {
  HOOKE: ['R₀ with no load.', 'Load 50, 100 … 300 g: read R.', 'Unload one at a time: read R.', 'Plot e against W: k = 1/slope.'],
  OSC: ['m = 0.10, 0.15, 0.20, 0.30, 0.40 kg.', 'Pull down 1–2 cm, release.', 'Time 20 oscillations, twice.', 'Plot T² against m: k = 4π²/slope.'],
};

function LabScene({ o, state, scene, guided, interactive, onSlow }: { o: Spring; state: PhySpringState; scene: SceneState; guided: boolean; interactive: boolean; onSlow: () => void }) {
  const task: SpringTask = state.task ?? 'HOOKE';
  const room = useMemo(() => springRoom(task), [task]);
  const read = readPoint(springReading(o.v, state.load, state.peak));
  return (
    <KitScene room={room} coatOn={scene.coat} gogglesOn={false} presets={SPRING_VIEWS} read={read} guided={guided} onSlow={onSlow} assistantSpot={BAYO_SPOT}>
      <SpringCupboard scene={scene} />
      <Station o={o} state={state} scene={scene} interactive={interactive} card={TASK_LINES[task]} />
      {interactive && <DragController o={o} />}
    </KitScene>
  );
}

export default function PhySpringLab3D(props: SimulatorProps<'phy-spring'>) {
  usePhysicsAssistant();
  const { seed, mode, state: attemptState, onChange, readOnly, startedAt, endsAt, onHandIn, onUse2d, practicalId, attemptId, result } = props;
  const started = attemptState.log.some((e) => !e.a.startsWith('safety-briefing') && !e.a.startsWith('task:'));
  const oAttempt = useSpring({ seed, state: attemptState, onChange, readOnly, startedAt, practicalId });
  const task: SpringTask = attemptState.task ?? lessonTask(practicalId);
  const sandbox = useSandbox(startedAt, task);
  const stopRef = useRef<() => void>(noop);
  const kit = useLabKit({
    mode,
    readOnly,
    practicalId,
    result,
    started,
    onStageChange: () => {
      stopRef.current();
      useBench.setState(BENCH_IDLE);
    },
  });
  const { stage, work, guided, practice } = kit;
  // Learn shows Mr Bayo's own spring (the demo's seed), never the student's.
  const learnSeed = demoSeed(seed);
  const LEARN = useMemo(() => learnState(task), [task]);
  const LEARN_CONFIG = useMemo(() => learnConfig(task), [task]);
  const oLearn = useSpring({ seed: learnSeed, state: LEARN, onChange: noop, readOnly: true, startedAt, autoTask: false });
  const precautions = useMemo(() => kit.lesson?.precautions ?? [], [kit.lesson]);
  const demo = useSpringDemo({ task, studentSeed: seed, startedAt, precautions, active: stage === 'demo', onFinished: () => kit.markJourney('demo') });
  const o = stage === 'sandbox' ? sandbox.o : oAttempt;
  stopRef.current = () => o.steady();
  const state = stage === 'sandbox' ? sandbox.state : attemptState;
  const scene = useMemo(() => sceneFromState(state), [state]);
  const shown = stage === 'learn' ? { o: oLearn, state: LEARN } : stage === 'demo' ? { o: demo.o, state: demo.state } : { o, state };
  const shownScene = useMemo(() => sceneFromState(shown.state), [shown.state]);
  const ops = makeOps(o);
  const camMode = useLabView((v) => v.mode);
  useEffect(() => () => useBench.setState(BENCH_IDLE), []);

  // ---- guidance
  const steps = useMemo(() => (guided ? guideSteps(state, scene, camMode, o.motion, o.watch) : []), [guided, state, scene, camMode, o.motion, o.watch]);
  useNewLogEntries(state.log, stage, (fresh) => {
    if (!guided || !fresh.length) return;
    let found = null;
    for (const e of fresh) found = correctionFor(e.a, state, o.v) ?? found;
    if (found) kit.correct(found);
  });

  if (import.meta.env.DEV) Object.assign(window, { __lab3dState: attemptState, __lab3dShown: shown.state, __lab3dStage: stage, __lab3dSandbox: sandbox.state, __springBench: useBench, __springOps: ops, __spring: o });
  const ctx: ActionCtx = { o, s: state, scene, ops, open: (w) => (useLabView.getState().set({ selected: null }), kit.setSheet(w)) };
  const onCarry = useCallback(
    (id: string) => {
      o.note(`collect:${id}`);
      notify(`${APPARATUS_LABEL[id as ApparatusId]} is on your bench.`, 'success', 1500);
    },
    [o],
  );
  const osc = task === 'OSC';
  const canRead = scene.set && !osc;
  const onKey = (e: KeyboardEvent, type: 'down' | 'up') => {
    if (type === 'up' || useLabView.getState().mode === 'walk' || !scene.set) return false;
    const k = e.key.toLowerCase();
    if (k === '+' || k === '=') ops.addMass();
    else if (k === '-') ops.removeMass();
    else if (k === 'h') ops.steady();
    else if (osc && k === 's') ops.watch();
    else if (osc && k === 'enter' && o.watch.stop !== null) ops.record();
    else if (osc && k === ' ') {
      e.preventDefault();
      if (o.motion) ops.steady();
      else ops.release();
    } else if (!osc && k === 'enter') ops.take();
    else return false;
    play('tick');
    return true;
  };
  const debriefView = (c: CriterionScore) => (c.id === 'care' || c.id === 'procedure' ? { mode: 'bench' as const, focus: 'spring' } : c.id === 'readings' ? { mode: 'bench' as const, focus: osc ? 'stopwatch' : 'load', notebook: true } : { mode: 'bench' as const, focus: 'bench', notebook: true });
  const what = osc ? 'oscillations of a loaded spring' : 'Hooke’s law and the spring constant';

  return (
    <LabShell
      kit={kit}
      title="Physics lab"
      heading={`Physics laboratory — ${what}`}
      intro={{
        short: osc ? 'Time the vertical oscillations of a loaded spring for five masses, and find k from T² against m.' : 'Load a spiral spring in 50 g steps, read the pointer at eye level, and find k from e against W.',
        steps: osc
          ? ['Collect the stand and clamp, the spring, the hanger and slotted masses, a stopwatch and the fiducial pointer.', 'At your bench set the stand at the edge, hang the spring and clamp the fiducial pointer at the rest position.', 'Hang 0.100 kg, pull it down 1–2 cm and release; time 20 oscillations from the mark, twice.', 'Repeat for five masses, then plot T² against m and find k = 4π²/slope.']
          : ['Collect the stand and clamps, the spring, a metre rule, a pointer, the hanger and slotted masses.', 'At your bench set the stand at the edge, hang the spring, clamp the rule vertically and fix the pointer.', 'Read R₀ with no load, then load 50 g at a time — steady the spring and read the pointer at eye level each time — and unload.', 'Plot e against W and find k = 1/slope.'],
      }}
      readingStatus="reading the pointer"
      scene={<LabScene o={shown.o} state={shown.state} scene={shownScene} guided={guided || stage === 'learn'} interactive={!readOnly && work} onSlow={kit.onSlow} />}
      endsAt={endsAt}
      onHandIn={onHandIn}
      onUse2d={onUse2d}
      attemptId={attemptId}
      steps={steps}
      hint={practice && !guided ? (!scene.ready ? `Collect your apparatus from the cupboard (${scene.missing.length} to go).` : !scene.set ? 'Set up the spring (the dock’s button).' : springHint(state, o.motionRef.current, o.watch, o.v, o.now())) : null}
      objectPanel={(id) => objectPanel(id, ctx)}
      explain={explainer}
      task={
        <div className="space-y-2 text-[13.5px] leading-relaxed">
          <SpringTaskText task={state.task} />
        </div>
      }
      notebook={<Notebook task={state.task ?? task} state={state} readOnly={readOnly} update={o.update} removeRow={o.removeRow} removeRun={o.removeRun} />}
      cupboard={{
        blurb: `Take what you need for ${what} to your bench — or drag things from the cupboard onto the tray.`,
        items: CUPBOARD_ITEMS,
        has: (id) => scene.collected.has(id as ApparatusId),
        onToggle: (id, take) => o.note(`${take ? 'collect' : 'return'}:${id}`),
        onCarry,
      }}
      dock={scene.ready ? <SpringDock o={o} s={state} scene={scene} ops={ops} compact={kit.touch} lab={mode === 'LAB'} /> : null}
      modeBar={<ModeBar views={VIEW_BUTTONS(task)} read={{ label: 'Read the pointer', can: canRead }} onRead={() => canRead && (useLabView.getState().set({ mode: 'read', selected: null, spot: null }), kit.setSheet(null))} />}
      readingPanel={<SpringReadingPanel o={o} s={state} ops={ops} onBack={() => useLabView.getState().set({ mode: 'bench', focus: 'load', spot: null })} />}
      canRead={canRead}
      dragFeedback={(drag) => <SpringDragFeedback drag={drag} />}
      learn={LEARN_CONFIG}
      demo={demo.player}
      demoPanel={demo.panel}
      sandbox={{
        form: (
          <SandboxSetupForm
            initial={sandbox.setup}
            onStart={(x) => {
              sandbox.start(x);
              kit.goStage('sandbox');
            }}
          />
        ),
        results: <SandboxResults sandbox={sandbox} />,
      }}
      ask={{ suggestions: ASK_SUGGESTIONS, extra: stage === 'try' ? undefined : osc ? 'Why is T² against m a straight line?' : 'Why must the spring stay within its elastic limit?' }}
      tourSteps={TOURS[task]}
      safety={SPRING_SAFETY}
      briefed={attemptState.log.some((e) => e.a.startsWith('safety-briefing'))}
      onBriefing={(outcome) => oAttempt.note(`safety-briefing:${outcome}`)}
      missing={phySpringMissing(attemptState, seed)}
      helpRows={HELP_ROWS}
      onResetStation={() => {
        o.steady();
        useBench.setState(BENCH_IDLE);
      }}
      onKey={onKey}
      debriefView={debriefView}
    />
  );
}
