import type { ChemRatesState, CriterionScore, RatesTask } from '@aischool/shared';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Kbd } from '@/components/ui/kbd';
import { setAssistant } from '../../../lab3d-kit/assistant-profile';
import { ModeBar } from '../../../lab3d-kit/hud';
import { KitScene } from '../../../lab3d-kit/scene';
import { LabShell, useLabKit, useNewLogEntries } from '../../../lab3d-kit/shell';
import { play } from '../../../lab3d-kit/sound';
import { notify, useLabView } from '../../../lab3d-kit/store';
import { defaultTourSteps } from '../../../lab3d-kit/tour';
import type { SimulatorProps } from '../../types';
import { lessonTask, ratesHint, useLive, useRates, type Rates } from '../actions';
import { chemRatesMissing } from '../missing';
import { Notebook, RatesTaskText } from '../notebook';
import { RatesDock, RatesDragFeedback, RatesReadingPanel } from './bench-hud';
import { BENCH_IDLE, useBench } from './bench-store';
import { ASK_SUGGESTIONS, explainer, learnConfig, learnState, ratesSafety } from './content';
import { demoSeed } from './demo';
import { useRatesDemo } from './demo-hook';
import { DragController } from './drag';
import { correctionFor, guideSteps } from './guide';
import { makeOps, objectPanel, type ActionCtx } from './lab-actions';
import { SandboxResults, SandboxSetupForm, useSandbox } from './sandbox';
import { APPARATUS, APPARATUS_LABEL, sceneFromState, type ApparatusId, type SceneState } from './scene-state';
import { RatesCupboard, Station } from './station';
import { RATES_VIEWS, ratesRoom, readPoint, VIEW_BUTTONS } from './views';

/**
 * The 3D chemistry laboratory for rates of reaction (magnesium and acid with a
 * gas syringe, or the disappearing cross), on the shared lab kit — the same
 * state, actions and marks as the 2D lab. The student puts on goggles,
 * collects the apparatus, sets up, then follows the reaction on the live
 * clock: reading the syringe every 30 s, or stopping the watch as the cross
 * disappears from view; then plots the graph in the notebook.
 */

const noop = () => undefined;
const TOURS: Record<RatesTask, ReturnType<typeof defaultTourSteps>> = {
  MG: defaultTourSteps({ focusId: 'syringe', focusLabel: 'Gas syringe', readLabel: 'Read the syringe', readText: '“Read the syringe” brings your eye level with the plunger. Read the scale at its inner end, to the nearest 0.5 cm³, at every 30 s mark.' }),
  CROSS: defaultTourSteps({ focusId: 'flask', focusLabel: 'Conical flask', readLabel: 'Read the thermometer', readText: '“Read the thermometer” brings your eye level with the top of the red column. Read it to 1 °C.' }),
};
const HELP_ROWS: [string, React.ReactNode][] = [
  ['Stopwatch', <><Kbd>S</Kbd> start / stop</>],
  ['Read the syringe (magnesium)', <><Kbd>Enter</Kbd> at each 30 s mark, <Kbd>R</Kbd> eye level</>],
  ['Swirl (thiosulphate)', <><Kbd>W</Kbd>, or drag the flask in circles</>],
  ['Time-lapse', 'The dock’s 1× / 2× / 5×: the clock slows to real time near each reading'],
];
const CUPBOARD_ITEMS = APPARATUS.map((a) => ({ id: a.id, label: a.label }));
const TASK_LINES: Record<RatesTask, string[]> = {
  MG: ['50 cm³ 1.0 M HCl, then 0.50 M.', 'Clean Mg; bung at once; watch.', 'Read the syringe every 30 s.', 'V–t curves; tangent at t = 0.'],
  CROSS: ['50, 40, 30, 20, 10 cm³ + water to 50.', '5 cm³ acid; watch; swirl.', 'Look down: stop as the cross goes.', '10 cm³ at 30–60 °C. Plot 1/t.'],
};

function LabScene({ o, state, scene, guided, interactive, onSlow }: { o: Rates; state: ChemRatesState; scene: SceneState; guided: boolean; interactive: boolean; onSlow: () => void }) {
  const task: RatesTask = state.task ?? 'MG';
  const room = useMemo(() => ratesRoom(task), [task]);
  const read = readPoint(task, task === 'MG' ? o.syringeNow() : o.thermoNow());
  return (
    <KitScene room={room} coatOn={scene.coat} gogglesOn={scene.goggles} presets={RATES_VIEWS} read={read} guided={guided} onSlow={onSlow}>
      <RatesCupboard scene={scene} />
      <Station o={o} state={state} scene={scene} interactive={interactive} card={TASK_LINES[task]} />
      {interactive && <DragController o={o} />}
    </KitScene>
  );
}

