import type { ChemSaltsState, CriterionScore, SaltsTask } from '@aischool/shared';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { setAssistant } from '../../../lab3d-kit/assistant-profile';
import { ModeBar } from '../../../lab3d-kit/hud';
import { KitScene } from '../../../lab3d-kit/scene';
import { LabShell, useLabKit, useNewLogEntries } from '../../../lab3d-kit/shell';
import { notify, useLabView } from '../../../lab3d-kit/store';
import { defaultTourSteps } from '../../../lab3d-kit/tour';
import type { SimulatorProps } from '../../types';
import { TASK_TITLE, lessonTask, useSalts, type Salts } from '../actions';
import { chemSaltsMissing } from '../missing';
import { Notebook, TaskBrief } from '../notebook';
import { SaltsDock, SaltsReadingPanel } from './bench-hud';
import { BENCH_IDLE, useBench } from './bench-store';
import { ASK_SUGGESTIONS, explainer, learnConfig, learnState, saltsSafety } from './content';
import { demoSeed, useSaltsDemo } from './demo';
import { DragController, SaltsDragFeedback } from './drag';
import { correctionFor, guideSteps } from './guide';
import { nextHint3d, objectPanel, type ActionCtx } from './lab-actions';
import { SandboxResults, SandboxSetupForm, useSandbox } from './sandbox';
import { APPARATUS, APPARATUS_LABEL, sceneFromState, type ApparatusId, type SceneState } from './scene-state';
import { SaltsCupboard, Station } from './station';
import { SALTS_VIEWS, readPoint, saltsRoom, viewButtons } from './views';

/**
 * The 3D chemistry laboratory for preparing salts, paper chromatography and
 * recrystallisation with a melting point, on the shared lab kit — the same
 * state, actions and marks as the 2D lab. Which practical follows from the
 * lesson. Learn → Mrs Ada's demo → Try (plus an unmarked sandbox), with Ask
 * throughout; exam practicals are Try only, without guidance.
 */

const noop = () => undefined;
const TOURS: Record<SaltsTask, ReturnType<typeof defaultTourSteps>> = {
  SOL: defaultTourSteps({ focusId: 'beaker', focusLabel: 'Beaker', readLabel: 'Read the balance', readText: '“Read the balance” brings your eye to the balance display. Record every digit: 2 decimal places.' }),
  PPT: defaultTourSteps({ focusId: 'beaker', focusLabel: 'Beaker', readLabel: 'Read the balance', readText: '“Read the balance” brings your eye to the balance display. Record every digit: 2 decimal places.' }),
  CHROM: defaultTourSteps({ focusId: 'paper', focusLabel: 'Chromatography paper', readLabel: 'Measure the paper', readText: '“Measure the paper” lays the chromatogram beside a ruler. Measure from the baseline to each spot’s centre and to the solvent front, to the nearest mm.' }),
  MP: defaultTourSteps({ focusId: 'oilBath', focusLabel: 'Oil bath', readLabel: 'Read the thermometer', readText: '“Read the thermometer” shows the thermometer and the capillary close up. Read it when melting starts and when the last solid has gone.' }),
};
const HELP_ROWS: [string, React.ReactNode][] = [
  ['Time-lapse', 'The dock’s 1× / 5× / 20× (or 10× / 60×) speeds up warming, evaporating, cooling and the solvent rising'],
  ['Drags', 'Drag a spatula of CuO from the jar to the beaker, circle over a beaker to stir, drag the paper into the tank — or use the menus'],
];
const CUPBOARD_ITEMS = APPARATUS.map((a) => ({ id: a.id, label: a.label }));
const CARD: Record<SaltsTask, string[]> = {
  SOL: ['50.0 cm³ dil. H₂SO₄, warm gently.', 'CuO until some stays undissolved.', 'Filter; evaporate to the cryst. point.', 'Cool, filter, wash, dry, weigh.'],
  PPT: ['25.0 cm³ + 30 cm³ (excess); stir.', 'Weigh dry filter paper; filter.', 'Rinse, wash with distilled water.', 'Dry to constant mass; % yield.'],
  CHROM: ['Pencil baseline 1.5 cm up.', 'Spot ink, A, B; dry; re-spot.', 'Solvent BELOW the line; cover.', 'Mark front; Rf from the baseline.'],
  MP: ['Minimum boiling water; filter hot.', 'Cool slowly, then ice; wash, dry.', 'Capillary in the oil bath.', 'Near m.p.: 1–2 °C per minute.'],
};

function LabScene({ x, state, scene, guided, interactive, onSlow }: { x: Salts; state: ChemSaltsState; scene: SceneState; guided: boolean; interactive: boolean; onSlow: () => void }) {
  const task = scene.task;
  const room = useMemo(() => saltsRoom(task), [task]);
  return (
    <KitScene room={room} coatOn={scene.coat} gogglesOn={scene.goggles} presets={SALTS_VIEWS} read={readPoint(task)} guided={guided} onSlow={onSlow}>
      <SaltsCupboard scene={scene} />
      <Station x={x} s={state} scene={scene} interactive={interactive} card={CARD[task]} />
      {interactive && <DragController x={x} />}
    </KitScene>
  );
}

