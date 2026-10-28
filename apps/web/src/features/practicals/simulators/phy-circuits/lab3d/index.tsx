import { CIRCUITS_AMMETER_FSD, CIRCUITS_VOLTMETER_FSD, GALVO_DIVS, type CircuitsMeters, type CircuitsTask, type CircuitsTerminal, type CriterionScore, type PhyCircuitsState } from '@aischool/shared';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Kbd } from '@/components/ui/kbd';
import { ModeBar } from '../../../lab3d-kit/hud';
import { STATION } from '../../../lab3d-kit/layout';
import { KitScene } from '../../../lab3d-kit/scene';
import { LabShell, useLabKit, useNewLogEntries } from '../../../lab3d-kit/shell';
import { play } from '../../../lab3d-kit/sound';
import { notify, useLabView } from '../../../lab3d-kit/store';
import { BAYO_SPOT, physicsTour, usePhysicsAssistant } from '../../phy-common/lab3d/common';
import type { SimulatorProps } from '../../types';
import { TASK_NAME, lessonTask, liveMeters, useCircuits, type Circuits } from '../actions';
import { CircuitsTaskText, Notebook } from '../index';
import { phyCircuitsMissing } from '../missing';
import { CircuitsDock, CircuitsDragFeedback, ReadingPanel } from './bench-hud';
import { BENCH_IDLE, useBench, type ReadTarget } from './bench-store';
import { ASK_SUGGESTIONS, CIRCUITS_VIEWS, circuitsRoom, explainer, learnConfig, learnState, viewButtons } from './content';
import { demoSeed } from './demo';
import { useCircuitsDemo } from './demo-hook';
import { DragController, type DragCtx } from './drag';
import { correctionFor, guideSteps } from './guide';
import { FACE, METER, PART } from './layout';
import { joinWire, nextHint3d, objectPanel, type ActionCtx } from './lab-actions';
import { CIRCUITS_SAFETY } from './safety';
import { SandboxResults, SandboxSetupForm, useSandbox } from './sandbox';
import { APPARATUS, APPARATUS_LABEL, sceneFromState, type ApparatusId, type SceneState } from './scene-state';
import { Cupboard, Station } from './station';

/**
 * The 3D physics laboratory for current electricity — the metre bridge, the
 * e.m.f. and internal resistance of a cell, and resistors in series and
 * parallel — on the shared lab kit and the Ohm's-law lab's circuit board:
 * the same state, actions and marks as the 2D lab. The student collects the
 * apparatus, joins the wires terminal to terminal, closes the key, taps the
 * jockey or reads the analogue meters face on, and records everything in the
 * notebook. Journey: Learn → Mr Bayo's demo → Try (plus an unmarked
 * sandbox); timed practicals are Try only.
 */

const noop = () => undefined;
const TOURS: Record<CircuitsTask, ReturnType<typeof physicsTour>> = {
  BRIDGE: physicsTour({ focusId: 'bridge', focusLabel: 'Bridge', readLabel: 'Watch galvanometer', readText: '“Watch galvanometer” puts your eye in front of its centre-zero scale. Tap the jockey and see which way it kicks: no kick means balance.', taskText: 'The task card is the question paper: what to connect, the readings to take and what to plot. Open it now.' }),
  EMF: physicsTour({ focusId: 'voltmeter', focusLabel: 'Voltmeter', readLabel: 'Read meters', readText: '“Read meters” puts your eye straight in front of the pointer. Read it to half a division — and see how it seems to move when your eye is above or below it (parallax).', taskText: 'The task card is the question paper: what to connect, the currents to use and what to plot. Open it now.' }),
  SERIES: physicsTour({ focusId: 'ammeter', focusLabel: 'Ammeter', readLabel: 'Read meters', readText: '“Read meters” puts your eye straight in front of the pointer. Read it to half a division — and see how it seems to move when your eye is above or below it (parallax).', taskText: 'The task card is the question paper: the four arrangements to measure and what to compare. Open it now.' }),
};
const HELP_ROWS: [string, React.ReactNode][] = [
  ['Join a wire', 'Drag from one terminal post to another (or select a terminal: “Start a wire here”)'],
  ['Key, reading', <><Kbd>K</Kbd> opens / closes the key, <Kbd>Enter</Kbd> takes the reading</>],
  ['Metre bridge', <><Kbd>←</Kbd> / <Kbd>→</Kbd> move the jockey 0.1 cm, <Kbd>T</Kbd> taps it on the wire</>],
  ['Meters', <><Kbd>R</Kbd> read at eye level, ↑ / ↓ to move your eye</>],
];
const CUPBOARD_ITEMS = APPARATUS.map((a) => ({ id: a.id, label: a.label }));

