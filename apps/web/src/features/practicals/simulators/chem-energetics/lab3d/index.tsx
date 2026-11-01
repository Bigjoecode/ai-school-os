import type { ChemEnergeticsState, CriterionScore, EnergeticsTask } from '@aischool/shared';
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
import { energeticsHint, lessonTask, openRun, openTube, useEnergetics, useLive, type Energetics } from '../actions';
import { chemEnergeticsMissing } from '../missing';
import { EnTaskText, Notebook } from '../notebook';
import { EnDock, EnDragFeedback, EnReadingPanel } from './bench-hud';
import { BENCH_IDLE, useBench } from './bench-store';
import { ASK_SUGGESTIONS, enSafety, explainer, learnConfig, learnState } from './content';
import { demoSeed } from './demo';
import { useEnergeticsDemo } from './demo-hook';
import { DragController } from './drag';
import { correctionFor, guideSteps } from './guide';
import { makeOps, objectPanel, type ActionCtx } from './lab-actions';
import { SandboxResults, SandboxSetupForm, useSandbox } from './sandbox';
import { APPARATUS, APPARATUS_LABEL, sceneFromState, type ApparatusId, type SceneState } from './scene-state';
import { BAYO_SPOT } from '../../phy-common/lab3d/common';
import { EnCupboard, Station } from './station';
import { BULB, CUP_DIM, EN_VIEWS, enRoom, readPoint, VIEW_BUTTONS, type V3 } from './views';

/**
 * The 3D chemistry laboratory for energy changes and solubility (heat of
 * neutralisation, heat of solution, the solubility curve of KNO₃), on the
 * shared lab kit — the same state, actions and marks as the 2D lab. The
 * student puts on goggles, collects the apparatus, sets up the cup (or the
 * burette and water bath), then watches the live thermometer on the lab clock
 * (time-lapse when nothing much happens) and records what it shows.
 */

const noop = () => undefined;
const TOURS: Record<EnergeticsTask, ReturnType<typeof defaultTourSteps>> = {
  NEUT: defaultTourSteps({ focusId: 'cup', focusLabel: 'Polystyrene cup', readLabel: 'Read the thermometer', readText: '“Read the thermometer” brings your eye level with the top of the red column. Read it to the nearest 0.5 °C.' }),
  SOLN: defaultTourSteps({ focusId: 'cup', focusLabel: 'Polystyrene cup', readLabel: 'Read the thermometer', readText: '“Read the thermometer” brings your eye level with the top of the red column. Read it to the nearest 0.5 °C.' }),
  SOLY: defaultTourSteps({ focusId: 'tube', focusLabel: 'Boiling tube', readLabel: 'Read the thermometer', readText: '“Read the thermometer” brings your eye level with the column in the tube: read it the moment the first crystals appear.' }),
};
const HELP_ROWS: [string, React.ReactNode][] = [
  ['Read the thermometer', <><Kbd>Enter</Kbd> records it, <Kbd>R</Kbd> eye level</>],
  ['Stir', <><Kbd>W</Kbd>, or drag the cup / tube in circles</>],
  ['Crystals (solubility)', <><Kbd>C</Kbd> the moment they appear</>],
  ['Time-lapse', 'The dock’s 1× / 2× / 5× / 10×: the clock slows to real time when it matters'],
];
const CUPBOARD_ITEMS = APPARATUS.map((a) => ({ id: a.id, label: a.label }));
const TASK_LINES: Record<EnergeticsTask, string[]> = {
  NEUT: ['50.0 cm³ HCl in the cup: θ.', '50.0 cm³ NaOH: θ. Mean = initial.', 'Pour, lid, stir: highest θ.', 'Q = 100×4.2×ΔT; ΔH = −Q/n.'],
  SOLN: ['50.0 cm³ water: θ.', '4.00 g NH₄NO₃: stir, lowest θ.', 'Q = 50.0×4.2×ΔT; ΔH = +Q/n.', 'Compare 2.00 g NaOH.'],
  SOLY: ['4.0 g KNO₃ + 5.0 cm³ water.', 'Warm to dissolve; cool, stir.', 'θ at the first crystals.', '+1.0 cm³ each time; plot S–θ.'],
};

function bulbOf(o: Energetics, state: ChemEnergeticsState): V3 {
  if (state.task === 'SOLY') return o.phase() === 'heat' ? BULB.tubeBath : BULB.tubeRack;
  const w = o.thermoWhere();
  if (w === 'B') return BULB.cylB;
  const lift = state.setup.support ? CUP_DIM.lift : 0;
  return [BULB.cup[0], BULB.cup[1] + lift, BULB.cup[2]];
}

