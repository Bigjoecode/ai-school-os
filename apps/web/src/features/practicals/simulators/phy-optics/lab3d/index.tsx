import type { CriterionScore, OpticsTask, PhyOpticsState, PhyOpticsVariant } from '@aischool/shared';
import { useCallback, useEffect, useMemo } from 'react';
import { Kbd } from '@/components/ui/kbd';
import { ModeBar } from '../../../lab3d-kit/hud';
import { KitScene } from '../../../lab3d-kit/scene';
import { LabShell, useLabKit, useNewLogEntries } from '../../../lab3d-kit/shell';
import { notify, useLabView } from '../../../lab3d-kit/store';
import { BAYO_SPOT, physicsTour, usePhysicsAssistant } from '../../phy-common/lab3d/common';
import type { SimulatorProps } from '../../types';
import { lessonTask, opticsHint, useOptics, type Optics } from '../actions';
import { Notebook, OpticsTaskText } from '../index';
import { phyOpticsMissing } from '../missing';
import { OpticsDock, OpticsDragFeedback, OpticsReadingPanel } from './bench-hud';
import { BENCH_IDLE, useBench } from './bench-store';
import { ASK_SUGGESTIONS, explainer, learnConfig, learnState } from './content';
import { useOpticsDemo } from './demo-hook';
import { DragController } from './drag';
import { correctionFor, guideSteps } from './guide';
import { makeOps, objectPanel, type ActionCtx } from './lab-actions';
import { SandboxResults, SandboxSetupForm, useSandbox } from './sandbox';
import { BENCH_SAFETY } from './safety';
import { APPARATUS, APPARATUS_LABEL, sceneFromState, type ApparatusId, type SceneState } from './scene-state';
import { OpticsCupboard, Station } from './station';
import { OPTICS_VIEW_BUTTONS, OPTICS_VIEWS, opticsRoom, readPoint } from './views';

/**
 * The 3D physics laboratory: the optical bench (focal length of a converging
 * lens or a concave mirror), on the shared lab kit — the same state, actions
 * and marks as the 2D lab. The student collects the metre rule, the
 * illuminated object, the lens or mirror and the screen, stands them on the
 * rule, finds a rough focal length from the window, lines up the centres,
 * sets each u and moves the screen to and fro until the cross-wire is
 * sharpest (the image on the screen is drawn from the real optics, blur and
 * all), reads v on the rule at eye level, then works out f in the notebook.
 */

const noop = () => undefined;
const TOUR = physicsTour({
  focusId: 'screen',
  focusLabel: 'Screen',
  readLabel: 'Read the rule',
  readText: '“Read the rule” puts your eye close to the metre rule at a holder’s index line. Read the line against the scale to 0.1 cm.',
  taskText: 'The task card is the question paper: the values of u to use and what to plot. Open it now.',
});
const HELP_ROWS: [string, React.ReactNode][] = [
  ['Move the screen', <>Drag it along the rule, or <Kbd>←</Kbd> <Kbd>→</Kbd> (1 mm; with Shift 1 cm) or the dock</>],
  ['Set u', 'Drag the lens (or the object, for the mirror) along the rule, or u − / u + in the dock'],
  ['Look at the image', 'The dock’s “Look at the screen”; the image is sharpest where the cross-wire’s lines are thinnest'],
];
const CUPBOARD_ITEMS = APPARATUS.map((a) => ({ id: a.id, label: a.label }));
const TASK_LINES: Record<OpticsTask, string[]> = {
  LENS: ['Rough f: focus a distant window.', 'Object at 0 cm; lens at u = 20.0 cm; sharp image on the screen: v.', 'Repeat u = 25, 30, 40, 50 cm.', 'Plot 1/v against 1/u: f = 1/intercept.'],
  MIRROR: ['Rough f: focus a distant window.', 'Mirror at 0 cm; object at u = 15.0 cm, off the axis; sharp image: v.', 'Repeat u = 20, 25, 30, 35 cm.', 'Plot 1/v against 1/u: f = 1/intercept.'],
};