/** Where the eye-level view looks: the tip of the chosen meter's pointer. */
function readPoint(meter: ReadTarget, m: CircuitsMeters, touching: boolean): [number, number, number] {
  const p = meter === 'A' ? PART.ammeter : meter === 'V' ? PART.voltmeter : PART.galvanometer;
  let deg: number;
  if (meter === 'G' || meter === 'L') deg = ((Math.max(-1.06, Math.min(1.06, (touching ? m.galvo : 0) / GALVO_DIVS)) * 50 * Math.PI) / 180);
  else {
    const fsd = meter === 'A' ? CIRCUITS_AMMETER_FSD : CIRCUITS_VOLTMETER_FSD;
    const val = meter === 'A' ? (m.overI ? fsd * 1.04 : m.backI ? -0.03 * fsd : m.I) : m.overV ? fsd * 1.04 : m.backV ? -0.03 * fsd : m.V;
    deg = ((-50 + 100 * Math.max(-0.03, Math.min(1.04, val / fsd))) * Math.PI) / 180;
  }
  const pivotY = FACE.cy - FACE.h / 2 + (40 / 384) * FACE.h;
  const r = 0.085;
  return [STATION[0] + p[0] + r * Math.sin(deg), STATION[1] + p[1] + pivotY + r * Math.cos(deg), STATION[2] + p[2] + METER.d / 2 + 0.001];
}

function LabScene({ o, state, scene, guided, interactive, onSlow, drag }: { o: Circuits; state: PhyCircuitsState; scene: SceneState; guided: boolean; interactive: boolean; onSlow: () => void; drag: DragCtx }) {
  const meter = useBench((b) => b.meter);
  const task: CircuitsTask = state.task ?? 'BRIDGE';
  const room = useMemo(() => circuitsRoom(task), [task]);
  const meters = liveMeters(o.v, state, o.touching);
  return (
    <KitScene room={room} coatOn={scene.coat} gogglesOn={false} presets={CIRCUITS_VIEWS} read={readPoint(task === 'BRIDGE' ? 'G' : meter, meters, o.touching)} guided={guided} onSlow={onSlow} assistantSpot={BAYO_SPOT}>
      <Cupboard scene={scene} />
      <Station state={state} scene={scene} meters={meters} touching={o.touching} interactive={interactive} board={o.board} />
      {interactive && <DragController {...drag} />}
    </KitScene>
  );
}

