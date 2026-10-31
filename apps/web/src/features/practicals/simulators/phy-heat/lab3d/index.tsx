import { heatReading, type CriterionScore, type HeatTask, type HeatThermo, type PhyHeatState } from '@aischool/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Kbd } from '@/components/ui/kbd';
import { ModeBar } from '../../../lab3d-kit/hud';
import { KitScene } from '../../../lab3d-kit/scene';
import { LabShell, useLabKit, useNewLogEntries } from '../../../lab3d-kit/shell';
import { play } from '../../../lab3d-kit/sound';
import { notify, useLabView } from '../../../lab3d-kit/store';
import { BAYO_SPOT, physicsTour, usePhysicsAssistant } from '../../phy-common/lab3d/common';
import type { SimulatorProps } from '../../types';
import { heatFlags, heatHint, lessonTask, useHeat, useLive, type Heat } from '../actions';
import { HeatTaskText, Notebook, thermosFor } from '../index';
import { phyHeatMissing } from '../missing';
import { HeatDock, HeatReadingPanel } from './bench-hud';
import { BENCH_IDLE, useBench } from './bench-store';
import { ASK_SUGGESTIONS, explainer, learnConfig, learnState } from './content';
import { demoSeed } from './demo';
import { useHeatDemo } from './demo-hook';
import { DragController, HeatDragFeedback } from './drag';
import { correctionFor, guideSteps } from './guide';
import { makeOps, objectPanel, type ActionCtx } from './lab-actions';
import { heatSafety } from './safety';
import { SandboxResults, SandboxSetupForm, useSandbox } from './sandbox';
import { APPARATUS, APPARATUS_LABEL, sceneFromState, type ApparatusId, type SceneState } from './scene-state';
import { HeatCupboard, Station } from './station';
import { HEAT_VIEWS, heatRoom, readPoint, TUBE, VIEW_BUTTONS } from './views';

/**
 * The 3D physics laboratory for heat: the specific heat capacity of a metal by
 * the method of mixtures, the latent heat of fusion of ice, or the cooling
 * curve of naphthalene, on the shared lab kit — the same state, actions and
 * marks as the 2D lab. The student collects the apparatus, sets out the
 * Bunsen, tripod, bath and thermometers, weighs on a triple-beam balance by
 * sliding its riders, heats, transfers, stirs and reads each thermometer at
 * eye level (with a time-lapse for the waits), then fills in the table,
 * the graph and the calculations.
 */

const noop = () => undefined;
const TOURS: Record<HeatTask, ReturnType<typeof physicsTour>> = {
  MIX: physicsTour({ focusId: 'cal', focusLabel: 'Calorimeter', readLabel: 'Read the thermometer', readText: '“Read” puts your eye beside the end of the mercury. Raise or lower your eye until it is level with it, then read the scale (each mark is 1 °C).', taskText: 'The task card is the question paper: what to weigh, what to read and the heat equation. Open it now.' }),
  LATENT: physicsTour({ focusId: 'cal', focusLabel: 'Calorimeter', readLabel: 'Read the thermometer', readText: '“Read” puts your eye beside the end of the mercury. Raise or lower your eye until it is level with it, then read the scale.', taskText: 'The task card is the question paper. Open it now.' }),
  COOL: physicsTour({ focusId: 'tube', focusLabel: 'Boiling tube', readLabel: 'Read the thermometer', readText: '“Read” puts your eye level with the end of the mercury in the naphthalene. Read it every 30 s on the stopwatch.', taskText: 'The task card is the question paper. Open it now.' }),
};
const HELP_ROWS: [string, React.ReactNode][] = [
  ['Read a thermometer', <><Kbd>R</Kbd> or the dock’s eye buttons; <Kbd>↑</Kbd> <Kbd>↓</Kbd> move your eye</>],
  ['Take the reading', <><Kbd>Enter</Kbd> in the reading view</>],
  ['Stir', <><Kbd>S</Kbd> stirs (or stops)</>],
  ['Balance', 'Drag a rider along its beam, or the dock’s Balance tab'],
  ['Time-lapse', <>The dock’s ×1 … ×20 (real time while the block is in the air)</>],
];
const CUPBOARD_ITEMS = APPARATUS.map((a) => ({ id: a.id, label: a.label }));
const TASK_LINES: Record<HeatTask, string[]> = {
  MIX: ['Weigh m_c, m_c + water, m.', 'Block in boiling water: θ₁.', 'Water θ₂; transfer quickly.', 'Stir: highest θ₃. Find c.'],
  LATENT: ['Weigh m_c, + warm water.', 'Room θ_r; water θ₁.', 'Dried ice, one at a time.', 'Lowest θ₂; weigh m₂. Find L.'],
  COOL: ['Melt in a water bath to 90 °C.', 'Clamp in air; start watch.', 'Read θ every 30 s to 65 °C.', 'Plot θ–t: melting point.'],
};

