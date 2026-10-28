import { phyMomentsVariant, type CriterionScore, type MomentsTask, type PhyMomentsState, type PhyMomentsVariant } from '@aischool/shared';
import { useCallback, useEffect, useMemo } from 'react';
import { Kbd } from '@/components/ui/kbd';
import { ModeBar } from '../../../lab3d-kit/hud';
import { KitScene } from '../../../lab3d-kit/scene';
import { LabShell, useLabKit, useNewLogEntries } from '../../../lab3d-kit/shell';
import { notify, useLabView } from '../../../lab3d-kit/store';
import { BAYO_SPOT, physicsTour, usePhysicsAssistant } from '../../phy-common/lab3d/common';
import type { SimulatorProps } from '../../types';
import { lessonTask, momentsHint, useMoments, type Moments } from '../actions';
import { MomentsTaskText, Notebook } from '../index';
import { phyMomentsMissing } from '../missing';
import { MomentsDock, MomentsDragFeedback, MomentsReadingPanel } from './bench-hud';
import { BENCH_IDLE, useBench } from './bench-store';
import { ASK_SUGGESTIONS, explainer, learnConfig, learnState } from './content';
import { demoSeed } from './demo';
import { useMomentsDemo } from './demo-hook';
import { DragController } from './drag';
import { correctionFor, guideSteps } from './guide';
import { makeOps, objectPanel, type ActionCtx } from './lab-actions';
import { BALANCE_SAFETY } from './safety';
import { SandboxResults, SandboxSetupForm, useSandbox } from './sandbox';
import { APPARATUS, APPARATUS_LABEL, sceneFromState, type ApparatusId, type SceneState } from './scene-state';
import { MomentsCupboard, Station } from './station';
import { MOMENTS_VIEW_BUTTONS, MOMENTS_VIEWS, momentsRoom, readPoint } from './views';

/**
 * The 3D physics laboratory: a metre rule on a knife edge (the principle of
 * moments, or the centre of gravity and mass of the rule), on the shared lab
 * kit — the same state, actions and marks as the 2D lab. The student collects
 * the rule, the knife edge, the masses and thread, balances the rule alone to
 * find G, hangs the masses on thread loops and balances the rule again for
 * five positions (the rule tips by the real torque and friction about the
 * edge), reads each mark at eye level, then plots d₁ against d₂ and finds M.
 */

const noop = () => undefined;
const TOUR = physicsTour({
  focusId: 'rule',
  focusLabel: 'Metre rule',
  readLabel: 'Read the rule',
  readText: '“Read the rule” puts your eye close to the rule at a mark — over the knife edge or a thread loop. Read it against the scale to 0.1 cm.',
  taskText: 'The task card is the question paper: the marks to hang the mass at and what to plot. Open it now.',
});
const HELP_ROWS: [string, React.ReactNode][] = [
  ['Slide the rule', <>Drag it along the knife edge, or <Kbd>←</Kbd> <Kbd>→</Kbd> (1 mm; with Shift 1 cm) or the dock</>],
  ['Slide a mass', 'Drag its thread loop along the rule, or the dock’s arrows'],
  ['Check the balance', '“Steady it and let go”: balanced, the rule stays level with the red pointers'],
];
const CUPBOARD_ITEMS = APPARATUS.map((a) => ({ id: a.id, label: a.label }));
const TASK_LINES: Record<MomentsTask, string[]> = {
  MOMENTS: ['Balance the rule alone: G.', 'Edge at G. 50 g at 26.0 cm; slide M to balance.', 'Repeat: 50 g at 30, 34, 38, 42 cm.', 'Plot d₁ against d₂: M = 50 g × slope.'],
  MASS: ['Balance the rule alone: G.', '100 g at 5.0 cm; slide the rule to balance: P.', 'Repeat at 10, 15, 20, 25 cm.', 'd₁ = P − x, d₂ = G − P. M = 100 g × slope.'],
};