function LabScene({ v, state, scene, o, guided, interactive, onSlow }: { v: PhyOpticsVariant; state: PhyOpticsState; scene: SceneState; o: Optics; guided: boolean; interactive: boolean; onSlow: () => void }) {
  const task: OpticsTask = state.task ?? 'LENS';
  const readAt = useBench((b) => b.readAt);
  const room = useMemo(() => opticsRoom(task), [task]);
  return (
    <KitScene room={room} coatOn={scene.coat} gogglesOn={false} presets={OPTICS_VIEWS} read={readPoint(readAt === 'screen' ? state.screen : state.u)} guided={guided} onSlow={onSlow} assistantSpot={BAYO_SPOT}>
      <OpticsCupboard scene={scene} />
      <Station v={v} state={state} scene={scene} interactive={interactive} task={TASK_LINES[task]} />
      {interactive && <DragController o={o} />}
    </KitScene>
  );
}

export default function PhyOpticsLab3D(props: SimulatorProps<'phy-optics'>) {
  usePhysicsAssistant();
  const { seed, mode, state: attemptState, onChange, readOnly, startedAt, endsAt, onHandIn, onUse2d, practicalId, attemptId, result } = props;
  const started = attemptState.log.some((e) => !e.a.startsWith('safety-briefing') && !e.a.startsWith('task:'));
  const oAttempt = useOptics({ seed, state: attemptState, onChange, readOnly, startedAt, practicalId });
  const task: OpticsTask = attemptState.task ?? lessonTask(practicalId);
  const sandbox = useSandbox(startedAt, task);
  const kit = useLabKit({ mode, readOnly, practicalId, result, started, onStageChange: () => useBench.setState(BENCH_IDLE) });
  const { stage, work, guided, practice } = kit;
  const LEARN = useMemo(() => learnState(task), [task]);
  const LEARN_CONFIG = useMemo(() => learnConfig(task), [task]);
  const oLearn = useOptics({ seed, state: LEARN, onChange: noop, readOnly: true, startedAt, autoTask: false });
  const precautions = useMemo(() => kit.lesson?.precautions ?? [], [kit.lesson]);
  const demo = useOpticsDemo({ task, studentSeed: seed, startedAt, precautions, active: stage === 'demo', onFinished: () => kit.markJourney('demo') });
  const o = stage === 'sandbox' ? sandbox.o : oAttempt;
  const state = stage === 'sandbox' ? sandbox.state : attemptState;
  const scene = useMemo(() => sceneFromState(state), [state]);
  const shown = stage === 'learn' ? { o: oLearn, state: LEARN } : stage === 'demo' ? { o: demo.o, state: demo.state } : { o, state };
  const shownScene = useMemo(() => sceneFromState(shown.state), [shown.state]);
  const ops = makeOps(o);
  const camMode = useLabView((v) => v.mode);
  const rough = useBench((b) => b.rough);
  useEffect(() => () => useBench.setState(BENCH_IDLE), []);

  // ---- guidance
  const steps = useMemo(() => (guided ? guideSteps(state, scene, camMode, rough) : []), [guided, state, scene, camMode, rough]);
  useNewLogEntries(state.log, stage, (fresh) => {
    if (!guided || !fresh.length) return;
    let found = null;
    for (const e of fresh) found = correctionFor(e.a, state, o.v) ?? found;
    if (found) kit.correct(found);
  });

  if (import.meta.env.DEV) Object.assign(window, { __lab3dState: attemptState, __lab3dShown: shown.state, __lab3dStage: stage, __opticsBench: useBench, __opticsOps: ops });
  const ctx: ActionCtx = { o, s: state, scene, ops, open: (w) => (useLabView.getState().set({ selected: null }), kit.setSheet(w)) };
  const onCarry = useCallback(
    (id: string) => {
      o.note(`collect:${id}`);
      notify(`${APPARATUS_LABEL[id as ApparatusId]} is on your bench.`, 'success', 1500);
    },
    [o],
  );
  const canRead = scene.set && !rough;
  const onKey = (e: KeyboardEvent, type: 'down' | 'up') => {
    if (type === 'up' || useLabView.getState().mode !== 'bench' || !scene.set) return false;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const d = (e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 1 : 0.1);
      if (useBench.getState().rough) ops.roughMove(d);
      else ops.moveScreen(d);
      return true;
    }
    return false;
  };
  const debriefView = (c: CriterionScore) => (c.id === 'procedure' || c.id === 'focusing' ? { mode: 'bench' as const, focus: 'rule' } : { mode: 'bench' as const, focus: 'bench', notebook: true });

  return (
    <LabShell
      kit={kit}
      title="Physics lab"
      heading={`Physics laboratory — focal length of a ${task === 'MIRROR' ? 'concave mirror' : 'converging lens'}`}
      intro={{
        short: `Collect the optical bench, then find the sharp image of the cross-wire for five values of u.`,
        steps: [
          `Collect the metre rule, the illuminated object, the ${task === 'MIRROR' ? 'concave mirror' : 'converging lens'} and the screen from the cupboard on the right.`,
          'At your bench stand them on the rule, and find a rough focal length by focusing the window.',
          'Line up the centres, set u, and move the screen to and fro until the cross-wire is sharpest.',
          'Read v on the rule, take five values of u, then plot 1/v against 1/u and work out f.',
        ],
      }}
      readingStatus="reading the metre rule"
      scene={<LabScene v={shown.o.v} state={shown.state} scene={shownScene} o={o} guided={guided || stage === 'learn'} interactive={!readOnly && work} onSlow={kit.onSlow} />}
      endsAt={endsAt}
      onHandIn={onHandIn}
      onUse2d={onUse2d}
      attemptId={attemptId}
      steps={steps}
      hint={practice && !guided ? (!scene.ready ? `Collect your apparatus from the cupboard (${scene.missing.length} to go).` : !scene.set ? 'Stand the apparatus on the metre rule (the dock’s button).' : opticsHint(state, rough)) : null}
      objectPanel={(id) => objectPanel(id, ctx)}
      explain={explainer}
      task={
        <div className="space-y-2 text-[13.5px] leading-relaxed">
          <OpticsTaskText task={state.task} />
        </div>
      }
      notebook={<Notebook task={state.task ?? task} state={state} readOnly={readOnly} update={o.update} removeReading={o.removeReading} />}
      cupboard={{
        blurb: `Take what you need for the focal length of a ${task === 'MIRROR' ? 'concave mirror' : 'converging lens'} to your bench — or drag things from the cupboard onto the tray.`,
        items: CUPBOARD_ITEMS,
        has: (id) => scene.collected.has(id as ApparatusId),
        onToggle: (id, take) => o.note(`${take ? 'collect' : 'return'}:${id}`),
        onCarry,
      }}
      dock={scene.ready ? <OpticsDock s={state} scene={scene} ops={ops} compact={kit.touch} /> : null}
      modeBar={<ModeBar views={OPTICS_VIEW_BUTTONS} read={{ label: 'Read the rule', can: canRead }} onRead={() => canRead && (useLabView.getState().set({ mode: 'read', selected: null, spot: null }), kit.setSheet(null))} />}
      readingPanel={<OpticsReadingPanel s={state} onBack={() => useLabView.getState().set({ mode: 'bench', focus: 'rule', spot: null })} />}
      canRead={canRead}
      dragFeedback={(drag) => <OpticsDragFeedback drag={drag} s={state} />}
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
      ask={{ suggestions: ASK_SUGGESTIONS, extra: stage === 'try' ? undefined : 'Why is the graph of 1/v against 1/u a straight line of slope −1?' }}
      tourSteps={TOUR}
      safety={BENCH_SAFETY}
      briefed={attemptState.log.some((e) => e.a.startsWith('safety-briefing'))}
      onBriefing={(outcome) => oAttempt.note(`safety-briefing:${outcome}`)}
      missing={phyOpticsMissing(attemptState, seed)}
      helpRows={HELP_ROWS}
      onResetStation={() => useBench.setState(BENCH_IDLE)}
      onKey={onKey}
      debriefView={debriefView}
    />
  );
}
