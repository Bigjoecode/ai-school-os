import type { ChemElectroState, CriterionScore, ElectroTask } from '@aischool/shared';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { setAssistant } from '../../../lab3d-kit/assistant-profile';
import { ModeBar } from '../../../lab3d-kit/hud';
import { KitScene } from '../../../lab3d-kit/scene';
import { LabShell, useLabKit, useNewLogEntries } from '../../../lab3d-kit/shell';
import { notify, useLabView } from '../../../lab3d-kit/store';
import { defaultTourSteps } from '../../../lab3d-kit/tour';
import type { SimulatorProps } from '../../types';
import { TASK_TITLE, lessonTask, useElectro, type Electro } from '../actions';
import { chemElectroMissing } from '../missing';
import { Notebook, TaskBrief } from '../notebook';
import { ElectroDock, ElectroReadingPanel } from './bench-hud';
import { BENCH_IDLE, useBench } from './bench-store';
import { ASK_SUGGESTIONS, electroSafety, explainer, learnConfig, learnState } from './content';
import { demoSeed, useElectroDemo } from './demo';
import { DragController, ElectroDragFeedback } from './drag';
import { correctionFor, guideSteps } from './guide';
import { nextHint3d, objectPanel, type ActionCtx } from './lab-actions';
import { SandboxResults, SandboxSetupForm, useSandbox } from './sandbox';
import { APPARATUS, APPARATUS_LABEL, sceneFromState, type ApparatusId, type SceneState } from './scene-state';
import { ElectroCupboard, Station } from './station';
import { ELECTRO_VIEWS, electroRoom, readPoint, viewButtons } from './views';

/**
 * The 3D chemistry laboratory for electrolysis, the Daniell cell, the
 * displacement of copper by iron and the conditions for rusting, on the shared
 * lab kit — the same state, actions and marks as the 2D lab. Which experiment
 * follows from the lesson. Learn → Mrs Ada's demo → Try (plus an unmarked
 * sandbox), with Ask throughout; exam practicals are Try only, without
 * guidance.
 */

const noop = () => undefined;
const TOURS: Record<ElectroTask, ReturnType<typeof defaultTourSteps>> = {
  ELEC: defaultTourSteps({ focusId: 'voltameter', focusLabel: 'Voltameter', readLabel: 'Read the ammeter', readText: '“Read the ammeter” brings your eye level with the ammeter and the stopwatch. Read the needle to half a division (0.01 A).' }),
  CELL: defaultTourSteps({ focusId: 'voltmeter', focusLabel: 'Voltmeter', readLabel: 'Read the voltmeter', readText: '“Read the voltmeter” shows its display close up. Record the e.m.f. to 2 decimal places.' }),
  DISP: defaultTourSteps({ focusId: 'beaker', focusLabel: 'Beaker', readLabel: 'Read the thermometer', readText: '“Read the thermometer” shows the thermometer and the balance close up. Temperatures to the nearest 0.5 °C.' }),
  RUST: defaultTourSteps({ focusId: 'rack', focusLabel: 'Test tubes', readLabel: 'Read the tube', readText: '“Read the tube” shows the graduated tube close up. Level the water inside and outside first, then read to 0.5 cm³.' }),
};
const HELP_ROWS: [string, React.ReactNode][] = [
  ['Time-lapse', 'The dock’s 10× / 60× (or 1 h/s, 6 h/s for the rusting week) speeds up the slow parts'],
  ['Drags', 'Drag the copper plates into the beaker, slide the rheostat left or right, circle over the beaker to stir in the iron — or use the menus'],
];
const CUPBOARD_ITEMS = APPARATUS.map((a) => ({ id: a.id, label: a.label }));
const CARD: Record<ElectroTask, string[]> = {
  ELEC: ['Sand, weigh both plates.', 'Cathode to −; ammeter in series.', '0.50 A for 40 min (rheostat).', 'Rinse gently, dry, reweigh.'],
  CELL: ['Clean strips; Zn | ZnSO₄, Cu | CuSO₄.', 'KNO₃ salt bridge.', 'Hi-Z voltmeter: + to Cu.', 'Read; bridge out; read; replace.'],
  DISP: ['0.56 g clean iron filings.', '50 cm³ CuSO₄; thermometer in.', 'Add, stir; highest temperature.', 'Filter, wash, dry, weigh Cu.'],
  RUST: ['Clean nails: tubes A, B, C, D.', 'B boiled + oil; C CaCl₂ + stopper.', 'Moist iron wool, 50.0 cm³ air.', 'A week: level, read; observe.'],
};
const INTRO: Record<ElectroTask, { short: string; steps: string[] }> = {
  ELEC: { short: 'Electrolyse copper(II) sulphate between copper plates and test Faraday’s first law.', steps: ['Coat and goggles on. Propanone is flammable — no flames.', 'Collect the apparatus from the cupboard.', 'Sand and weigh the plates; connect the circuit; hold 0.50 A for 40 minutes.', 'Rinse gently, dry, reweigh; compare with m = QM/(nF).'] },
  CELL: { short: 'Build a zinc–copper cell and measure its e.m.f.', steps: ['Coat and goggles on; wash your hands afterwards.', 'Collect the apparatus from the cupboard.', 'Clean strips in their own solutions, joined by a KNO₃ salt bridge.', 'Read the e.m.f., then with the bridge removed; compare with 1.10 V.'] },
  DISP: { short: 'Displace copper from copper(II) sulphate with iron and compare the masses.', steps: ['Coat and goggles on. Propanone is flammable.', 'Collect the apparatus from the cupboard.', 'Weigh the filings; add to excess CuSO₄; watch the colour and temperature.', 'Filter, wash, dry and weigh the copper; work out the percentage.'] },
  RUST: { short: 'Find out what iron needs to rust, and how much of the air is oxygen.', steps: ['Coat and goggles on. Boiling water scalds.', 'Collect the apparatus from the cupboard.', 'Set up tubes A–D and the iron wool; leave them a week (time-lapse).', 'Observe the nails; read the graduated tube with the levels equal.'] },
};

