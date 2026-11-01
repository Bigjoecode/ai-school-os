import type { CriterionScore, DensityTask, PhyDensityState } from '@aischool/shared';
import { useCallback, useEffect, useMemo } from 'react';
import { Kbd } from '@/components/ui/kbd';
import { ModeBar } from '../../../lab3d-kit/hud';
import { KitScene } from '../../../lab3d-kit/scene';
import { LabShell, useLabKit, useNewLogEntries } from '../../../lab3d-kit/shell';
import { play } from '../../../lab3d-kit/sound';
import { notify, useLabView } from '../../../lab3d-kit/store';
import { BAYO_SPOT, physicsTour, usePhysicsAssistant } from '../../phy-common/lab3d/common';
import type { SimulatorProps } from '../../types';
import { densityHint, lessonTask, TASK_NAME, useDensity, type Density } from '../actions';
import { DensityTaskText, Notebook } from '../index';
import { phyDensityMissing } from '../missing';
import { DensityDock, DensityDragFeedback, DensityReadingPanel } from './bench-hud';
import { BENCH_IDLE, useBench } from './bench-store';
import { ASK_SUGGESTIONS, explainer, learnConfig, learnState } from './content';
import { demoSeed } from './demo';
import { useDensityDemo } from './demo-hook';
import { DragController } from './drag';
import { correctionFor, guideSteps } from './guide';
import { makeOps, objectPanel, type ActionCtx } from './lab-actions';
import { DENSITY_SAFETY } from './safety';
import { SandboxResults, SandboxSetupForm, useSandbox } from './sandbox';
import { APPARATUS, APPARATUS_LABEL, sceneFromState, type ApparatusId, type SceneState } from './scene-state';
import { DensityCupboard, Station } from './station';
import { canRead, DENSITY_VIEWS, densityRoom, readPoint, VIEW_BUTTONS } from './views';
import { floatReading } from '@aischool/shared';

/**
 * The 3D physics laboratory for measurement, density and flotation — the
 * vernier calipers and micrometer, Archimedes' principle, the law of
 * flotation and the density bottle — on the shared lab kit, with the same
 * state, actions and marks as the 2D lab. Every scale is read in a close-up
 * at eye level (the eye square on, or parallax), every weighing balanced on
 * the triple-beam balance.
 */

const noop = () => undefined;
const TOUR_FOCUS: Record<DensityTask, [string, string, string]> = {
  CAL: ['vernier', 'Vernier calipers', '“Read” puts the instrument right in front of your eye, drawn large. Keep your eye square on to the scale (no parallax), then read it.'],
  ARCH: ['sbalance', 'Spring balance', '“Read” puts your eye level with the spring balance’s pointer. Raise or lower your eye until it is level, then read to 0.05 N.'],
  FLOAT: ['cylinder', 'Cylinder of water', '“Read” puts your eye level with the water surface at the tube. Read h at the flat surface, not the meniscus.'],
  BOTTLE: ['bottle', 'Density bottle', '“Read” shows the thermometer at eye level. The balance is read from its riders.'],
};
const tourFor = (task: DensityTask) => {
  const [focusId, focusLabel, readText] = TOUR_FOCUS[task];
  return physicsTour({ focusId, focusLabel, readLabel: 'Read', readText, taskText: 'The task card is the question paper: what to measure and what to work out. Open it now.' });
};
const HELP_ROWS: [string, React.ReactNode][] = [
  ['Take a reading', <><Kbd>Enter</Kbd></>],
  ['Eye up / down (reading view)', <><Kbd>↑</Kbd> <Kbd>↓</Kbd></>],
  ['Balance riders', 'Drag them along the beams, or use the dock’s buttons'],
  ['Lower the stone', 'Drag it down (up raises it), or use the dock'],
];
const CUPBOARD_ITEMS = APPARATUS.map((a) => ({ id: a.id, label: a.label }));
const TASK_LINES: Record<DensityTask, string[]> = {
  CAL: ['Zero errors first (with sign).', 'Cylinder: vernier, 3 places.', 'Ball: micrometer, ratchet, 3 ways.', 'V = (4/3)πr³.'],
  ARCH: ['Zero the balance; W₁ in air.', 'Can to spout; beaker weighed.', 'W₂ in water, W₃ in salt soln.', 'RD = W₁/(W₁ − W₂).'],
  FLOAT: ['D (outside) with the vernier.', 'Weigh the empty tube.', 'Loads 10–50 g: read h.', 'h against m: ρ = 1/(A × slope).'],
  BOTTLE: ['Thermometer; m₁ dry and empty.', 'm₂ water, to the capillary.', 'Dry; m₃ liquid; wipe each time.', 'RD = (m₃ − m₁)/(m₂ − m₁).'],
};

