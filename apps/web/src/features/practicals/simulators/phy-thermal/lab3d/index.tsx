import type { CriterionScore, PhyThermalState, ThermTask } from '@aischool/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Kbd } from '@/components/ui/kbd';
import { ModeBar } from '../../../lab3d-kit/hud';
import { KitScene } from '../../../lab3d-kit/scene';
import { LabShell, useLabKit, useNewLogEntries } from '../../../lab3d-kit/shell';
import { play } from '../../../lab3d-kit/sound';
import { notify, useLabView } from '../../../lab3d-kit/store';
import { BAYO_SPOT, physicsTour, usePhysicsAssistant } from '../../phy-common/lab3d/common';
import type { SimulatorProps } from '../../types';
import { lessonTask, thermFlags, thermHint, useLive, useThermal, type Thermal } from '../actions';
import { instrumentsFor, Notebook, ThermTaskText } from '../index';
import { phyThermalMissing } from '../missing';
import { ThermalDock, ThermalReadingPanel } from './bench-hud';
import { BENCH_IDLE, useBench } from './bench-store';
import { ASK_SUGGESTIONS, explainer, learnConfig, learnState } from './content';
import { demoSeed } from './demo';
import { useThermalDemo } from './demo-hook';
import { DragController, ThermalDragFeedback } from './drag';
import { correctionFor, guideSteps } from './guide';
import { makeOps, objectPanel, type ActionCtx } from './lab-actions';
import { thermalSafety } from './safety';
import { SandboxResults, SandboxSetupForm, useSandbox } from './sandbox';
import { APPARATUS, APPARATUS_LABEL, sceneFromState, type ApparatusId, type SceneState } from './scene-state';
import { Station, ThermalCupboard } from './station';
import { HANG, readPoint, THERMAL_VIEWS, thermalRoom, VIEW_BUTTONS } from './views';

/**
 * The 3D physics laboratory for thermal physics: the linear expansivity of a
 * rod in a steam jacket, Charles's law with a capillary tube, or the specific
 * heat capacity of water by electrical heating, on the shared lab kit — the
 * same state, actions and marks as the 2D lab. The student collects the
 * apparatus, sets it out, heats (with a time-lapse for the waits), screws the
 * micrometer up by its ratchet, stirs, wires the meters, reads every
 * instrument at eye level and fills in the table, the graph and the
 * calculations.
 */

const noop = () => undefined;
const TOURS: Record<ThermTask, ReturnType<typeof physicsTour>> = {
  EXPANSION: physicsTour({ focusId: 'micro', focusLabel: 'Micrometer', readLabel: 'Read an instrument', readText: '“Read” puts your eye beside the instrument. Raise or lower your eye until it is square on to the scale, then read it.', taskText: 'The task card is the question paper: what to measure, and how to work out α. Open it now.' }),
  CHARLES: physicsTour({ focusId: 'capillary', focusLabel: 'Capillary tube', readLabel: 'Read an instrument', readText: '“Read” puts your eye beside the air column (or the thermometer). Move your eye level with the bottom of the acid index, then read the ruler.', taskText: 'The task card is the question paper. Open it now.' }),
  ELECTRIC: physicsTour({ focusId: 'cal', focusLabel: 'Calorimeter', readLabel: 'Read an instrument', readText: '“Read” puts your eye beside a meter or the thermometer. Look square on to the scale, then read it.', taskText: 'The task card is the question paper. Open it now.' }),
};
const HELP_ROWS: [string, React.ReactNode][] = [
  ['Read an instrument', <><Kbd>R</Kbd> or the dock’s eye buttons; <Kbd>↑</Kbd> <Kbd>↓</Kbd> move your eye</>],
  ['Take the reading', <><Kbd>Enter</Kbd> in the reading view</>],
  ['Stir', <><Kbd>S</Kbd> stirs (or stops)</>],
  ['Micrometer', 'Drag its thimble left to ratchet it up to the rod, right to back it off — or the dock’s buttons'],
  ['Time-lapse', <>The dock’s ×1 … ×20</>],
];
const CUPBOARD_ITEMS = APPARATUS.map((a) => ({ id: a.id, label: a.label }));
const TASK_LINES: Record<ThermTask, string[]> = {
  EXPANSION: ['Measure l₀ (metre rule).', 'θ₁; ratchet: r₁. Back off.', 'Steam until steady: θ₂.', 'Ratchet: r₂ (repeat). Find α.'],
  CHARLES: ['Air column fully under water.', 'Stir; read θ and l.', 'Heat ~15 °C; flame off, stir, wait.', 'Plot l–θ; extend to l = 0.'],
  ELECTRIC: ['Weigh: cal, cal + water.', 'Lag; heater in; lid; wire.', 'θ₀; switch on + watch; stir.', 'θ every 60 s; off at 300 s.'],
};