function LabScene({ x, state, scene, guided, interactive, onSlow }: { x: Electro; state: ChemElectroState; scene: SceneState; guided: boolean; interactive: boolean; onSlow: () => void }) {
  const task = scene.task;
  const room = useMemo(() => electroRoom(task), [task]);
  return (
    <KitScene room={room} coatOn={scene.coat} gogglesOn={scene.goggles} presets={ELECTRO_VIEWS} read={readPoint(task)} guided={guided} onSlow={onSlow}>
      <ElectroCupboard scene={scene} />
      <Station x={x} s={state} scene={scene} interactive={interactive} card={CARD[task]} />
      {interactive && <DragController x={x} />}
    </KitScene>
  );
}

export default function ChemElectroLab3D(props: SimulatorProps<'chem-electro'>) {
  // Set on every render: another lab (biology, physics) may have changed it in this tab.
  setAssistant({ name: 'Mrs Ada', role: 'lab technician', look: 'ada', pronoun: 'her' });
  const { seed, mode, state: attemptState, onChange, readOnly, startedAt, endsAt, onHandIn, onUse2d, practicalId, attemptId, result } = props;
  const started = attemptState.log.some((e) => !e.a.startsWith('safety-briefing') && !e.a.startsWith('task:'));
  const task: ElectroTask = attemptState.task ?? lessonTask(practicalId);
  const xAttempt = useElectro({ seed, state: attemptState, onChange, readOnly, startedAt, practicalId });
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
  const xLearn = useElectro({ seed: demoSeed(seed), state: LEARN, onChange: noop, readOnly: true, startedAt, autoTask: false });
  const precautions = useMemo(() => kit.lesson?.precautions ?? [], [kit.lesson]);
  const demo = useElectroDemo({ task, studentSeed: seed, startedAt, precautions, active: stage === 'demo', onFinished: () => kit.markJourney('demo') });
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

  if (import.meta.env.DEV) Object.assign(window, { __lab3dState: attemptState, __lab3dShown: shown.state, __lab3dStage: stage, __lab3dSandbox: sandbox.state, __electro: x, __electroDemo: demo.x });
  const ctx: ActionCtx = { x, s: state, scene, open: (w) => (useLabView.getState().set({ selected: null }), kit.setSheet(w)) };
  const onCarry = useCallback(
    (id: string) => {
      x.note(`collect:${id}`);
      notify(`${APPARATUS_LABEL[id as ApparatusId]} is on your bench.`, 'success', 1500);
    },
    [x],
  );
  const canRead = scene.ready && (task === 'ELEC' ? scene.collected.has('ammeter') : task === 'CELL' ? !!state.cell.meter : task === 'DISP' ? scene.collected.has('thermometer') : !!state.rust.wool);
  const readLabel = task === 'ELEC' ? 'Read the ammeter' : task === 'CELL' ? 'Read the voltmeter' : task === 'DISP' ? 'Read the thermometer' : 'Read the tube';
  const debriefView = (c: CriterionScore) =>
    c.id === 'readings' ? { mode: 'read' as const } : c.id === 'calculations' || c.id === 'units' || c.how === 'AI' ? { mode: 'bench' as const, focus: 'bench', notebook: true } : { mode: 'bench' as const, focus: task === 'ELEC' ? 'cell' : task === 'CELL' ? 'daniell' : task === 'DISP' ? 'beaker' : 'rack' };

  return (
    <LabShell
      kit={kit}
      title="Chemistry lab"
      heading={`Chemistry laboratory · ${TASK_TITLE[task]}`}
      intro={INTRO[task]}
      readingStatus={task === 'ELEC' ? 'reading the ammeter' : task === 'CELL' ? 'reading the voltmeter' : task === 'DISP' ? 'reading the thermometer' : 'reading the graduated tube'}
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
      dock={scene.ready && camMode !== 'walk' ? <ElectroDock ctx={ctx} compact={kit.touch} /> : null}
      modeBar={<ModeBar views={viewButtons(task)} read={{ label: readLabel, can: canRead }} onRead={() => canRead && (useLabView.getState().set({ mode: 'read', selected: null, spot: null }), kit.setSheet(null))} />}
      readingPanel={<ElectroReadingPanel x={x} s={state} onBack={() => useLabView.getState().set({ mode: 'bench', focus: task === 'ELEC' ? 'meters' : task === 'CELL' ? 'volts' : task === 'DISP' ? 'beaker' : 'trough', spot: null })} />}
      canRead={canRead}
      dragFeedback={(drag) => <ElectroDragFeedback drag={drag} x={x} />}
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
      ask={{ suggestions: ASK_SUGGESTIONS, extra: stage === 'try' ? undefined : task === 'ELEC' ? 'Why does the anode lose mass?' : task === 'CELL' ? 'Why does the reading fall to zero without the bridge?' : task === 'DISP' ? 'Why does the solution turn green?' : 'Why is the water in tube B boiled?' }}
      tourSteps={TOURS[task]}
      safety={electroSafety(task)}
      briefed={attemptState.log.some((e) => e.a.startsWith('safety-briefing'))}
      onBriefing={(outcome) => xAttempt.note(`safety-briefing:${outcome}`)}
      missing={chemElectroMissing(attemptState, seed)}
      helpRows={HELP_ROWS}
      onResetStation={() => useBench.setState(BENCH_IDLE)}
      debriefView={debriefView}
    />
  );
}