function LabScene({ o, state, scene, guided, interactive, onSlow }: { o: Heat; state: PhyHeatState; scene: SceneState; guided: boolean; interactive: boolean; onSlow: () => void }) {
  const task: HeatTask = state.task ?? 'MIX';
  const room = useMemo(() => heatRoom(task), [task]);
  const mode = useLabView((v) => v.mode);
  useLive(mode === 'read', 600);
  const chosen = useBench((b) => b.thermo);
  const th: HeatThermo = chosen && thermosFor(task).includes(chosen) ? chosen : thermosFor(task)[0]!;
  const f = heatFlags(state.events);
  const read = readPoint(th, heatReading(o.v, o.phys(), th), f.tube === 'bath' ? TUBE.bath : TUBE.air);
  return (
    <KitScene room={room} coatOn={scene.coat} gogglesOn={scene.goggles} presets={HEAT_VIEWS} read={read} guided={guided} onSlow={onSlow} assistantSpot={BAYO_SPOT}>
      <HeatCupboard scene={scene} />
      <Station o={o} state={state} scene={scene} interactive={interactive} card={TASK_LINES[task]} />
      {interactive && <DragController o={o} />}
    </KitScene>
  );
}

export default function PhyHeatLab3D(props: SimulatorProps<'phy-heat'>) {
  usePhysicsAssistant();
  const { seed, mode, state: attemptState, onChange, readOnly, startedAt, endsAt, onHandIn, onUse2d, practicalId, attemptId, result } = props;
  const started = attemptState.log.some((e) => !e.a.startsWith('safety-briefing') && !e.a.startsWith('task:'));
  const oAttempt = useHeat({ seed, state: attemptState, onChange, readOnly, startedAt, practicalId });
  const task: HeatTask = attemptState.task ?? lessonTask(practicalId);
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
  // Learn shows Mr Bayo's own bench (the demo's seed), never the student's.
  const learnSeed = demoSeed(seed);
  const LEARN = useMemo(() => learnState(task), [task]);
  const LEARN_CONFIG = useMemo(() => learnConfig(task), [task]);
  const oLearn = useHeat({ seed: learnSeed, state: LEARN, onChange: noop, readOnly: true, startedAt, autoTask: false });
  const precautions = useMemo(() => kit.lesson?.precautions ?? [], [kit.lesson]);
  const demo = useHeatDemo({ task, studentSeed: seed, startedAt, precautions, active: stage === 'demo', onFinished: () => kit.markJourney('demo') });
  const o = stage === 'sandbox' ? sandbox.o : oAttempt;
  stopRef.current = () => o.setSpeed(1);
  const state = stage === 'sandbox' ? sandbox.state : attemptState;
  const scene = useMemo(() => sceneFromState(state), [state]);
  const shown = stage === 'learn' ? { o: oLearn, state: LEARN } : stage === 'demo' ? { o: demo.o, state: demo.state } : { o, state };
  const shownScene = useMemo(() => sceneFromState(shown.state), [shown.state]);
  const ops = makeOps(o);
  const camMode = useLabView((v) => v.mode);
  // Re-render (for the guide and the hint) only when the bench passes a milestone, not on a timer: the scene is costly to redraw.
  const [, setPhase] = useState('');
  const oRef = useRef(o);
  oRef.current = o;
  useEffect(() => {
    if (!work || readOnly) return;
    const id = setInterval(() => {
      const h = oRef.current;
      const p = h.phys();
      setPhase([p.bath >= h.v.boil - 0.3, p.meltedAt !== null, p.fs > 0.05, p.fs >= 0.999, p.tn >= 88, p.th.tube + h.v.off.tube < 65.5, p.block].join('|'));
    }, 1000);
    return () => clearInterval(id);
  }, [work, readOnly]);
  useEffect(() => () => useBench.setState(BENCH_IDLE), []);

  // ---- guidance
  const phys = o.phys();
  const steps = useMemo(() => (guided ? guideSteps(state, scene, camMode, phys, o.v, o.pan) : []), [guided, state, scene, camMode, phys.meltedAt, phys.fs > 0.05, phys.fs >= 0.999, phys.bath >= o.v.boil - 0.3, phys.tn >= 88, o.pan]); // eslint-disable-line react-hooks/exhaustive-deps
  useNewLogEntries(state.log, stage, (fresh) => {
    if (!guided || !fresh.length) return;
    let found = null;
    for (const e of fresh) found = correctionFor(e.a, state, o.phys(), o.v, scene) ?? found;
    if (found) kit.correct(found);
  });

  if (import.meta.env.DEV) Object.assign(window, { __lab3dState: attemptState, __lab3dShown: shown.state, __lab3dStage: stage, __lab3dSandbox: sandbox.state, __heatBench: useBench, __heatOps: ops, __heat: o });
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
    const k = e.key.toLowerCase();
    const th = useBench.getState().thermo ?? thermosFor(task)[0]!;
    if (k === 's') ops.stir();
    else if (k === 'enter' && useLabView.getState().mode === 'read') ops.take(th);
    else return false;
    play('tick');
    return true;
  };
  const debriefView = (c: CriterionScore) =>
    c.id === 'care' || c.id === 'procedure' ? { mode: 'bench' as const, focus: task === 'COOL' ? 'tube' : 'cal' } : c.id === 'readings' ? { mode: 'bench' as const, focus: task === 'COOL' ? 'tube' : 'balance', notebook: true } : { mode: 'bench' as const, focus: 'bench', notebook: true };
  const what = task === 'COOL' ? 'the cooling curve of naphthalene' : task === 'LATENT' ? 'the latent heat of fusion of ice' : 'specific heat capacity by mixtures';
  const p = o.phys();

  return (
    <LabShell
      kit={kit}
      title="Physics lab"
      heading={`Physics laboratory — ${what}`}
      intro={{
        short: task === 'COOL' ? 'Melt naphthalene in a water bath, then read its temperature every 30 s as it cools and freezes; plot the cooling curve.' : task === 'LATENT' ? 'Add dried ice to warm water in a lagged calorimeter and find the latent heat of fusion of ice.' : 'Heat a metal block in boiling water, transfer it into a lagged calorimeter of water and find its specific heat capacity.',
        steps:
          task === 'COOL'
            ? ['Collect the tube of naphthalene, the Bunsen, tripod, beaker (the water bath), a clamp stand and a stopwatch.', 'Set out the water bath and clamp the tube; goggles on.', 'Heat in the bath until melted and about 90 °C, then clamp it in air and start the watch.', 'Read the thermometer every 30 s until solid and below 65 °C; plot θ against t and read the plateau.']
            : task === 'LATENT'
              ? ['Collect the calorimeter and lagging, thermometers, the balance, warm water, melting ice and blotting paper.', 'Weigh the calorimeter empty and with warm water; read the room and the water.', 'Add dried ice one piece at a time, stirring, until it will finish as far below room temperature as it started above.', 'Read the lowest temperature, weigh again and find L.']
              : ['Collect the calorimeter and lagging, two thermometers, the balance, the Bunsen, tripod, beaker and the metal block.', 'Weigh the calorimeter empty and two-thirds full, and the block.', 'Heat the block in boiling water for several minutes; read θ₁ and θ₂.', 'Transfer it quickly and gently, cover, stir and read the highest θ₃; find c.'],
      }}
      readingStatus="reading the thermometer"
      scene={<LabScene o={shown.o} state={shown.state} scene={shownScene} guided={guided || stage === 'learn'} interactive={!readOnly && work} onSlow={kit.onSlow} />}
      endsAt={endsAt}
      onHandIn={onHandIn}
      onUse2d={onUse2d}
      attemptId={attemptId}
      steps={steps}
      hint={practice && !guided ? (!scene.ready ? `Collect your apparatus from the cupboard (${scene.missing.length} to go).` : !scene.set ? 'Set out the apparatus (the dock’s button).' : heatHint(state, heatFlags(state.events), p, o.v, o.pan)) : null}
      objectPanel={(id) => objectPanel(id, ctx)}
      explain={explainer}
      task={
        <div className="space-y-2 text-[13.5px] leading-relaxed">
          <HeatTaskText task={state.task} />
        </div>
      }
      notebook={<Notebook task={state.task ?? task} state={state} readOnly={readOnly} o={o} />}
      cupboard={{
        blurb: `Take what you need for ${what} to your bench — or drag things from the cupboard onto the tray.`,
        items: CUPBOARD_ITEMS,
        has: (id) => scene.collected.has(id as ApparatusId),
        onToggle: (id, take) => o.note(`${take ? 'collect' : 'return'}:${id}`),
        onCarry,
      }}
      dock={scene.ready ? <HeatDock o={o} s={state} scene={scene} ops={ops} compact={kit.touch} /> : null}
      modeBar={<ModeBar views={VIEW_BUTTONS(task)} read={{ label: 'Read the thermometer', can: canRead }} onRead={() => canRead && (useLabView.getState().set({ mode: 'read', selected: null, spot: null }), kit.setSheet(null))} />}
      readingPanel={<HeatReadingPanel o={o} ops={ops} onBack={() => useLabView.getState().set({ mode: 'bench', focus: task === 'COOL' ? 'tube' : 'cal', spot: null })} />}
      canRead={canRead}
      dragFeedback={(drag) => <HeatDragFeedback drag={drag} />}
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
      ask={{ suggestions: ASK_SUGGESTIONS, extra: stage === 'try' ? undefined : task === 'COOL' ? 'Why is there a flat part on the cooling curve?' : task === 'LATENT' ? 'Why must the ice be dried?' : 'Why must the block be transferred quickly?' }}
      tourSteps={TOURS[task]}
      safety={heatSafety(task)}
      briefed={attemptState.log.some((e) => e.a.startsWith('safety-briefing'))}
      onBriefing={(outcome) => oAttempt.note(`safety-briefing:${outcome}`)}
      missing={phyHeatMissing(attemptState, seed)}
      helpRows={HELP_ROWS}
      onResetStation={() => {
        o.setSpeed(1);
        useBench.setState(BENCH_IDLE);
      }}
      onKey={onKey}
      debriefView={debriefView}
    />
  );
}