function LabScene({ o, state, scene, guided, interactive, onSlow, onStone }: { o: Density; state: PhyDensityState; scene: SceneState; guided: boolean; interactive: boolean; onSlow: () => void; onStone: (dir: 1 | -1) => void }) {
  const task: DensityTask = state.task ?? 'CAL';
  const room = useMemo(() => densityRoom(task), [task]);
  const presets = useMemo(() => DENSITY_VIEWS(task), [task]);
  const h = state.floating ? floatReading(o.v, state.load, state.touching) : 0;
  return (
    <KitScene room={room} coatOn={scene.coat} gogglesOn={false} presets={presets} read={readPoint(task, state, h)} guided={guided} onSlow={onSlow} assistantSpot={BAYO_SPOT}>
      <DensityCupboard scene={scene} />
      <Station o={o} state={state} scene={scene} interactive={interactive} card={TASK_LINES[task]} />
      {interactive && <DragController o={o} onStone={onStone} />}
    </KitScene>
  );
}

export default function PhyDensityLab3D(props: SimulatorProps<'phy-density'>) {
  usePhysicsAssistant();
  const { seed, mode, state: attemptState, onChange, readOnly, startedAt, endsAt, onHandIn, onUse2d, practicalId, attemptId, result } = props;
  const started = attemptState.log.some((e) => !e.a.startsWith('safety-briefing') && !e.a.startsWith('task:'));
  const task: DensityTask = attemptState.task ?? lessonTask(practicalId);
  const kit = useLabKit({ mode, readOnly, practicalId, result, started, onStageChange: () => useBench.setState(BENCH_IDLE) });
  const { stage, work, guided, practice } = kit;
  const oAttempt = useDensity({ seed, state: attemptState, onChange, readOnly, startedAt, practicalId });
  const sandbox = useSandbox(startedAt, task);
  const LEARN = useMemo(() => learnState(task), [task]);
  const LEARN_CONFIG = useMemo(() => learnConfig(task), [task]);
  const oLearn = useDensity({ seed: demoSeed(seed), state: LEARN, onChange: noop, readOnly: true, startedAt, autoTask: false });
  const demo = useDensityDemo({ task, studentSeed: seed, startedAt, active: stage === 'demo', onFinished: () => kit.markJourney('demo') });
  const o = stage === 'sandbox' ? sandbox.o : oAttempt;
  const state = stage === 'sandbox' ? sandbox.state : attemptState;
  const scene = useMemo(() => sceneFromState(state), [state]);
  const shown = stage === 'learn' ? { o: oLearn, state: LEARN } : stage === 'demo' ? { o: demo.o, state: demo.state } : { o, state };
  const shownScene = useMemo(() => sceneFromState(shown.state), [shown.state]);
  const ops = makeOps(o);
  const camMode = useLabView((v) => v.mode);
  useEffect(() => () => useBench.setState(BENCH_IDLE), []);

  // ---- guidance
  const steps = useMemo(() => (guided ? guideSteps(state, scene, camMode, o.pan) : []), [guided, state, scene, camMode, o.pan]);
  useNewLogEntries(state.log, stage, (fresh) => {
    if (!guided || stage === 'sandbox' || !fresh.length) return;
    let found = null;
    for (const e of fresh) found = correctionFor(e.a, state, o.v) ?? found;
    if (found) kit.correct(found);
  });

  if (import.meta.env.DEV) Object.assign(window, { __lab3dState: attemptState, __lab3dShown: shown.state, __lab3dStage: stage, __lab3dSandbox: sandbox.state, __densityOps: ops, __density: o });
  const ctx: ActionCtx = { o, s: state, scene, ops, open: (w) => (useLabView.getState().set({ selected: null }), kit.setSheet(w)) };
  const onCarry = useCallback(
    (id: string) => {
      o.note(`collect:${id}`);
      notify(`${APPARATUS_LABEL[id as ApparatusId]} is on your bench.`, 'success', 1500);
    },
    [o],
  );
  const onStone = (dir: 1 | -1) => {
    const s = o.ref.current;
    if (dir > 0) ops.lower(s.where === 'salt' ? 'salt' : 'water', 'full');
    else ops.raise();
  };
  const readable = scene.set && canRead(task, state);
  const onKey = (e: KeyboardEvent, type: 'down' | 'up') => {
    if (type === 'up' || useLabView.getState().mode === 'walk' || !scene.set) return false;
    if (e.key !== 'Enter') return false;
    const s = o.ref.current;
    if (task === 'ARCH') ops.takeSb();
    else if (task === 'FLOAT' && s.floating) ops.takeDepth();
    else if (task === 'BOTTLE') ops.weigh();
    else ops.takeCal();
    play('tick');
    return true;
  };
  const debriefView = (c: CriterionScore) => {
    const focus = task === 'CAL' ? 'instrument' : task === 'ARCH' ? 'stand' : task === 'FLOAT' ? 'cylinder' : 'bottle';
    return c.id === 'care' || c.id === 'procedure' ? { mode: 'bench' as const, focus } : c.id === 'readings' ? { mode: 'bench' as const, focus, notebook: true } : { mode: 'bench' as const, focus: 'bench', notebook: true };
  };
  const what = TASK_NAME[task].toLowerCase();
  const INTRO: Record<DensityTask, { short: string; steps: string[] }> = {
    CAL: { short: 'Find each instrument’s zero error, measure a wooden cylinder with the vernier and a ball bearing with the micrometer, and work out the ball’s volume.', steps: ['Collect the vernier, the micrometer and the objects.', 'Close each instrument on nothing: read its zero error with its sign.', 'Measure the cylinder at three places and the ball in three orientations (ratchet!).', 'Mean − zero error; V = (4/3)πr³.'] },
    ARCH: { short: 'Weigh a stone in air, in water and in salt solution, check Archimedes’ principle with the displaced water, and find two relative densities.', steps: ['Collect the spring balance and stand, the stone, the eureka can, the beakers, tissue and the balance.', 'Zero the spring balance; read W₁ in air; weigh the empty catch beaker.', 'Fill the can to the spout; lower the stone fully in (free, no bubbles): W₂; weigh the displaced water.', 'Dry the stone; W₃ in salt solution. RD = W₁/(W₁ − W₂).'] },
    FLOAT: { short: 'Float a test tube loaded with lead shot, read its depth for five loads, and find the density of water from h against m.', steps: ['Collect the vernier, the balance, the cylinder of water, the tube and the lead shot.', 'Measure the external diameter (zero error!) and weigh the empty tube.', 'Load 10 g at a time; float it free of the sides; read h at eye level.', 'Plot h against m: ρ = 1/(A × slope); tube mass = ρA × intercept.'] },
    BOTTLE: { short: 'Weigh the density bottle empty, full of water and full of the liquid, and find the liquid’s relative density and density.', steps: ['Collect the bottle, the beakers, the dropper, tissue, the thermometer and the balance.', 'Read the temperature; weigh the dry, empty bottle (m₁).', 'Fill with water to the capillary, wipe, weigh (m₂); empty, dry, fill with the liquid, wipe, weigh (m₃).', 'RD = (m₃ − m₁)/(m₂ − m₁); density = RD × ρ(water).'] },
  };

  return (
    <LabShell
      kit={kit}
      title="Physics lab"
      heading={`Physics laboratory — ${what}`}
      intro={INTRO[task]}
      readingStatus="reading the scale"
      scene={<LabScene o={shown.o} state={shown.state} scene={shownScene} guided={guided || stage === 'learn'} interactive={!readOnly && work} onSlow={kit.onSlow} onStone={onStone} />}
      endsAt={endsAt}
      onHandIn={onHandIn}
      onUse2d={onUse2d}
      attemptId={attemptId}
      steps={steps}
      hint={practice && !guided ? (!scene.ready ? `Collect your apparatus from the cupboard (${scene.missing.length} to go).` : !scene.set ? 'Set up the apparatus (the dock’s button).' : densityHint(state, o.pan)) : null}
      objectPanel={(id) => objectPanel(id, ctx)}
      explain={explainer}
      task={
        <div className="space-y-2 text-[13.5px] leading-relaxed">
          <DensityTaskText task={state.task} v={o.v} sample={state.sample} />
          {state.task === 'BOTTLE' && !state.weighs.length && !readOnly && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {(['liquid', 'grains'] as const).map((x) => (
                <button key={x} type="button" className={`rounded-md border px-2 py-1 text-[12px] ${state.sample === x ? 'border-brand bg-brand text-white' : 'border-border'}`} onClick={() => o.setSample(x)} aria-pressed={state.sample === x}>
                  {x === 'liquid' ? `A liquid (${o.v.liquid})` : 'Solid grains (sand)'}
                </button>
              ))}
            </div>
          )}
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
      dock={scene.ready ? <DensityDock o={o} s={state} scene={scene} ops={ops} compact={kit.touch} /> : null}
      modeBar={<ModeBar views={VIEW_BUTTONS(task)} read={{ label: 'Read', can: readable }} onRead={() => readable && (useLabView.getState().set({ mode: 'read', selected: null, spot: null }), kit.setSheet(null))} />}
      readingPanel={<DensityReadingPanel o={o} s={state} ops={ops} onBack={() => useLabView.getState().set({ mode: 'bench', spot: null })} />}
      canRead={readable}
      dragFeedback={(drag) => <DensityDragFeedback drag={drag} o={o} />}
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
      ask={{ suggestions: ASK_SUGGESTIONS, extra: stage === 'try' ? undefined : task === 'CAL' ? 'How do I read a negative zero error?' : task === 'ARCH' ? 'Why is the loss in weight equal to the upthrust?' : task === 'FLOAT' ? 'Why does the tube float higher in salt water?' : 'Why must the bottle be dry?' }}
      tourSteps={tourFor(task)}
      safety={DENSITY_SAFETY}
      briefed={attemptState.log.some((e) => e.a.startsWith('safety-briefing'))}
      onBriefing={(outcome) => oAttempt.note(`safety-briefing:${outcome}`)}
      missing={phyDensityMissing(attemptState, seed)}
      helpRows={HELP_ROWS}
      onResetStation={() => useBench.setState(BENCH_IDLE)}
      onKey={onKey}
      debriefView={debriefView}
    />
  );
}