function LabScene({ o, state, scene, guided, interactive, onSlow }: { o: Energetics; state: ChemEnergeticsState; scene: SceneState; guided: boolean; interactive: boolean; onSlow: () => void }) {
  const task: EnergeticsTask = state.task ?? 'NEUT';
  const room = useMemo(() => enRoom(task), [task]);
  useLive(o.cupLive() || o.phase() !== 'idle', 250);
  const read = readPoint(bulbOf(o, state), task === 'SOLY' ? o.tubeThermo() : o.thermoNow());
  return (
    <KitScene room={room} coatOn={scene.coat} gogglesOn={scene.goggles} presets={EN_VIEWS} read={read} guided={guided} onSlow={onSlow} assistantSpot={BAYO_SPOT}>
      <EnCupboard scene={scene} />
      <Station o={o} state={state} scene={scene} interactive={interactive} card={TASK_LINES[task]} />
      {interactive && <DragController o={o} />}
    </KitScene>
  );
}

export default function ChemEnergeticsLab3D(props: SimulatorProps<'chem-energetics'>) {
  // Set on every render: another lab (biology, physics) may have changed it in this tab.
  setAssistant({ name: 'Mrs Ada', role: 'lab technician', look: 'ada', pronoun: 'her' });
  const { seed, mode, state: attemptState, onChange, readOnly, startedAt, endsAt, onHandIn, onUse2d, practicalId, attemptId, result } = props;
  const started = attemptState.log.some((e) => !e.a.startsWith('safety-briefing') && !e.a.startsWith('task:'));
  const oAttempt = useEnergetics({ seed, state: attemptState, onChange, readOnly, startedAt, practicalId });
  const task: EnergeticsTask = attemptState.task ?? lessonTask(practicalId);
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
  const oLearn = useEnergetics({ seed: demoSeed(seed), state: LEARN, onChange: noop, readOnly: true, startedAt, autoTask: false, variant: undefined, practicalId });
  const precautions = useMemo(() => kit.lesson?.precautions ?? [], [kit.lesson]);
  const demo = useEnergeticsDemo({ task, studentSeed: seed, startedAt, precautions, active: stage === 'demo', onFinished: () => kit.markJourney('demo') });
  const o = stage === 'sandbox' ? sandbox.o : oAttempt;
  stopRef.current = () => o.setSpeed(1);
  const state = stage === 'sandbox' ? sandbox.state : attemptState;
  const scene = useMemo(() => sceneFromState(state), [state]);
  const shown = stage === 'learn' ? { o: oLearn, state: LEARN } : stage === 'demo' ? { o: demo.o, state: demo.state } : { o, state };
  const shownScene = useMemo(() => sceneFromState(shown.state), [shown.state]);
  const ops = makeOps(o);
  const camMode = useLabView((v) => v.mode);
  useEffect(() => () => useBench.setState(BENCH_IDLE), []);

  // the guide follows the live thermometer and the tube: re-check it while something is live
  useLive(guided && (o.cupLive() || o.phase() !== 'idle'), 500);
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

  if (import.meta.env.DEV) Object.assign(window, { __lab3dState: attemptState, __lab3dShown: shown.state, __lab3dStage: stage, __lab3dSandbox: sandbox.state, __enBench: useBench, __enOps: ops, __en: o });
  const ctx: ActionCtx = { o, s: state, scene, ops, open: (w) => (useLabView.getState().set({ selected: null }), kit.setSheet(w)) };
  const onCarry = useCallback(
    (id: string) => {
      o.note(`collect:${id}`);
      notify(`${APPARATUS_LABEL[id as ApparatusId]} is on your bench.`, 'success', 1500);
    },
    [o],
  );
  const soly = task === 'SOLY';
  const canRead = scene.set && (soly ? !!openTube(state) || state.soly.runs.length > 0 : !!o.thermoWhere());
  const onKey = (e: KeyboardEvent, type: 'down' | 'up') => {
    if (type === 'up' || useLabView.getState().mode === 'walk' || !scene.set) return false;
    const k = e.key.toLowerCase();
    if (k === 'enter') ops.read();
    else if (k === 'w') (soly ? ops.tubeStir() : ops.stir());
    else if (soly && k === 'c') ops.crystals();
    else return false;
    play('tick');
    return true;
  };
  const debriefView = (c: CriterionScore) => (c.id === 'setup' || c.id === 'procedure' ? { mode: 'bench' as const, focus: soly ? 'tube' : 'cup' } : c.id === 'readings' ? { mode: 'bench' as const, focus: soly ? 'tube' : 'thermo', notebook: true } : { mode: 'bench' as const, focus: 'bench', notebook: true });
  const what = task === 'NEUT' ? 'the heat of neutralisation' : task === 'SOLN' ? 'the heat of solution' : 'the solubility curve of KNO₃';
  const r = openRun(state);

  return (
    <LabShell
      kit={kit}
      title="Chemistry lab"
      heading={`Chemistry laboratory — ${what}`}
      intro={{
        short: task === 'NEUT' ? 'Mix 50.0 cm³ of acid and alkali in a lagged cup, record the highest temperature and work out ΔH per mole of water.' : task === 'SOLN' ? 'Dissolve 4.00 g of NH₄NO₃ in 50.0 cm³ of water, record the lowest temperature and work out ΔH; compare NaOH.' : 'Find the temperature at which KNO₃ crystals appear for several volumes of water, and draw its solubility curve.',
        steps:
          task === 'SOLY'
            ? ['Put on your goggles (hooks by the door). Hot tubes: use the holder.', 'Collect the boiling tube, rack, thermometer, water bath, burette, balance and spatula.', 'Weigh 4.0 g of KNO₃, add 5.0 cm³ of water, warm in the bath until it dissolves.', 'Cool, stirring; read the thermometer at the first crystals. Add 1.0 cm³ and repeat; plot the curve.']
            : ['Put on your goggles (hooks by the door): acid and alkali are corrosive.', task === 'NEUT' ? 'Collect the polystyrene cup, a beaker, two measuring cylinders, a thermometer and a stopwatch.' : 'Collect the polystyrene cup, a beaker, a measuring cylinder, a thermometer, a balance, a spatula and a stopwatch.', task === 'NEUT' ? 'Measure 50.0 cm³ of each solution and read both temperatures.' : 'Measure 50.0 cm³ of water, read its temperature, weigh 4.00 g of NH₄NO₃.', task === 'NEUT' ? 'Pour quickly, cover, stir; record the highest temperature; work out ΔH.' : 'Tip it in, cover, stir; record the lowest temperature; then compare 2.00 g of NaOH.'],
      }}
      readingStatus="reading the thermometer"
      scene={<LabScene o={shown.o} state={shown.state} scene={shownScene} guided={guided || stage === 'learn'} interactive={!readOnly && work} onSlow={kit.onSlow} />}
      endsAt={endsAt}
      onHandIn={onHandIn}
      onUse2d={onUse2d}
      attemptId={attemptId}
      steps={steps}
      hint={practice && !guided ? (!scene.ready ? `Collect your apparatus from the cupboard (${scene.missing.length} to go).` : !scene.set ? (soly ? 'Set up the apparatus (the dock’s button).' : 'Choose the cup (the dock’s button).') : energeticsHint(state, o)) : null}
      objectPanel={(id) => objectPanel(id, ctx)}
      explain={explainer}
      task={
        <div className="space-y-2 text-[13.5px] leading-relaxed">
          <EnTaskText task={state.task ?? task} v={o.v} />
          <p className="text-[12.5px] font-semibold">Safety</p>
          <p className="text-[13px] text-muted-foreground">Goggles: {scene.goggles ? 'on' : 'not on'} · Lab coat: {scene.coat ? 'on' : 'not on'}</p>
        </div>
      }
      notebook={<Notebook v={o.v} state={state} readOnly={readOnly} update={o.update} remove={soly ? o.removeTube : o.removeRun} className="border-0 p-0 shadow-none sm:p-0" />}
      cupboard={{
        blurb: `Take what you need for ${what} to your bench — or drag things from the cupboard onto the tray.`,
        items: CUPBOARD_ITEMS,
        has: (id) => scene.collected.has(id as ApparatusId),
        onToggle: (id, take) => o.note(`${take ? 'collect' : 'return'}:${id}`),
        onCarry,
      }}
      dock={scene.ready ? <EnDock o={o} s={state} scene={scene} ops={ops} compact={kit.touch} /> : null}
      modeBar={<ModeBar views={VIEW_BUTTONS(task)} read={{ label: 'Read the thermometer', can: canRead }} onRead={() => canRead && (useLabView.getState().set({ mode: 'read', selected: null, spot: null }), kit.setSheet(null))} />}
      readingPanel={<EnReadingPanel o={o} s={state} ops={ops} onBack={() => useLabView.getState().set({ mode: 'bench', focus: soly ? 'tube' : r?.r.mixed ? 'thermo' : 'cup', spot: null })} />}
      canRead={canRead}
      dragFeedback={(drag) => <EnDragFeedback drag={drag} />}
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
      ask={{ suggestions: ASK_SUGGESTIONS, extra: stage === 'try' ? undefined : task === 'SOLY' ? 'Why must I stir while it cools?' : 'Why is a polystyrene cup used?' }}
      tourSteps={TOURS[task]}
      safety={enSafety(task)}
      briefed={attemptState.log.some((e) => e.a.startsWith('safety-briefing'))}
      onBriefing={(outcome) => oAttempt.note(`safety-briefing:${outcome}`)}
      missing={chemEnergeticsMissing(attemptState, seed)}
      helpRows={HELP_ROWS}
      onResetStation={() => useBench.setState(BENCH_IDLE)}
      onKey={onKey}
      debriefView={debriefView}
    />
  );
}
