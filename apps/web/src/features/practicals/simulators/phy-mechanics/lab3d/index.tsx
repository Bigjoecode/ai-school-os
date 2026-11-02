import { forceEquilibrium, type CriterionScore, type MechTask, type PhyMechanicsState, type PhyMechanicsVariant } from '@aischool/shared';
import { useCallback, useEffect, useMemo } from 'react';
import { ModeBar } from '../../../lab3d-kit/hud';
import { KitScene } from '../../../lab3d-kit/scene';
import { LabShell, useLabKit, useNewLogEntries } from '../../../lab3d-kit/shell';
import { notify, useLabView } from '../../../lab3d-kit/store';
import { BAYO_SPOT, physicsTour, usePhysicsAssistant } from '../../phy-common/lab3d/common';
import type { SimulatorProps } from '../../types';
import { boardSheet, lessonTask, mechHint, TASK_NAME, useMechanics, type Mechanics } from '../actions';
import { MechTaskText, Notebook } from '../index';
import { phyMechanicsMissing } from '../missing';
import { MechDock, MechDragFeedback, MechReadingPanel } from './bench-hud';
import { BENCH_IDLE, useBench } from './bench-store';
import { ASK_SUGGESTIONS, explainer, learnConfig, learnState } from './content';
import { demoSeed } from './demo';
import { useMechDemo } from './demo-hook';
import { DragController } from './drag';
import { correctionFor, guideSteps } from './guide';
import { makeOps, objectPanel, type ActionCtx, type Ops } from './lab-actions';
import { MECH_SAFETY } from './safety';
import { SandboxResults, SandboxSetupForm, useSandbox } from './sandbox';
import { APPARATUS, APPARATUS_LABEL, IN_CUPBOARD, sceneFromState, type ApparatusId, type SceneState } from './scene-state';
import { MechCupboard, Station } from './station';
import { MECH_VIEWS, mechRoom, readPoint, RIG_VIEW, viewButtons } from './views';

/**
 * The 3D physics laboratory for the mechanics practicals — static friction,
 * terminal velocity in glycerine, a ball rolling down an incline, and the
 * parallelogram of forces — on the shared lab kit: the same state, actions
 * and marks as the 2D lab. The student collects the apparatus, sets it out,
 * makes each measurement on the bench (the block pulled, the plank raised,
 * the ball dropped or rolled with the stop-clock, the threads marked and the
 * parallelogram drawn), reads the instruments close up, then completes the
 * table, the graph or drawing and the result.
 */

const noop = () => undefined;
const TOUR: Record<MechTask, ReturnType<typeof physicsTour>> = {
  FRICTION: physicsTour({ focusId: 'sbalance', focusLabel: 'Spring balance', readLabel: 'Read the instrument', readText: '“Read the instrument” shows the spring balance close up — just as the block started to move, and while it slid — or the protractor at the raised plank.', taskText: 'The task card is the question paper: the loads to use and what to plot. Open it now.' }),
  VISCOSITY: physicsTour({ focusId: 'cylinder', focusLabel: 'Glycerine cylinder', readLabel: 'Read the instrument', readText: '“Read the instrument” shows the micrometer, the bands against the metre rule and the stop-clock close up.', taskText: 'The task card is the question paper: where to put the bands and what to plot. Open it now.' }),
  INCLINE: physicsTour({ focusId: 'steelball', focusLabel: 'Steel ball', readLabel: 'Read the instrument', readText: '“Read the instrument” shows the stop-clock and the plank’s scale at the stopping block.', taskText: 'The task card is the question paper: the distances and what to plot. Open it now.' }),
  FORCES: physicsTour({ focusId: 'knot', focusLabel: 'The knot', readLabel: 'Read the drawing', readText: '“Read the drawing” shows your sheet close up — the threads on the board, then your lines and parallelogram with a rule and a protractor.', taskText: 'The task card is the question paper: the loads and the construction. Open it now.' }),
};
const HELP_ROWS: [string, React.ReactNode][] = [
  ['Make a measurement', 'Use the dock at the bottom, or click the apparatus for its menu'],
  ['Pull, slide, drag', 'Drag the spring balance to the right to pull; drag a rubber band or the stopping block along'],
  ['Read an instrument', '“Read the instrument”: the balance, micrometer, stop-clock or drawing close up'],
];
const CARD: Record<MechTask, string[]> = {
  FRICTION: ['Zero the balance; wipe the plank.', 'Weigh (R); pull slowly: F as it starts to move ×2.', 'Loads 0–4 × 100 g. Plot F against R: μ = slope.', 'Raise the plank slowly: μ = tan θ.'],
  VISCOSITY: ['Bands at ~8 cm and 20.0 cm lower.', 'Micrometer: d. Drop at the centre; time ×2.', 'Five sizes. v = L/t. Plot v against r².', 'η = 2(ρs − ρl)g/(9 × slope). Palm oil too.'],
  INCLINE: ['Left end on 3 blocks; keep it so.', 'Release from rest; time to the block ×3.', 's = 0.40, 0.80, 1.20, 1.60 m.', 'Plot s against t²: a = 2 × slope.'],
  FORCES: ['P 300 g, Q 400 g, W 500 g; tap the board.', 'Two dots under each thread, well apart.', 'Scale: OA = P, OB = Q; complete OACB.', 'Measure OC: R = OC × scale; compare with W.'],
};