export default function PhyCircuitsLab3D(props: SimulatorProps<'phy-circuits'>) {
  usePhysicsAssistant();
  const { seed, mode, state: attemptState, onChange, readOnly, startedAt, endsAt, onHandIn, onUse2d, practicalId, attemptId, result } = props;
  const started = attemptState.log.some((e) => !e.a.startsWith('safety-briefing') && !e.a.startsWith('task:'));
  const oAttempt = useCircuits({ seed, state: attemptState, onChange, readOnly, startedAt, practicalId });
  const task: CircuitsTask = attemptState.task ?? lessonTask(practicalId);
  const sandbox = useSandbox(startedAt, task);
  const kit = useLabKit({ mode, readOnly, practicalId, result, started, onStageChange: () => useBench.setState({ picked: null }) });
  const { stage, work, guided, practice } = kit;
  // Learn shows Mr Bayo's own bench (the demo's seed), never the student's.
  const LEARN = useMemo(() => learnState(task), [task]);
  const LEARN_CONFIG = useMemo(() => learnConfig(task), [task]);
  const oLearn = useCircuits({ seed: demoSeed(seed), state: LEARN, onChange: noop, readOnly: true, startedAt, autoTask: false });
  const demo = useCircuitsDemo({ studentSeed: seed, startedAt, task, active: stage === 'demo', onFinished: () => kit.markJourney('demo') });
  const o = stage === 'sandbox' ? sandbox.o : oAttempt;
  const state = stage === 'sandbox' ? sandbox.state : attemptState;
  const scene = useMemo(() => sceneFromState(state), [state]);
  const shown = stage === 'learn' ? { o: oLearn, state: LEARN } : stage === 'demo' ? { o: demo.o, state: demo.state } : { o, state };
  const shownScene = useMemo(() => sceneFromState(shown.state), [shown.state]);
  const camMode = useLabView((v) => v.mode);
  useBench((b) => b.picked);
  useEffect(() => () => useBench.setState(BENCH_IDLE), []);
  useEffect(() => useBench.setState({ meter: task === 'BRIDGE' ? 'G' : 'A' }), [task]);

  // ---- guidance
  const v = o.v;
  const steps = useMemo(() => (guided ? guideSteps(state, scene, camMode, v) : []), [guided, state, scene, camMode, v]);
  useNewLogEntries(state.log, stage, (fresh) => {
    if (!guided || !fresh.length) return;
    let found = null;
    for (const e of fresh) found = correctionFor(e.a, state, v) ?? found;
    if (found) kit.correct(found);
  });

  if (import.meta.env.DEV) Object.assign(window, { __lab3dState: attemptState, __lab3dShown: shown.state, __lab3dStage: stage, __lab3dSandbox: sandbox.state, __circuits: o, __circuitsBench: useBench });
  const open = (w: 'notebook' | 'task' | 'cupboard') => (useLabView.getState().set({ selected: null }), kit.setSheet(w));
  const ctx: ActionCtx = { o, s: state, scene, open };
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  const onCarry = useCallback((id: string) => {
    ctxRef.current.o.note(`collect:${id}`);
    notify(`${APPARATUS_LABEL[id as ApparatusId]} is on your bench.`, 'success', 1500);
  }, []);
  const canRead = task === 'BRIDGE' ? scene.collected.has('galvanometer') : scene.collected.has('ammeter') || scene.collected.has('voltmeter');
  const onKey = (e: KeyboardEvent, type: 'down' | 'up') => {
    if (type === 'up') return false;
    const k = e.key.toLowerCase();
    if (useLabView.getState().mode === 'walk') return false;
    if (k === 'k' && scene.collected.has('key')) {
      o.toggleKey();
      play('clink');
    } else if (k === 'enter' && state.key) {
      o.takeReading();
      play('success');
    } else if (task === 'BRIDGE' && scene.collected.has('bridge') && (k === 'arrowleft' || k === 'arrowright')) o.setJockey(state.jockey + (k === 'arrowleft' ? -0.1 : 0.1));
    else if (task === 'BRIDGE' && scene.collected.has('bridge') && k === 't') {
      o.tap();
      play('tick');
    } else return false;
    return true;
  };
  const debriefView = (c: CriterionScore) =>
    c.id === 'circuit' || c.id === 'care' ? { mode: 'bench' as const, focus: 'board' } : c.id === 'readings' || c.id === 'procedure' ? { mode: 'bench' as const, focus: task === 'BRIDGE' ? 'bridge' : 'ammeter' } : { mode: 'bench' as const, focus: 'bench', notebook: true };
  const join = useCallback((a: CircuitsTerminal, b: CircuitsTerminal) => joinWire(ctxRef.current, a, b), []);
  const intro: Record<CircuitsTask, { short: string; steps: string[] }> = {
    BRIDGE: {
      short: 'Find an unknown resistance X with a metre bridge: balance the jockey for several R, then interchange X and R.',
      steps: ['Collect the cell, key, metre bridge, galvanometer, resistance box, X and wires.', 'Join the cell and key across the wire ends A and C; the galvanometer from D to the jockey.', 'Choose R, close the key, tap the jockey until the galvanometer shows no deflection; record l and open the key.', 'Repeat for four values of R, then interchange X and R. Find the mean X and plot R against (100 − l)/l.'],
    },
    EMF: {
      short: 'Find the e.m.f. E and internal resistance r of a dry cell from a graph of V against I.',
      steps: ['Collect the cell, key, rheostat, ammeter, voltmeter and wires.', 'Wire the cell, key, ammeter and rheostat in series; the voltmeter straight across the cell.', 'Read the voltmeter with the key open; then set I ≈ 0.20 … 0.80 A, reading V and I each time (key open between readings).', 'Plot V against I: the intercept is E and r = −slope.'],
    },
    SERIES: {
      short: 'Measure R₁, R₂, and the two in series and in parallel; compare with the formulas.',
      steps: ['Collect the cell, key, ammeter, voltmeter, R₁, R₂ and wires.', 'Wire R₁ alone with the voltmeter across it; close the key, read V and I, open the key. Then R₂.', 'Rewire them in series, then in parallel, with the voltmeter across the arrangement.', 'Work out R = V/I for each and compare with R₁ + R₂ and R₁R₂/(R₁ + R₂).'],
    },
  };

  return (
    <LabShell
      kit={kit}
      title="Physics lab"
      heading={`Physics laboratory — ${TASK_NAME[task].toLowerCase()}`}
      intro={intro[task]}
      readingStatus={task === 'BRIDGE' ? 'watching the galvanometer' : 'reading the meters'}
      scene={<LabScene o={shown.o} state={shown.state} scene={shownScene} guided={guided || stage === 'learn'} interactive={!readOnly && work} onSlow={kit.onSlow} drag={{ board: o.board, state: { ...state, pressed: state.pressed }, join, setRheostat: o.setRheostat, setJockey: o.setJockey }} />}
      endsAt={endsAt}
      onHandIn={onHandIn}
      onUse2d={onUse2d}
      attemptId={attemptId}
      steps={steps}
      hint={practice && !guided ? nextHint3d(state, scene, o.meters) : null}
      objectPanel={(id) => objectPanel(id, ctx)}
      explain={explainer}
      task={
        <div className="space-y-2 text-[13.5px] leading-relaxed">
          <CircuitsTaskText task={task} />
        </div>
      }
      notebook={<Notebook task={task} state={state} readOnly={readOnly} update={o.update} removeReading={o.removeReading} />}
      cupboard={{
        blurb: `Take what you need for ${TASK_NAME[task].toLowerCase()} to your bench — or drag things from the cupboard onto the tray.`,
        items: CUPBOARD_ITEMS,
        has: (id) => scene.collected.has(id as ApparatusId),
        onToggle: (id, take) => o.note(`${take ? 'collect' : 'return'}:${id}`),
        onCarry,
      }}
      dock={scene.collected.has('key') ? <CircuitsDock o={o} s={state} compact={kit.touch} /> : null}
      modeBar={<ModeBar views={viewButtons(task)} read={{ label: task === 'BRIDGE' ? 'Watch galvanometer' : 'Read meters', can: canRead }} onRead={() => canRead && (useLabView.getState().set({ mode: 'read', selected: null, spot: null }), kit.setSheet(null))} />}
      readingPanel={<ReadingPanel o={o} s={state} onBack={() => useLabView.getState().set({ mode: 'bench', focus: task === 'BRIDGE' ? 'galvanometer' : useBench.getState().meter === 'V' ? 'voltmeter' : 'ammeter' })} />}
      canRead={canRead}
      dragFeedback={(drag) => <CircuitsDragFeedback drag={drag} s={state} />}
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
      ask={{ suggestions: ASK_SUGGESTIONS, extra: stage === 'try' ? undefined : task === 'BRIDGE' ? 'Why does the galvanometer read zero at balance?' : task === 'EMF' ? 'Why is the terminal p.d. less than the e.m.f.?' : 'Why is the parallel resistance smaller than either resistor?' }}
      tourSteps={TOURS[task]}
      safety={CIRCUITS_SAFETY}
      briefed={attemptState.log.some((e) => e.a.startsWith('safety-briefing'))}
      onBriefing={(outcome) => oAttempt.note(`safety-briefing:${outcome}`)}
      missing={phyCircuitsMissing(attemptState, seed)}
      helpRows={HELP_ROWS}
      onResetStation={() => (useBench.setState({ picked: null }), o.press(false))}
      onKey={onKey}
      debriefView={debriefView}
    />
  );
}
