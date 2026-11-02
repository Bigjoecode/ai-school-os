import type { AcidsTask, ChemAcidsState, CriterionScore } from '@aischool/shared';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { setAssistant } from '../../../lab3d-kit/assistant-profile';
import { ModeBar } from '../../../lab3d-kit/hud';
import { KitScene } from '../../../lab3d-kit/scene';
import { LabShell, useLabKit, useNewLogEntries } from '../../../lab3d-kit/shell';
import { notify, useLabView } from '../../../lab3d-kit/store';
import { defaultTourSteps } from '../../../lab3d-kit/tour';
import type { SimulatorProps } from '../../types';
import { TASK_TITLE, lessonTask, useAcids, type Acids } from '../actions';
import { chemAcidsMissing } from '../missing';
import { Notebook, TaskBrief } from '../notebook';
import { AcidsDock, AcidsReadingPanel } from './bench-hud';
import { BENCH_IDLE, useBench } from './bench-store';
import { ASK_SUGGESTIONS, acidsSafety, explainer, learnConfig, learnState } from './content';
import { demoSeed, useAcidsDemo } from './demo';
import { AcidsDragFeedback, DragController } from './drag';
import { correctionFor, guideSteps } from './guide';
import { nextHint3d, objectPanel, type ActionCtx } from './lab-actions';
import { SandboxResults, SandboxSetupForm, useSandbox } from './sandbox';
import { APPARATUS, APPARATUS_LABEL, sceneFromState, type ApparatusId, type SceneState } from './scene-state';
import { AcidsCupboard, Station } from './station';
import { ACIDS_VIEWS, acidsRoom, readPoint, viewButtons } from './views';

/**
 * The 3D chemistry laboratory for pH and universal indicator, an indicator
 * from zobo, the reactions of dilute acids, and the hardness of water, on the
 * shared lab kit — the same state, actions and marks as the 2D lab. Which
 * experiment follows from the lesson. Learn → Mrs Ada's demo → Try (plus an
 * unmarked sandbox), with Ask throughout; exam practicals are Try only,
 * without guidance.
 */

const noop = () => undefined;
const TOURS: Record<AcidsTask, ReturnType<typeof defaultTourSteps>> = {
  PH: defaultTourSteps({ focusId: 'rack', focusLabel: 'Test tubes', readLabel: 'Compare with the chart', readText: '“Compare with the chart” holds your tubes beside the colour chart against white. Record each pH as a whole number.' }),
  IND: defaultTourSteps({ focusId: 'burette', focusLabel: 'Burette', readLabel: 'Read the burette', readText: '“Read the burette” brings your eye level with the meniscus. Read the bottom of the curve to 2 decimal places.' }),
  ACID: defaultTourSteps({ focusId: 'balance', focusLabel: 'Balance', readLabel: 'Read the balance', readText: '“Read the balance” shows its display close up. Record every mass to 2 decimal places.' }),
  HARD: defaultTourSteps({ focusId: 'burette', focusLabel: 'Soap burette', readLabel: 'Read the burette', readText: '“Read the burette” shows the soap level close up. Record the volume used to 1 decimal place.' }),
};
const HELP_ROWS: [string, React.ReactNode][] = [
  ['Time-lapse', 'While the marble reacts, the dock’s 5× / 20× speeds it up'],
  ['Drags', 'Drag a pH tube from side to side to shake it; drag the burette tap sideways to let liquid out — or use the menus'],
];
const CUPBOARD_ITEMS = APPARATUS.map((a) => ({ id: a.id, label: a.label }));
const CARD: Record<AcidsTask, string[]> = {
  PH: ['Rinse tubes; label A–I.', '2 cm³ each; 2 drops of indicator.', 'Shake; compare against white.', 'Record pH; classify; calculate.'],
  IND: ['Crush zobo; warm (water bath); filter.', 'Extract + UI in five solutions.', '25.0 cm³ NaOH vs HCl, methyl orange ×2.', 'Then 2–3 drops of extract ×2; compare.'],
  ACID: ['HCl on Mg, Zn, Cu: burning splint.', 'Warm CuO + HCl gently.', 'Marble + HCl → limewater.', '2.00 g marble, excess HCl, plug: weigh.'],
  HARD: ['Rinse and fill the soap burette.', '50.0 cm³ sample: 0.5 cm³, shake.', 'Lather lasting 2 min: read.', 'Boil 5 min, make up, filter; repeat.'],
};
const INTRO: Record<AcidsTask, { short: string; steps: string[] }> = {
  PH: { short: 'Find the pH of nine solutions with universal indicator and classify them.', steps: ['Coat and goggles on. Never taste any sample.', 'Collect the apparatus from the cupboard.', 'Rinse and label the tubes; 2 cm³ of each sample, 2 drops of indicator, shake.', 'Compare with the chart against white; record, classify and calculate.'] },
  IND: { short: 'Make an indicator from zobo and test it in a titration.', steps: ['Coat and goggles on. Ethanol is flammable — water bath only.', 'Collect the apparatus from the cupboard.', 'Crush and filter the calyces; test the extract and universal indicator in five solutions.', 'Titrate NaOH with HCl using methyl orange, then the extract; compare the titres.'] },
  ACID: { short: 'React dilute acid with metals, an oxide and a carbonate, and find the mass of CO₂ from marble.', steps: ['Coat and goggles on. Test only small volumes of hydrogen.', 'Collect the apparatus from the cupboard.', 'HCl with Mg, Zn, Cu, CuO and marble; test the gases.', 'Weigh 2 g of marble reacting with excess acid in a plugged flask.'] },
  HARD: { short: 'Compare the hardness of five water samples with soap solution, before and after boiling.', steps: ['Coat and goggles on. Boiling water scalds.', 'Collect the apparatus from the cupboard.', 'Soap from the burette into 50.0 cm³ of each sample until a lather lasts 2 minutes.', 'Boil the hard samples, make up, filter, repeat; work out temporary and permanent hardness.'] },
};

