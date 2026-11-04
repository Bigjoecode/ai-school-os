import type { CriterionScore, MagTask, PhyMagnetismState, PhyMagnetismVariant } from '@aischool/shared';
import { useCallback, useEffect, useMemo } from 'react';
import { ModeBar } from '../../../lab3d-kit/hud';
import { KitScene } from '../../../lab3d-kit/scene';
import { LabShell, useLabKit, useNewLogEntries } from '../../../lab3d-kit/shell';
import { notify, useLabView } from '../../../lab3d-kit/store';
import { BAYO_SPOT, physicsTour, usePhysicsAssistant } from '../../phy-common/lab3d/common';
import type { SimulatorProps } from '../../types';
import { lessonTask, magHint, TASK_NAME, useMagnetism, type Magnetism } from '../actions';
import { MagTaskText, Notebook } from '../index';
import { phyMagnetismMissing } from '../missing';
import { MagDock, MagDragFeedback, MagReadingPanel } from './bench-hud';
import { BENCH_IDLE, useBench } from './bench-store';
import { ASK_SUGGESTIONS, explainer, learnConfig, learnState } from './content';
import { demoSeed } from './demo';
import { useMagDemo } from './demo-hook';
import { DragController } from './drag';
import { correctionFor, guideSteps } from './guide';
import { makeOps, objectPanel, type ActionCtx, type Ops } from './lab-actions';
import { MAG_SAFETY } from './safety';
import { SandboxResults, SandboxSetupForm, useSandbox } from './sandbox';
import { APPARATUS, APPARATUS_LABEL, IN_CUPBOARD, sceneFromState, type ApparatusId, type SceneState } from './scene-state';
import { MagCupboard, Station } from './station';
import { MAG_VIEWS, magRoom, readPoint, RIG_VIEW, viewButtons } from './views';

/**
 * The 3D physics laboratory for the magnetism practicals — field lines and
 * neutral points, the strength of an electromagnet, electromagnetic
 * induction and the diode's characteristic — on the shared lab kit: the
 * same state, actions and marks as the 2D lab.
 */

const noop = () => undefined;
const TOUR: Record<MagTask, ReturnType<typeof physicsTour>> = {
  FIELD: physicsTour({ focusId: 'compass', focusLabel: 'Plotting compass', readLabel: 'Read the instrument', readText: '“Read the instrument” shows the sheet and the compass needle close up; click the paper to move the compass, and lay the rule to a mark.', taskText: 'The task card is the question paper: the lines to plot and the neutral points to find. Open it now.' }),
  ELECTROMAGNET: physicsTour({ focusId: 'nail', focusLabel: 'The electromagnet', readLabel: 'Read the instrument', readText: '“Read the instrument” shows the ammeter and the clips hanging from the nail, to count.', taskText: 'The task card is the question paper: the currents, the turns and what to plot. Open it now.' }),
  INDUCTION: physicsTour({ focusId: 'magnets', focusLabel: 'Bar magnet', readLabel: 'Read the instrument', readText: '“Read the instrument” shows the galvanometer close up: which way and how far it swings.', taskText: 'The task card is the question paper: the movements to try and the calculations. Open it now.' }),
  DIODE: physicsTour({ focusId: 'pot', focusLabel: 'Potentiometer', readLabel: 'Read the instrument', readText: '“Read the instrument” shows the voltmeter and the milliammeter close up.', taskText: 'The task card is the question paper: the p.d.s to set and what to plot. Open it now.' }),
};
const HELP_ROWS: [string, React.ReactNode][] = [
  ['Make a measurement', 'Use the dock at the bottom, or click the apparatus for its menu'],
  ['Drag', 'Drag the compass over the paper; drag the magnet towards the coil to push it in'],
  ['Read an instrument', '“Read the instrument”: the sheet, the meters or the galvanometer close up'],
];
const CARD: Record<MagTask, string[]> = {
  FIELD: ['Meridian first; no steel near.', 'N pointing north: 4 lines, dot to dot, arrows.', 'Neutral points X, Y: distance from centre.', 'Reverse: axial points. Ratio axial ÷ eq.'],
  ELECTROMAGNET: ['30 turns on soft iron.', '0.5, 1.0, 1.5, 2.0 A: lift ×2, count.', 'Open the key between lifts.', '60 turns at 1.0 A; no core. Plot clips–I.'],
  INDUCTION: ['200 turns: N in, still, out.', 'Faster; S pole; two magnets.', '600 turns. Direction + size.', 'E = NΔΦ/Δt; Lenz’s law.'],
  DIODE: ['Resistor in; V across the diode.', 'Forward: 0.1 … 0.5, then 0.05 V steps.', 'Reverse: 1–4 V (10 V range).', 'Tangent → knee; ΔV/ΔI; V/I.'],
};