function LabScene({ o, state, scene, guided, interactive, onSlow }: { o: Thermal; state: PhyThermalState; scene: SceneState; guided: boolean; interactive: boolean; onSlow: () => void }) {
  const task: ThermTask = state.task ?? 'EXPANSION';
  const room = useMemo(() => thermalRoom(task), [task]);
  const mode = useLabView((v) => v.mode);
  useLive(mode === 'read', 600);
  const chosen = useBench((b) => b.instr);
  const kinds = instrumentsFor(task);
  const k = chosen && kinds.includes(chosen) ? chosen : kinds[0]!;
  const f = thermFlags(state.events);
  const hang = f.immersed === 'full' ? HANG.full : f.immersed === 'part' ? HANG.part : HANG.out;
  const read = readPoint(task, k, o.shows(k), hang, scene.placed.has('rod'));
  return (
    <KitScene room={room} coatOn={scene.coat} gogglesOn={scene.goggles} presets={THERMAL_VIEWS} read={read} guided={guided} onSlow={onSlow} assistantSpot={BAYO_SPOT}>
      <ThermalCupboard scene={scene} />
      <Station o={o} state={state} scene={scene} interactive={interactive} card={TASK_LINES[task]} />
      {interactive && <DragController o={o} />}
    </KitScene>
  );
}