function LabScene({ v, state, scene, o, ops, guided, interactive, onSlow }: { v: PhyMechanicsVariant; state: PhyMechanicsState; scene: SceneState; o: Mechanics; ops: Ops; guided: boolean; interactive: boolean; onSlow: () => void }) {
  const task: MechTask = state.task ?? 'FRICTION';
  const band = useBench((b) => b.band);
  const room = useMemo(() => mechRoom(task), [task]);
  const sh = boardSheet(state);
  const eq = task === 'FORCES' ? forceEquilibrium(v, state.masses, state.tapped, sh ? sh.i : state.sets.length) : null;
  const read = readPoint(task, { band: band === 'top' ? state.top : state.bot, stop: state.stop, knot: eq?.ok ? [eq.knot.x, eq.knot.y] : undefined });
  return (
    <KitScene room={room} coatOn={scene.coat} gogglesOn={false} presets={MECH_VIEWS} read={read} guided={guided} onSlow={onSlow} assistantSpot={BAYO_SPOT}>
      <MechCupboard scene={scene} />
      <Station v={v} state={state} scene={scene} interactive={interactive} card={CARD[task]} />
      {interactive && <DragController o={o} ops={ops} />}
    </KitScene>
  );
}

export default function PhyMechanicsLab3D(props: SimulatorProps<'phy-mechanics'>) {
  usePhysicsAssistant();
  const { seed, mode, state: attemptState, onChange, readOnly, startedAt, endsAt, onHandIn, onUse2d, practicalId, attemptId, result } = props;
  const started = attemptState.log.some((e) => !e.a.startsWith('safety-briefing') && !e.a.startsWith('task:'));
  const oAttempt = useMechanics({ seed, state: attemptState, onChange, readOnly, startedAt, practicalId });
  const task: MechTask = attemptState.task ?? lessonTask(practicalId);
  const sandbox = useSandbox(startedAt, task);
  const kit = useLabKit({ mode, readOnly, practicalId, result, started, onStageChange: () => useBench.setState(BENCH_IDLE) });
  const { stage, work, guided, practice } = kit;
  // Learn shows Mr Bayo's own apparatus (the demo's seed), never the student's.
  const learnSeed = demoSeed(seed);
  const LEARN = useMemo(() => learnState(task), [task]);
  const LEARN_CONFIG = useMemo(() => learnConfig(task), [task]);
  const oLearn = useMechanics({ seed: learnSeed, state: LEARN, onChange: noop, readOnly: true, startedAt, autoTask: false });
  const precautions = useMemo(() => kit.lesson?.precautions ?? [], [kit.lesson]);
  const demo = useMechDemo({ task, studentSeed: seed, startedAt, precautions, active: stage === 'demo', onFinished: () => kit.markJourney('demo') });
  const o = stage === 'sandbox' ? sandbox.o : oAttempt;
  const state = stage === 'sandbox' ? sandbox.state : attemptState;
  const scene = useMemo(() => sceneFromState(state), [state]);
  const shown = stage === 'learn' ? { o: oLearn, state: LEARN } : stage === 'demo' ? { o: demo.o, state: demo.state } : { o, state };
  const shownScene = useMemo(() => sceneFromState(shown.state), [shown.state]);
  const ops = makeOps(o);
  const camMode = useLabView((v) => v.mode);
  useBench((b) => b.tick);
  useEffect(() => () => useBench.setState(BENCH_IDLE), []);

  // ---- guidance
  const steps = useMemo(() => (guided ? guideSteps(state, scene, camMode) : []), [guided, state, scene, camMode]);
  useNewLogEntries(state.log, stage, (fresh) => {
    if (!guided || !fresh.length) return;
    let found = null;
    for (const e of fresh) found = correctionFor(e.a, state, o.v) ?? found;
    if (found) kit.correct(found);
  });

  if (import.meta.env.DEV) Object.assign(window, { __lab3dState: attemptState, __lab3dShown: shown.state, __lab3dStage: stage, __mechBench: useBench, __mechOps: ops, __mechO: o });
  const ctx: ActionCtx = { o, s: state, scene, ops, open: (w) => (useLabView.getState().set({ selected: null }), kit.setSheet(w)) };
  const onCarry = useCallback(
    (id: string) => {
      o.note(`collect:${id}`);
      notify(`${APPARATUS_LABEL[id as ApparatusId]} is on your bench.`, 'success', 1500);
    },
    [o],
  );
  const canRead = scene.set;
  const onKey = (e: KeyboardEvent, type: 'down' | 'up') => {
    if (type === 'up' || useLabView.getState().mode !== 'bench' || !scene.set) return false;
    if (task === 'INCLINE' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      ops.stop((e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 10 : 1));
      return true;
    }
    if (task === 'VISCOSITY' && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      ops.band(useBench.getState().band, (e.key === 'ArrowUp' ? -1 : 1) * (e.shiftKey ? 5 : 0.5));
      return true;
    }
    return false;
  };
  const rig = RIG_VIEW[task];
  const debriefView = (c: CriterionScore) => (c.id === 'care' || c.id === 'procedure' ? { mode: 'bench' as const, focus: rig } : { mode: 'bench' as const, focus: 'bench', notebook: true });
  const cupboardItems = IN_CUPBOARD[task].map((id) => ({ id, label: APPARATUS.find((a) => a.id === id)!.label }));

  return (
    <LabShell
      kit={kit}
      title="Physics lab"
      heading={`Physics laboratory — ${TASK_NAME[task].toLowerCase()}`}
      intro={{
        short: task === 'FRICTION' ? 'Pull a block along a plank to find the limiting friction, then tilt the plank until it slips.' : task === 'VISCOSITY' ? 'Time steel balls falling through glycerine between two bands, then compare with palm oil.' : task === 'INCLINE' ? 'Time a ball rolling from rest down a 2 m incline to four distances.' : 'Three forces in equilibrium on a vertical board: draw them and construct the parallelogram.',
        steps: [
          'Collect the apparatus from the cupboard on the right (or drag it onto the tray).',
          'At your bench set it out with the dock’s button, as the task card shows.',
          task === 'FORCES' ? 'Hang the loads, let the knot settle, mark the threads and take the paper off.' : 'Make each measurement from the dock or the apparatus’ menu; read the instrument close up.',
          task === 'FORCES' ? 'Draw OA and OB to scale, complete the parallelogram and measure the diagonal.' : 'Fill in the table, plot the graph and work out the result.',
        ],
      }}
      readingStatus="reading the instrument"
      scene={<LabScene v={shown.o.v} state={shown.state} scene={shownScene} o={o} ops={ops} guided={guided || stage === 'learn'} interactive={!readOnly && work} onSlow={kit.onSlow} />}
      endsAt={endsAt}
      onHandIn={onHandIn}
      onUse2d={onUse2d}
      attemptId={attemptId}
      steps={steps}
      hint={practice && !guided ? (!scene.ready ? `Collect your apparatus from the cupboard (${scene.missing.length} to go).` : !scene.set ? 'Set up the apparatus (the dock’s button).' : mechHint(state)) : null}
      objectPanel={(id) => objectPanel(id, ctx)}
      explain={explainer}
      task={
        <div className="space-y-2 text-[13.5px] leading-relaxed">
          <MechTaskText task={state.task} />
        </div>
      }
      notebook={<Notebook task={state.task ?? task} state={state} readOnly={readOnly} o={o} />}
      cupboard={{
        blurb: `Take what you need for the ${TASK_NAME[task].toLowerCase()} practical to your bench — or drag things from the cupboard onto the tray.`,
        items: cupboardItems,
        has: (id) => scene.collected.has(id as ApparatusId),
        onToggle: (id, take) => o.note(`${take ? 'collect' : 'return'}:${id}`),
        onCarry,
      }}
      dock={scene.ready ? <MechDock s={state} scene={scene} ops={ops} compact={kit.touch} /> : null}
      modeBar={<ModeBar views={viewButtons(task)} read={{ label: task === 'FORCES' ? 'Read the drawing' : 'Read the instrument', can: canRead }} onRead={() => canRead && (useLabView.getState().set({ mode: 'read', selected: null, spot: null }), kit.setSheet(null))} />}
      readingPanel={<MechReadingPanel o={stage === 'demo' ? demo.o : o} s={stage === 'demo' ? demo.state : state} onBack={() => useLabView.getState().set({ mode: 'bench', focus: rig, spot: null })} />}
      canRead={canRead}
      dragFeedback={(drag) => <MechDragFeedback drag={drag} />}
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
      ask={{ suggestions: ASK_SUGGESTIONS[task], extra: stage === 'try' ? undefined : task === 'FRICTION' ? 'Why is the angle of slipping the same whatever the load?' : task === 'VISCOSITY' ? 'Why does a bigger ball reach a higher terminal velocity?' : task === 'INCLINE' ? 'Why is s against t² a straight line through the origin?' : 'Why must the resultant of P and Q be equal and opposite to W?' }}
      tourSteps={TOUR[task]}
      safety={MECH_SAFETY[task]}
      briefed={attemptState.log.some((e) => e.a.startsWith('safety-briefing'))}
      onBriefing={(outcome) => oAttempt.note(`safety-briefing:${outcome}`)}
      missing={phyMechanicsMissing(attemptState, seed)}
      helpRows={HELP_ROWS}
      onResetStation={() => useBench.setState(BENCH_IDLE)}
      onKey={onKey}
      debriefView={debriefView}
    />
  );
}