function LabScene({ x, state, scene, guided, interactive, onSlow }: { x: Acids; state: ChemAcidsState; scene: SceneState; guided: boolean; interactive: boolean; onSlow: () => void }) {
  const task = scene.task;
  const room = useMemo(() => acidsRoom(task), [task]);
  const level = task === 'HARD' ? state.hard.burette : state.ind.burette;
  return (
    <KitScene room={room} coatOn={scene.coat} gogglesOn={scene.goggles} presets={ACIDS_VIEWS} read={readPoint(task, level ?? 10)} guided={guided} onSlow={onSlow} assistantSpot={[-1.55, -0.95]}>
      <AcidsCupboard scene={scene} />
      <Station x={x} s={state} scene={scene} interactive={interactive} card={CARD[task]} />
      {interactive && <DragController x={x} />}
    </KitScene>
  );
}

export default function ChemAcidsLab3D(props: SimulatorProps<'chem-acids'>) {
  // Set on every render: another lab (biology, physics) may have changed it in this tab.
  setAssistant({ name: 'Mrs Ada', role: 'lab technician', look: 'ada', pronoun: 'her' });
  const { seed, mode, state: attemptState, onChange, readOnly, startedAt, endsAt, onHandIn, onUse2d, practicalId, attemptId, result } = props;
  const started = attemptState.log.some((e) => !e.a.startsWith('safety-briefing') && !e.a.startsWith('task:'));
  const task: AcidsTask = attemptState.task ?? lessonTask(practicalId);
  const xAttempt = useAcids({ seed, state: attemptState, onChange, readOnly, startedAt, practicalId });
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
  const LEARN = useMemo(() => learnState(task), [task]);
  const LEARN_CONFIG = useMemo(() => learnConfig(task), [task]);
  const xLearn = useAcids({ seed: demoSeed(seed), state: LEARN, onChange: noop, readOnly: true, startedAt, autoTask: false });
  const precautions = useMemo(() => kit.lesson?.precautions ?? [], [kit.lesson]);
  const demo = useAcidsDemo({ task, studentSeed: seed, startedAt, precautions, active: stage === 'demo', onFinished: () => kit.markJourney('demo') });
  const x = stage === 'sandbox' ? sandbox.x : xAttempt;
  stopRef.current = () => x.setSpeed(1);
  const state = stage === 'sandbox' ? sandbox.state : attemptState;
  const scene = useMemo(() => sceneFromState(state), [state]);
  const shown = stage === 'learn' ? { x: xLearn, state: LEARN } : stage === 'demo' ? { x: demo.x, state: demo.state } : { x, state };
  const shownScene = useMemo(() => sceneFromState(shown.state), [shown.state]);
  const camMode = useLabView((v) => v.mode);
  useEffect(() => () => useBench.setState(BENCH_IDLE), []);

  const steps = guided ? guideSteps(state, scene, camMode, x) : [];
  useNewLogEntries(state.log, stage, (fresh) => {
    if (guided && fresh.length) {
      let found = null;
      for (const e of fresh) found = correctionFor(e.a, state, x.v) ?? found;
      if (found) kit.correct(found);
    }
  });

  if (import.meta.env.DEV) Object.assign(window, { __lab3dState: attemptState, __lab3dShown: shown.state, __lab3dStage: stage, __lab3dSandbox: sandbox.state, __acids: x, __acidsDemo: demo.x });
  const ctx: ActionCtx = { x, s: state, scene, open: (w) => (useLabView.getState().set({ selected: null }), kit.setSheet(w)) };
  const onCarry = useCallback(
    (id: string) => {
      x.note(`collect:${id}`);
      notify(`${APPARATUS_LABEL[id as ApparatusId]} is on your bench.`, 'success', 1500);
    },
    [x],
  );
  const canRead = scene.ready && (task === 'PH' ? scene.collected.has('chart') : task === 'IND' ? state.ind.burette !== null : task === 'ACID' ? scene.collected.has('balance') : state.hard.burette !== null);
  const readLabel = task === 'PH' ? 'Compare with the chart' : task === 'ACID' ? 'Read the balance' : 'Read the burette';
  const debriefView = (c: CriterionScore) =>
    c.id === 'readings' ? { mode: 'read' as const } : c.id === 'calculations' || c.id === 'units' || c.how === 'AI' ? { mode: 'bench' as const, focus: 'bench', notebook: true } : { mode: 'bench' as const, focus: task === 'PH' ? 'rack' : task === 'IND' ? 'titration' : task === 'ACID' ? 'acidTubes' : 'flask' };

  return (
    <LabShell
      kit={kit}
      title="Chemistry lab"
      heading={`Chemistry laboratory · ${TASK_TITLE[task]}`}
      intro={INTRO[task]}
      readingStatus={task === 'PH' ? 'comparing with the chart' : task === 'ACID' ? 'reading the balance' : 'reading the burette'}
      scene={<LabScene x={shown.x} state={shown.state} scene={shownScene} guided={guided || stage === 'learn'} interactive={!readOnly && work} onSlow={kit.onSlow} />}
      endsAt={endsAt}
      onHandIn={onHandIn}
      onUse2d={onUse2d}
      attemptId={attemptId}
      steps={steps}
      hint={practice && !guided ? nextHint3d(state, scene, x) : null}
      objectPanel={(id) => objectPanel(id, ctx)}
      explain={explainer}
      task={
        <div className="space-y-2 text-[13.5px] leading-relaxed">
          <TaskBrief v={x.v} />
          <p className="text-[12.5px] font-semibold">Safety</p>
          <p className="text-[13px] text-muted-foreground">
            Goggles: {scene.goggles ? 'on' : 'not on'} · Lab coat: {scene.coat ? 'on' : 'not on'}
          </p>
        </div>
      }
      notebook={<Notebook v={x.v} state={state} readOnly={readOnly} update={x.update} className="border-0 p-0 shadow-none sm:p-0" />}
      cupboard={{
        blurb: 'Take what you need to your bench — or drag things from the cupboard onto the tray.',
        items: CUPBOARD_ITEMS,
        has: (id) => scene.collected.has(id as ApparatusId),
        onToggle: (id, take) => x.note(`${take ? 'collect' : 'return'}:${id}`),
        onCarry,
      }}
      dock={scene.ready && camMode !== 'walk' ? <AcidsDock ctx={ctx} compact={kit.touch} /> : null}
      modeBar={<ModeBar views={viewButtons(task)} read={{ label: readLabel, can: canRead }} onRead={() => canRead && (useLabView.getState().set({ mode: 'read', selected: null, spot: null }), kit.setSheet(null))} />}
      readingPanel={<AcidsReadingPanel x={x} s={state} onBack={() => useLabView.getState().set({ mode: 'bench', focus: task === 'PH' ? 'rack' : task === 'IND' ? 'titration' : task === 'ACID' ? 'balance' : 'flask', spot: null })} />}
      canRead={canRead}
      dragFeedback={(drag) => <AcidsDragFeedback drag={drag} x={x} />}
      learn={LEARN_CONFIG}
      demo={demo.player}
      demoPanel={demo.panel}
      sandbox={{
        form: (
          <SandboxSetupForm
            initial={sandbox.setup}
            onStart={(s) => {
              sandbox.start(s);
              kit.goStage('sandbox');
            }}
          />
        ),
        results: <SandboxResults sandbox={sandbox} />,
      }}
      ask={{ suggestions: ASK_SUGGESTIONS, extra: stage === 'try' ? undefined : task === 'PH' ? 'Why is ethanoic acid called a weak acid?' : task === 'IND' ? 'Why is zobo red in acid?' : task === 'ACID' ? 'Why does limewater turn milky?' : 'Why does boiling soften some water?' }}
      tourSteps={TOURS[task]}
      safety={acidsSafety(task)}
      briefed={attemptState.log.some((e) => e.a.startsWith('safety-briefing'))}
      onBriefing={(outcome) => xAttempt.note(`safety-briefing:${outcome}`)}
      missing={chemAcidsMissing(attemptState, seed)}
      helpRows={HELP_ROWS}
      onResetStation={() => useBench.setState(BENCH_IDLE)}
      debriefView={debriefView}
    />
  );
}