export default function PhyThermalLab3D(props: SimulatorProps<'phy-thermal'>) {
  usePhysicsAssistant();
  const { seed, mode, state: attemptState, onChange, readOnly, startedAt, endsAt, onHandIn, onUse2d, practicalId, attemptId, result } = props;
  const started = attemptState.log.some((e) => !e.a.startsWith('safety-briefing') && !e.a.startsWith('task:'));
  const oAttempt = useThermal({ seed, state: attemptState, onChange, readOnly, startedAt, practicalId });
  const task: ThermTask = attemptState.task ?? lessonTask(practicalId);
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
  const learnSeed = demoSeed(seed);
  const LEARN = useMemo(() => learnState(task), [task]);
  const LEARN_CONFIG = useMemo(() => learnConfig(task), [task]);
  const oLearn = useThermal({ seed: learnSeed, state: LEARN, onChange: noop, readOnly: true, startedAt, autoTask: false });
  const precautions = useMemo(() => kit.lesson?.precautions ?? [], [kit.lesson]);
  const demo = useThermalDemo({ task, studentSeed: seed, startedAt, precautions, active: stage === 'demo', onFinished: () => kit.markJourney('demo') });
  const o = stage === 'sandbox' ? sandbox.o : oAttempt;
  stopRef.current = () => o.setSpeed(1);
  const state = stage === 'sandbox' ? sandbox.state : attemptState;
  const scene = useMemo(() => sceneFromState(state), [state]);
  const shown = stage === 'learn' ? { o: oLearn, state: LEARN } : stage === 'demo' ? { o: demo.o, state: demo.state } : { o, state };
  const shownScene = useMemo(() => sceneFromState(shown.state), [shown.state]);
  const ops = makeOps(o);
  const camMode = useLabView((v) => v.mode);
  // Re-render (for the guide and the hint) only when the bench passes a milestone, not on a timer.
  const [, setPhase] = useState('');
  const oRef = useRef(o);
  oRef.current = o;
  useEffect(() => {
    if (!work || readOnly) return;
    const id = setInterval(() => {
      const h = oRef.current;
      const p = h.phys();
      setPhase([p.can >= h.v.boil - 0.05, p.thJ >= h.v.boil - 0.3, Math.round(p.rod / 5), Math.round(p.tw / 5), p.on, Math.floor(h.watchTime() / 60), p.contact].join('|'));
    }, 1000);
    return () => clearInterval(id);
  }, [work, readOnly]);
  useEffect(() => () => useBench.setState(BENCH_IDLE), []);

  // ---- guidance
  const phys = o.phys();
  const steps = useMemo(() => (guided ? guideSteps(state, scene, camMode, phys, o.v) : []), [guided, state, scene, camMode, phys.thJ >= o.v.boil - 0.3, Math.round(phys.rod), phys.can >= o.v.boil - 0.05, Math.floor(o.watchTime() / 60)]); // eslint-disable-line react-hooks/exhaustive-deps
  useNewLogEntries(state.log, stage, (fresh) => {
    if (!guided || !fresh.length) return;
    let found = null;
    for (const e of fresh) found = correctionFor(e.a, state, o.phys(), o.v, scene) ?? found;
    if (found) kit.correct(found);
  });

  if (import.meta.env.DEV) Object.assign(window, { __lab3dState: attemptState, __lab3dShown: shown.state, __lab3dStage: stage, __lab3dSandbox: sandbox.state, __thermBench: useBench, __thermOps: ops, __therm: o });
  const ctx: ActionCtx = { o, s: state, scene, ops, open: (w) => (useLabView.getState().set({ selected: null }), kit.setSheet(w)) };
  const onCarry = useCallback(
    (id: string) => {
      o.note(`collect:${id}`);
      notify(`${APPARATUS_LABEL[id as ApparatusId]} is on your bench.`, 'success', 1500);
    },
    [o],
  );
  const canRead = scene.set || (task === 'EXPANSION' && scene.ready);
  const onKey = (e: KeyboardEvent, type: 'down' | 'up') => {
    if (type === 'up' || useLabView.getState().mode === 'walk' || !scene.set) return false;
    const k = e.key.toLowerCase();
    const instr = useBench.getState().instr ?? instrumentsFor(task)[0]!;
    if (k === 's') task === 'ELECTRIC' ? ops.stir() : ops.stirOnce();
    else if (k === 'enter' && useLabView.getState().mode === 'read') ops.take(instr);
    else return false;
    play('tick');
    return true;
  };
  const focus = task === 'EXPANSION' ? 'micro' : task === 'CHARLES' ? 'bath' : 'cal';
  const debriefView = (c: CriterionScore) => (c.id === 'care' || c.id === 'procedure' ? { mode: 'bench' as const, focus } : { mode: 'bench' as const, focus: 'bench', notebook: true });
  const what = task === 'CHARLES' ? 'Charles’s law' : task === 'ELECTRIC' ? 'electrical heating' : 'linear expansivity';
  const p = o.phys();

  return (
    <LabShell
      kit={kit}
      title="Physics lab"
      heading={`Physics laboratory — ${what}`}
      intro={{
        short: task === 'CHARLES' ? 'Heat air trapped in a capillary tube in steps, read its length at each temperature, and extend the graph back to absolute zero.' : task === 'ELECTRIC' ? 'Heat water with a 12 V immersion heater for 300 s, measure V, I and the temperature rise, and find c.' : 'Heat a metal rod with steam, measure its tiny expansion with a micrometer and find its linear expansivity.',
        steps:
          task === 'CHARLES'
            ? ['Collect the beaker, Bunsen, tripod, capillary tube on its ruler, clamp stand and stirrer.', 'Set it up with the whole air column under the water; goggles on.', 'Stir and read θ and l; heat about 15 °C, remove the flame, stir, wait and read again.', 'At least five pairs; plot l against θ and extend it to l = 0.']
            : task === 'ELECTRIC'
              ? ['Collect the calorimeter and lagging, the heater, supply, meters, wires, thermometer, balance, stopwatch and water.', 'Weigh the calorimeter empty and with water.', 'Lag it, immerse the heater, lid on, wire up; read θ₀; switch on with the stopwatch.', 'Stir; read V, I and θ every 60 s; off at 300 s; record the highest θ; find c.']
              : ['Collect the jacket, rod, steam can, Bunsen, tripod, tubing, thermometer, metre rule and beaker.', 'Measure l₀; set up; read θ₁ and the micrometer (ratchet) r₁.', 'Back off; pass steam until the thermometer is steady; read θ₂.', 'Ratchet up again: r₂, repeated until steady. Find α.'],
      }}
      readingStatus="reading an instrument"
      scene={<LabScene o={shown.o} state={shown.state} scene={shownScene} guided={guided || stage === 'learn'} interactive={!readOnly && work} onSlow={kit.onSlow} />}
      endsAt={endsAt}
      onHandIn={onHandIn}
      onUse2d={onUse2d}
      attemptId={attemptId}
      steps={steps}
      hint={practice && !guided ? (!scene.ready ? `Collect your apparatus from the cupboard (${scene.missing.length} to go).` : !scene.set ? 'Set out the apparatus (the dock’s button).' : thermHint(state, thermFlags(state.events), p, o.v)) : null}
      objectPanel={(id) => objectPanel(id, ctx)}
      explain={explainer}
      task={
        <div className="space-y-2 text-[13.5px] leading-relaxed">
          <ThermTaskText task={state.task} />
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
      dock={scene.ready ? <ThermalDock o={o} s={state} scene={scene} ops={ops} compact={kit.touch} /> : null}
      modeBar={<ModeBar views={VIEW_BUTTONS(task)} read={{ label: 'Read an instrument', can: canRead }} onRead={() => canRead && (useLabView.getState().set({ mode: 'read', selected: null, spot: null }), kit.setSheet(null))} />}
      readingPanel={<ThermalReadingPanel o={o} ops={ops} onBack={() => useLabView.getState().set({ mode: 'bench', focus, spot: null })} />}
      canRead={canRead}
      dragFeedback={(drag) => <ThermalDragFeedback drag={drag} />}
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
      ask={{ suggestions: ASK_SUGGESTIONS, extra: stage === 'try' ? undefined : task === 'CHARLES' ? 'Why is the line extended to l = 0?' : task === 'ELECTRIC' ? 'Why is my c larger than 4200?' : 'Why does the rod expand so little?' }}
      tourSteps={TOURS[task]}
      safety={thermalSafety(task)}
      briefed={attemptState.log.some((e) => e.a.startsWith('safety-briefing'))}
      onBriefing={(outcome) => oAttempt.note(`safety-briefing:${outcome}`)}
      missing={phyThermalMissing(attemptState, seed)}
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