export default function ChemRatesLab3D(props: SimulatorProps<'chem-rates'>) {
  // Set on every render: another lab (biology, physics) may have changed it in this tab.
  setAssistant({ name: 'Mrs Ada', role: 'lab technician', look: 'ada', pronoun: 'her' });
  const { seed, mode, state: attemptState, onChange, readOnly, startedAt, endsAt, onHandIn, onUse2d, practicalId, attemptId, result } = props;
  const started = attemptState.log.some((e) => !e.a.startsWith('safety-briefing') && !e.a.startsWith('task:'));
  const oAttempt = useRates({ seed, state: attemptState, onChange, readOnly, startedAt, practicalId });
  const task: RatesTask = attemptState.task ?? lessonTask(practicalId);
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
  const oLearn = useRates({ seed: demoSeed(seed), state: LEARN, onChange: noop, readOnly: true, startedAt, autoTask: false });
  const precautions = useMemo(() => kit.lesson?.precautions ?? [], [kit.lesson]);
  const demo = useRatesDemo({ task, studentSeed: seed, startedAt, precautions, active: stage === 'demo', onFinished: () => kit.markJourney('demo') });
  const o = stage === 'sandbox' ? sandbox.o : oAttempt;
  stopRef.current = () => o.setSpeed(1);
  const state = stage === 'sandbox' ? sandbox.state : attemptState;
  const scene = useMemo(() => sceneFromState(state), [state]);
  const shown = stage === 'learn' ? { o: oLearn, state: LEARN } : stage === 'demo' ? { o: demo.o, state: demo.state } : { o, state };
  const shownScene = useMemo(() => sceneFromState(shown.state), [shown.state]);
  const ops = makeOps(o);
  const camMode = useLabView((v) => v.mode);
  useEffect(() => () => useBench.setState(BENCH_IDLE), []);

  // the guide also follows the live reaction (the gas stopping): re-check it twice a second while one runs
  useLive(guided && (!!o.mgLive || !!o.crossLive), 500);
  const steps = guided ? guideSteps(state, scene, camMode, o) : [];
  const sceneBefore = useRef(scene);
  useNewLogEntries(state.log, stage, (fresh) => {
    if (guided && fresh.length) {
      let found = null;
      for (const e of fresh) found = correctionFor(e.a, state, o.v, sceneBefore.current) ?? found;
      if (found) kit.correct(found);
    }
    sceneBefore.current = scene;
  });

  if (import.meta.env.DEV) Object.assign(window, { __lab3dState: attemptState, __lab3dShown: shown.state, __lab3dStage: stage, __lab3dSandbox: sandbox.state, __ratesBench: useBench, __ratesOps: ops, __rates: o });
  const ctx: ActionCtx = { o, s: state, scene, ops, open: (w) => (useLabView.getState().set({ selected: null }), kit.setSheet(w)) };
  const onCarry = useCallback(
    (id: string) => {
      o.note(`collect:${id}`);
      notify(`${APPARATUS_LABEL[id as ApparatusId]} is on your bench.`, 'success', 1500);
    },
    [o],
  );
  const mg = task === 'MG';
  const canRead = scene.set && (mg ? true : scene.collected.has('thermometer'));
  const onKey = (e: KeyboardEvent, type: 'down' | 'up') => {
    if (type === 'up' || useLabView.getState().mode === 'walk' || !scene.set) return false;
    const k = e.key.toLowerCase();
    if (k === 's') ops.watch();
    else if (mg && k === 'enter') ops.read();
    else if (!mg && k === 'w') ops.swirl();
    else if (!mg && k === 'enter') ops.record();
    else return false;
    play('tick');
    return true;
  };
  const debriefView = (c: CriterionScore) => (c.id === 'setup' || c.id === 'procedure' ? { mode: 'bench' as const, focus: mg ? 'flask' : 'top' } : c.id === 'readings' ? { mode: 'bench' as const, focus: mg ? 'syringe' : 'stopwatchX', notebook: true } : { mode: 'bench' as const, focus: 'bench', notebook: true });
  const what = mg ? 'the rate of magnesium with acid' : 'the disappearing cross';

  return (
    <LabShell
      kit={kit}
      title="Chemistry lab"
      heading={`Chemistry laboratory — ${what}`}
      intro={{
        short: mg ? 'Follow magnesium and acid with a gas syringe: read it every 30 s, plot V–t and find the initial rate.' : 'Time the disappearing cross at five concentrations and four temperatures, and plot 1/t.',
        steps: mg
          ? ['Put on your goggles (hooks by the door). No flames: hydrogen burns.', 'Collect the flask, gas syringe, stand, stopwatch, cylinder, ribbon, sandpaper, balance and a waste beaker.', 'Clean and weigh the magnesium, zero the syringe, drop it in, bung at once and start the watch.', 'Read the syringe every 30 s until no more gas; repeat with 0.50 mol dm⁻³ acid; plot and draw the tangents.']
          : ['Put on your goggles; the room is ventilated for the sulphur dioxide.', 'Collect the flask, cylinders, paper cross, thermometer, water bath, stopwatch and wash bottle.', 'Make up each mixture to 50 cm³, add 5 cm³ acid, start the watch, swirl and look down until the cross goes.', 'Repeat at 30–60 °C, then plot 1/t against the volume of thiosulphate.'],
      }}
      readingStatus={mg ? 'reading the gas syringe' : 'reading the thermometer'}
      scene={<LabScene o={shown.o} state={shown.state} scene={shownScene} guided={guided || stage === 'learn'} interactive={!readOnly && work} onSlow={kit.onSlow} />}
      endsAt={endsAt}
      onHandIn={onHandIn}
      onUse2d={onUse2d}
      attemptId={attemptId}
      steps={steps}
      hint={practice && !guided ? (!scene.ready ? `Collect your apparatus from the cupboard (${scene.missing.length} to go).` : !scene.set ? 'Set up the apparatus (the dock’s button).' : ratesHint(state, o)) : null}
      objectPanel={(id) => objectPanel(id, ctx)}
      explain={explainer}
      task={
        <div className="space-y-2 text-[13.5px] leading-relaxed">
          <RatesTaskText task={state.task ?? task} v={o.v} />
          <p className="text-[12.5px] font-semibold">Safety</p>
          <p className="text-[13px] text-muted-foreground">Goggles: {scene.goggles ? 'on' : 'not on'} · Lab coat: {scene.coat ? 'on' : 'not on'}</p>
        </div>
      }
      notebook={<Notebook v={o.v} state={state} readOnly={readOnly} update={o.update} removeCross={o.removeCross} discard={o.discard} className="border-0 p-0 shadow-none sm:p-0" />}
      cupboard={{
        blurb: `Take what you need for ${what} to your bench — or drag things from the cupboard onto the tray.`,
        items: CUPBOARD_ITEMS,
        has: (id) => scene.collected.has(id as ApparatusId),
        onToggle: (id, take) => o.note(`${take ? 'collect' : 'return'}:${id}`),
        onCarry,
      }}
      dock={scene.ready ? <RatesDock o={o} s={state} scene={scene} ops={ops} compact={kit.touch} /> : null}
      modeBar={<ModeBar views={VIEW_BUTTONS(task)} read={{ label: mg ? 'Read the syringe' : 'Read the thermometer', can: canRead }} onRead={() => canRead && (useLabView.getState().set({ mode: 'read', selected: null, spot: null }), kit.setSheet(null))} />}
      readingPanel={<RatesReadingPanel o={o} s={state} ops={ops} onBack={() => useLabView.getState().set({ mode: 'bench', focus: mg ? 'syringe' : 'flask', spot: null })} />}
      canRead={canRead}
      dragFeedback={(drag) => <RatesDragFeedback drag={drag} />}
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
      ask={{ suggestions: ASK_SUGGESTIONS, extra: stage === 'try' ? undefined : mg ? 'Why does the curve level off?' : 'Why is 1/t a measure of the rate?' }}
      tourSteps={TOURS[task]}
      safety={ratesSafety(task)}
      briefed={attemptState.log.some((e) => e.a.startsWith('safety-briefing'))}
      onBriefing={(outcome) => oAttempt.note(`safety-briefing:${outcome}`)}
      missing={chemRatesMissing(attemptState, seed)}
      helpRows={HELP_ROWS}
      onResetStation={() => useBench.setState(BENCH_IDLE)}
      onKey={onKey}
      debriefView={debriefView}
    />
  );
}