export default function ChemSaltsLab3D(props: SimulatorProps<'chem-salts'>) {
  // Set on every render: another lab (biology, physics) may have changed it in this tab.
  setAssistant({ name: 'Mrs Ada', role: 'lab technician', look: 'ada', pronoun: 'her' });
  const { seed, mode, state: attemptState, onChange, readOnly, startedAt, endsAt, onHandIn, onUse2d, practicalId, attemptId, result } = props;
  const started = attemptState.log.some((e) => !e.a.startsWith('safety-briefing') && !e.a.startsWith('task:'));
  const task: SaltsTask = attemptState.task ?? lessonTask(practicalId);
  const xAttempt = useSalts({ seed, state: attemptState, onChange, readOnly, startedAt, practicalId });
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
  const xLearn = useSalts({ seed: demoSeed(seed), state: LEARN, onChange: noop, readOnly: true, startedAt, autoTask: false });
  const precautions = useMemo(() => kit.lesson?.precautions ?? [], [kit.lesson]);
  const demo = useSaltsDemo({ task, studentSeed: seed, startedAt, precautions, active: stage === 'demo', onFinished: () => kit.markJourney('demo') });
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

  if (import.meta.env.DEV) Object.assign(window, { __lab3dState: attemptState, __lab3dShown: shown.state, __lab3dStage: stage, __lab3dSandbox: sandbox.state, __salts: x, __saltsDemo: demo.x });
  const ctx: ActionCtx = { x, s: state, scene, open: (w) => (useLabView.getState().set({ selected: null }), kit.setSheet(w)) };
  const onCarry = useCallback(
    (id: string) => {
      x.note(`collect:${id}`);
      notify(`${APPARATUS_LABEL[id as ApparatusId]} is on your bench.`, 'success', 1500);
    },
    [x],
  );
  const canRead = scene.ready && (task === 'CHROM' ? state.chrom.developed !== null : task === 'MP' ? scene.collected.has('oilBath') : scene.collected.has('balance'));
  const readLabel = task === 'CHROM' ? 'Measure the paper' : task === 'MP' ? 'Read the thermometer' : 'Read the balance';
  const debriefView = (c: CriterionScore) =>
    c.id === 'readings' ? { mode: 'read' as const } : c.id === 'calculations' || c.id === 'units' || c.how === 'AI' ? { mode: 'bench' as const, focus: 'bench', notebook: true } : { mode: 'bench' as const, focus: task === 'CHROM' ? 'tank' : task === 'PPT' ? 'funnel' : 'heat' };

  return (
    <LabShell
      kit={kit}
      title="Chemistry lab"
      heading={`Chemistry laboratory · ${TASK_TITLE[task]}`}
      intro={{
        short: task === 'CHROM' ? 'Separate an ink by paper chromatography and identify its dyes from their Rf values.' : task === 'MP' ? 'Purify benzoic acid by recrystallisation and compare melting points.' : task === 'PPT' ? 'Prepare an insoluble salt by precipitation and find the percentage yield.' : 'Prepare blue copper(II) sulphate crystals from CuO and acid and find the yield.',
        steps:
          task === 'CHROM'
            ? ['Coat and goggles on (hooks by the door). No flames near ethanol.', 'Collect the tank, paper, ruler and capillary tubes.', 'Pencil baseline, small spots, solvent below the line, lid on.', 'Mark the front, measure from the baseline, work out Rf.']
            : task === 'MP'
              ? ['Coat and goggles on. Boiling water and hot oil burn.', 'Collect the apparatus from the cupboard.', 'Dissolve in the minimum boiling water, filter hot, cool slowly then in ice.', 'Melting ranges in the oil bath: slowly near the melting point.']
              : task === 'PPT'
                ? ['Coat and goggles on. Some salts are toxic: wash your hands after.', 'Collect the apparatus from the cupboard.', 'Mix, weigh the filter paper, filter, wash, dry to constant mass.', 'Record the masses and work out the yield.']
                : ['Coat and goggles on. Warm the acid gently — hot acid spits.', 'Collect the apparatus from the cupboard.', 'Excess CuO, filter, evaporate to the crystallisation point, cool.', 'Filter, wash, dry between papers, weigh; percentage yield.'],
      }}
      readingStatus={task === 'CHROM' ? 'measuring the chromatogram' : task === 'MP' ? 'reading the thermometer' : 'reading the balance'}
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
      dock={scene.ready && camMode !== 'walk' ? <SaltsDock ctx={ctx} compact={kit.touch} /> : null}
      modeBar={<ModeBar views={viewButtons(task)} read={{ label: readLabel, can: canRead }} onRead={() => canRead && (useLabView.getState().set({ mode: 'read', selected: null, spot: null }), kit.setSheet(null))} />}
      readingPanel={<SaltsReadingPanel x={x} s={state} onBack={() => useLabView.getState().set({ mode: 'bench', focus: task === 'CHROM' ? 'paper' : task === 'MP' ? 'oil' : 'balance', spot: null })} />}
      canRead={canRead}
      dragFeedback={(drag) => <SaltsDragFeedback drag={drag} />}
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
      ask={{ suggestions: ASK_SUGGESTIONS, extra: stage === 'try' ? undefined : task === 'CHROM' ? 'Why must the solvent be below the baseline?' : task === 'MP' ? 'Why heat slowly near the melting point?' : 'Why not evaporate to dryness?' }}
      tourSteps={TOURS[task]}
      safety={saltsSafety(task)}
      briefed={attemptState.log.some((e) => e.a.startsWith('safety-briefing'))}
      onBriefing={(outcome) => xAttempt.note(`safety-briefing:${outcome}`)}
      missing={chemSaltsMissing(attemptState, seed)}
      helpRows={HELP_ROWS}
      onResetStation={() => useBench.setState(BENCH_IDLE)}
      debriefView={debriefView}
    />
  );
}