function LabScene({ v, state, scene, o, guided, interactive, onSlow }: { v: PhyMomentsVariant; state: PhyMomentsState; scene: SceneState; o: Moments; guided: boolean; interactive: boolean; onSlow: () => void }) {
  const task: MomentsTask = state.task ?? 'MOMENTS';
  const readAt = useBench((b) => b.readAt);
  const room = useMemo(() => momentsRoom(task), [task]);
  const at = readAt === 'known' ? state.known : readAt === 'other' ? state.other : null;
  return (
    <KitScene room={room} coatOn={scene.coat} gogglesOn={false} presets={MOMENTS_VIEWS} read={readPoint(at ?? state.pivot, state.pivot)} guided={guided} onSlow={onSlow} assistantSpot={BAYO_SPOT}>
      <MomentsCupboard scene={scene} />
      <Station v={v} state={state} scene={scene} interactive={interactive} task={TASK_LINES[task]} />
      {interactive && <DragController o={o} />}
    </KitScene>
  );
}

export default function PhyMomentsLab3D(props: SimulatorProps<'phy-moments'>) {
  usePhysicsAssistant();
  const { seed, mode, state: attemptState, onChange, readOnly, startedAt, endsAt, onHandIn, onUse2d, practicalId, attemptId, result } = props;
  const started = attemptState.log.some((e) => !e.a.startsWith('safety-briefing') && !e.a.startsWith('task:'));
  const oAttempt = useMoments({ seed, state: attemptState, onChange, readOnly, startedAt, practicalId });
  const task: MomentsTask = attemptState.task ?? lessonTask(practicalId);
  const sandbox = useSandbox(startedAt, task);
  const kit = useLabKit({ mode, readOnly, practicalId, result, started, onStageChange: () => useBench.setState(BENCH_IDLE) });
  const { stage, work, guided, practice } = kit;
  // Learn shows Mr Bayo's own rule (the demo's seed), never the student's.
  const learnSeed = demoSeed(seed);
  const LEARN = useMemo(() => learnState(task, phyMomentsVariant(learnSeed)), [task, learnSeed]);
  const LEARN_CONFIG = useMemo(() => learnConfig(LEARN), [LEARN]);
  const oLearn = useMoments({ seed: learnSeed, state: LEARN, onChange: noop, readOnly: true, startedAt, autoTask: false });
  const precautions = useMemo(() => kit.lesson?.precautions ?? [], [kit.lesson]);
  const demo = useMomentsDemo({ task, studentSeed: seed, startedAt, precautions, active: stage === 'demo', onFinished: () => kit.markJourney('demo') });
  const o = stage === 'sandbox' ? sandbox.o : oAttempt;
  const state = stage === 'sandbox' ? sandbox.state : attemptState;
  const scene = useMemo(() => sceneFromState(state), [state]);
  const shown = stage === 'learn' ? { o: oLearn, state: LEARN } : stage === 'demo' ? { o: demo.o, state: demo.state } : { o, state };
  const shownScene = useMemo(() => sceneFromState(shown.state), [shown.state]);
  const ops = makeOps(o);
  const camMode = useLabView((v) => v.mode);
  useEffect(() => () => useBench.setState(BENCH_IDLE), []);

  // ---- guidance
  const steps = useMemo(() => (guided ? guideSteps(state, scene, camMode) : []), [guided, state, scene, camMode]);
  useNewLogEntries(state.log, stage, (fresh) => {
    if (!guided || !fresh.length) return;
    let found = null;
    for (const e of fresh) found = correctionFor(e.a, state, o.v) ?? found;
    if (found) kit.correct(found);
  });

  if (import.meta.env.DEV) Object.assign(window, { __lab3dState: attemptState, __lab3dShown: shown.state, __lab3dStage: stage, __momentsBench: useBench, __momentsOps: ops });
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
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const d = (e.key === 'ArrowLeft' ? 1 : -1) * (e.shiftKey ? 1 : 0.1);
      ops.movePivot(d);
      return true;
    }
    return false;
  };
  const debriefView = (c: CriterionScore) => (c.id === 'procedure' || c.id === 'balancing' ? { mode: 'bench' as const, focus: 'balance' } : { mode: 'bench' as const, focus: 'bench', notebook: true });
  const what = task === 'MASS' ? 'the centre of gravity and mass of a metre rule' : 'the principle of moments';

  return (
    <LabShell
      kit={kit}
      title="Physics lab"
      heading={`Physics laboratory — ${what}`}
      intro={{
        short: 'Balance a metre rule on a knife edge: alone to find G, then with masses for five positions.',
        steps: [
          `Collect the metre rule, the knife edge, ${task === 'MASS' ? 'the 100 g mass' : 'the 50 g mass, the unknown mass M'} and thread from the cupboard on the right.`,
          'At your bench stand the knife edge up and lay the rule on it. Slide it until it balances alone: G.',
          task === 'MASS' ? 'Hang the 100 g near the 0 end and slide the rule until it balances again: P.' : 'Keep the edge at G, hang the 50 g on one side and slide M on the other until the rule balances.',
          'Read the marks at eye level, take five readings, then plot d₁ against d₂ and find M.',
        ],
      }}
      readingStatus="reading the metre rule"
      scene={<LabScene v={shown.o.v} state={shown.state} scene={shownScene} o={o} guided={guided || stage === 'learn'} interactive={!readOnly && work} onSlow={kit.onSlow} />}
      endsAt={endsAt}
      onHandIn={onHandIn}
      onUse2d={onUse2d}
      attemptId={attemptId}
      steps={steps}
      hint={practice && !guided ? (!scene.ready ? `Collect your apparatus from the cupboard (${scene.missing.length} to go).` : !scene.set ? 'Set up the balance (the dock’s button).' : momentsHint(state)) : null}
      objectPanel={(id) => objectPanel(id, ctx)}
      explain={explainer}
      task={
        <div className="space-y-2 text-[13.5px] leading-relaxed">
          <MomentsTaskText task={state.task} />
        </div>
      }
      notebook={<Notebook task={state.task ?? task} state={state} readOnly={readOnly} update={o.update} removeReading={o.removeReading} />}
      cupboard={{
        blurb: `Take what you need for ${what} to your bench — or drag things from the cupboard onto the tray.`,
        items: CUPBOARD_ITEMS,
        has: (id) => scene.collected.has(id as ApparatusId),
        onToggle: (id, take) => o.note(`${take ? 'collect' : 'return'}:${id}`),
        onCarry,
      }}
      dock={scene.ready ? <MomentsDock s={state} scene={scene} ops={ops} compact={kit.touch} /> : null}
      modeBar={<ModeBar views={MOMENTS_VIEW_BUTTONS} read={{ label: 'Read the rule', can: canRead }} onRead={() => canRead && (useLabView.getState().set({ mode: 'read', selected: null, spot: null }), kit.setSheet(null))} />}
      readingPanel={<MomentsReadingPanel s={state} onBack={() => useLabView.getState().set({ mode: 'bench', focus: 'balance', spot: null })} />}
      canRead={canRead}
      dragFeedback={(drag) => <MomentsDragFeedback drag={drag} />}
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
      ask={{ suggestions: ASK_SUGGESTIONS, extra: stage === 'try' ? undefined : 'Why is the graph of d₁ against d₂ a straight line through the origin?' }}
      tourSteps={TOUR}
      safety={BALANCE_SAFETY}
      briefed={attemptState.log.some((e) => e.a.startsWith('safety-briefing'))}
      onBriefing={(outcome) => oAttempt.note(`safety-briefing:${outcome}`)}
      missing={phyMomentsMissing(attemptState, seed)}
      helpRows={HELP_ROWS}
      onResetStation={() => useBench.setState(BENCH_IDLE)}
      onKey={onKey}
      debriefView={debriefView}
    />
  );
}