function LabScene({ v, state, scene, o, ops, guided, interactive, onSlow }: { v: PhyMagnetismVariant; state: PhyMagnetismState; scene: SceneState; o: Magnetism; ops: Ops; guided: boolean; interactive: boolean; onSlow: () => void }) {
  const task: MagTask = state.task ?? 'FIELD';
  const room = useMemo(() => magRoom(task), [task]);
  const read = readPoint(task, { cx: state.cx, cy: state.cy, galvoFar: state.galvoFar });
  return (
    <KitScene room={room} coatOn={scene.coat} gogglesOn={false} presets={MAG_VIEWS} read={read} guided={guided} onSlow={onSlow} assistantSpot={BAYO_SPOT}>
      <MagCupboard scene={scene} />
      <Station v={v} state={state} scene={scene} interactive={interactive} card={CARD[task]} />
      {interactive && <DragController o={o} ops={ops} />}
    </KitScene>
  );
}

export default function PhyMagnetismLab3D(props: SimulatorProps<'phy-magnetism'>) {
  usePhysicsAssistant();
  const { seed, mode, state: attemptState, onChange, readOnly, startedAt, endsAt, onHandIn, onUse2d, practicalId, attemptId, result } = props;
  const started = attemptState.log.some((e) => !e.a.startsWith('safety-briefing') && !e.a.startsWith('task:'));
  const oAttempt = useMagnetism({ seed, state: attemptState, onChange, readOnly, startedAt, practicalId });
  const task: MagTask = attemptState.task ?? lessonTask(practicalId);
  const sandbox = useSandbox(startedAt, task);
  const kit = useLabKit({ mode, readOnly, practicalId, result, started, onStageChange: () => useBench.setState(BENCH_IDLE) });
  const { stage, work, guided, practice } = kit;
  const learnSeed = demoSeed(seed);
  const LEARN = useMemo(() => learnState(task), [task]);
  const LEARN_CONFIG = useMemo(() => learnConfig(task), [task]);
  const oLearn = useMagnetism({ seed: learnSeed, state: LEARN, onChange: noop, readOnly: true, startedAt, autoTask: false });
  const precautions = useMemo(() => kit.lesson?.precautions ?? [], [kit.lesson]);
  const demo = useMagDemo({ task, studentSeed: seed, startedAt, precautions, active: stage === 'demo', onFinished: () => kit.markJourney('demo') });
  const o = stage === 'sandbox' ? sandbox.o : oAttempt;
  const state = stage === 'sandbox' ? sandbox.state : attemptState;
  const scene = useMemo(() => sceneFromState(state), [state]);
  const shown = stage === 'learn' ? { o: oLearn, state: LEARN } : stage === 'demo' ? { o: demo.o, state: demo.state } : { o, state };
  const shownScene = useMemo(() => sceneFromState(shown.state), [shown.state]);
  const ops = makeOps(o);
  const camMode = useLabView((v) => v.mode);
  useBench((b) => b.tick);
  useEffect(() => () => useBench.setState(BENCH_IDLE), []);

  const steps = useMemo(() => (guided ? guideSteps(state, scene, camMode, o.v) : []), [guided, state, scene, camMode, o.v]);
  useNewLogEntries(state.log, stage, (fresh) => {
    if (!guided || !fresh.length) return;
    let found = null;
    for (const e of fresh) found = correctionFor(e.a, state) ?? found;
    if (found) kit.correct(found);
  });

  if (import.meta.env.DEV) Object.assign(window, { __lab3dState: attemptState, __lab3dShown: shown.state, __lab3dStage: stage, __magBench: useBench, __magOps: ops, __magO: o });
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
    if (type === 'up' || useLabView.getState().mode === 'walk' || !scene.set) return false;
    if (task === 'FIELD' && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
      const d = e.shiftKey ? 1 : 0.2;
      ops.cmove(e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0, e.key === 'ArrowUp' ? d : e.key === 'ArrowDown' ? -d : 0);
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
        short: task === 'FIELD' ? 'Plot the field of a bar magnet with a compass, dot to dot, and find its neutral points.' : task === 'ELECTROMAGNET' ? 'Count the clips an electromagnet lifts as you change the current and the turns.' : task === 'INDUCTION' ? 'Move a magnet in and out of a coil and watch the galvanometer: Faraday’s and Lenz’s laws.' : 'Measure the current through a silicon diode as you raise the p.d., forwards and backwards.',
        steps: [
          'Collect the apparatus from the cupboard on the right (or drag it onto the tray).',
          'At your bench set it out with the dock’s button, as the task card shows.',
          'Make each measurement from the dock or the apparatus’ menu; read the instrument close up.',
          'Fill in the table, draw the graph or diagram and work out the results.',
        ],
      }}
      readingStatus="reading the instrument"
      scene={<LabScene v={shown.o.v} state={shown.state} scene={shownScene} o={o} ops={ops} guided={guided || stage === 'learn'} interactive={!readOnly && work} onSlow={kit.onSlow} />}
      endsAt={endsAt}
      onHandIn={onHandIn}
      onUse2d={onUse2d}
      attemptId={attemptId}
      steps={steps}
      hint={practice && !guided ? (!scene.ready ? `Collect your apparatus from the cupboard (${scene.missing.length} to go).` : !scene.set ? 'Set up the apparatus (the dock’s button).' : magHint(state)) : null}
      objectPanel={(id) => objectPanel(id, ctx)}
      explain={explainer}
      task={
        <div className="space-y-2 text-[13.5px] leading-relaxed">
          <MagTaskText task={state.task} v={o.v} />
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
      dock={scene.ready ? <MagDock s={state} scene={scene} ops={ops} compact={kit.touch} /> : null}
      modeBar={<ModeBar views={viewButtons(task)} read={{ label: 'Read the instrument', can: canRead }} onRead={() => canRead && (useLabView.getState().set({ mode: 'read', selected: null, spot: null }), kit.setSheet(null))} />}
      readingPanel={<MagReadingPanel o={stage === 'demo' ? demo.o : o} s={stage === 'demo' ? demo.state : state} onBack={() => useLabView.getState().set({ mode: 'bench', focus: rig, spot: null })} />}
      canRead={canRead}
      dragFeedback={(drag) => <MagDragFeedback drag={drag} />}
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
      ask={{ suggestions: ASK_SUGGESTIONS[task], extra: stage === 'try' ? undefined : task === 'FIELD' ? 'Why do the neutral points move when the magnet is reversed?' : task === 'ELECTROMAGNET' ? 'Why does soft iron make a better core than steel?' : task === 'INDUCTION' ? 'Why is no current induced when the magnet is still?' : 'Why does a diode conduct in one direction only?' }}
      tourSteps={TOUR[task]}
      safety={MAG_SAFETY[task]}
      briefed={attemptState.log.some((e) => e.a.startsWith('safety-briefing'))}
      onBriefing={(outcome) => oAttempt.note(`safety-briefing:${outcome}`)}
      missing={phyMagnetismMissing(attemptState, seed)}
      helpRows={HELP_ROWS}
      onResetStation={() => useBench.setState(BENCH_IDLE)}
      onKey={onKey}
      debriefView={debriefView}
    />
  );
}
