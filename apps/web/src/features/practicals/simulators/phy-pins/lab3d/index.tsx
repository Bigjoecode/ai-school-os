import type { CriterionScore, PhyPinsState, PhyPinsVariant, PinsTask } from '@aischool/shared';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Kbd } from '@/components/ui/kbd';
import { Button } from '@/components/ui/button';
import { ModeBar } from '../../../lab3d-kit/hud';
import { KitScene } from '../../../lab3d-kit/scene';
import { LabShell, useLabKit, useNewLogEntries } from '../../../lab3d-kit/shell';
import { play } from '../../../lab3d-kit/sound';
import { notify, useLabView } from '../../../lab3d-kit/store';
import { BAYO_SPOT, physicsTour, usePhysicsAssistant } from '../../phy-common/lab3d/common';
import type { SimulatorProps } from '../../types';
import { lessonTask, usePins, type Pins } from '../actions';
import { PinsTaskText, pinsHint, useLookLogger } from '../index';
import { phyPinsMissing } from '../missing';
import { Notebook } from '../notebook';
import { PinsDock, PinsDragFeedback } from './bench-hud';
import { BENCH_IDLE, useBench } from './bench-store';
import { ASK, explainer, learnConfig, learnState } from './content';
import { demoSeed } from './demo';
import { usePinsDemo } from './demo-hook';
import { DragController } from './drag';
import { correctionFor, guideSteps } from './guide';
import { eyePhi, makeOps, nextIFor, objectPanel, type ActionCtx, type Ops } from './lab-actions';
import { measurePoint } from './measure';
import { pinsSafety } from './safety';
import { SandboxResults, SandboxSetupForm, useSandbox } from './sandbox';
import { APPARATUS_LABEL, apparatusFor, sceneFromState, type ApparatusId, type SceneState } from './scene-state';
import { PinsCupboard, Station, shownTrace } from './station';
import { depthLookSpot, pinsPresets, pinsRoom, readPoint, sightSpot, viewButtons } from './views';

/**
 * The 3D physics laboratory for the pin-method optics practicals and the
 * spectrum, on the shared lab kit — the same state, actions and marks as the
 * 2D lab. Plane mirror and prism: collect the board and pins, draw the normal
 * and the ray, push in P₁ and P₂, put your eye down at paper level, line up the
 * images, push in P₃ and P₄, remove the mirror/prism, join and measure.
 * Real and apparent depth: stack blocks on the cross, look straight down,
 * move your eye from side to side and slide the search pin until it shows no
 * parallax. Dispersion: darken the room, narrow the slit, turn the prism to
 * minimum deviation, read the screen, try a filter.
 */

const noop = () => undefined;
const TOUR: Record<PinsTask, ReturnType<typeof physicsTour>> = {
  MIRROR: physicsTour({ focusId: 'board', focusLabel: 'Board', taskText: 'The task card is the question paper: the angles of incidence and what to plot. Open it now.' }),
  PRISM: physicsTour({ focusId: 'board', focusLabel: 'Board', taskText: 'The task card is the question paper: the angles of incidence, the curve and the formula. Open it now.' }),
  DEPTH: physicsTour({ focusId: 'blocks', focusLabel: 'Stack', readLabel: 'Read the rule', readText: '“Read the rule” puts your eye level with the search pin beside the vertical rule: read its height to 0.1 cm.', taskText: 'The task card is the question paper. Open it now.' }),
  DISP: physicsTour({ focusId: 'screen', focusLabel: 'Screen', taskText: 'The task card is the question paper. Open it now.' }),
};
const HELP_ROWS: [string, React.ReactNode][] = [
  ['Move your eye', <>While looking, <Kbd>←</Kbd> <Kbd>→</Kbd> or drag sideways</>],
  ['Look', <><Kbd>E</Kbd> to look (paper level, straight down, or at the screen)</>],
  ['Pins', 'Push them in with the dock buttons, or pick a pin and tap the paper; drag P₃ / P₄ to move them'],
  ['Depth', <><Kbd>↑</Kbd> <Kbd>↓</Kbd> move the search pin 1 mm; <Kbd>Enter</Kbd> takes the reading</>],
];
const CARD: Record<PinsTask, string[]> = {
  MIRROR: ['Line MM′; mirror on it; normal at O.', 'Ray at i = 20°: P₁, P₂ well apart.', 'Look in the mirror: P₃, P₄ in line.', 'Repeat 30°–60°. Plot r against i.'],
  PRISM: ['Trace the prism; normal at O.', 'i = 35°: P₁, P₂; look through: P₃, P₄.', 'Produce the rays: measure D.', '35°–65°. D against i: curve, Dₘ, n.'],
  DEPTH: ['One block on the cross: read the top.', 'Look down; move your eye side to side.', 'Pin with no parallax: read it.', 'Apparent = top − pin. 1–4 blocks.'],
  DISP: ['Dark room, narrow slit.', 'Turn the prism to minimum deviation.', 'Order of colours; D red and violet.', 'Red filter: what happens?'],
};
const WHAT: Record<PinsTask, string> = { MIRROR: 'laws of reflection with a plane mirror', PRISM: 'deviation through a triangular prism', DEPTH: 'real and apparent depth', DISP: 'dispersion of white light' };

function LabScene({ v, task, state, scene, ops, g, guided, interactive, onSlow }: { v: PhyPinsVariant; task: PinsTask; state: PhyPinsState; scene: SceneState; ops: Ops; g: Pins; guided: boolean; interactive: boolean; onSlow: () => void }) {
  const room = useMemo(() => pinsRoom(task), [task]);
  const viewing = useBench((b) => b.viewing);
  const { t } = shownTrace(state, viewing);
  const m = t?.joined && (task === 'MIRROR' || task === 'PRISM') ? measurePoint(v, task, t) : null;
  const mKey = m ? `${m.x.toFixed(2)},${m.y.toFixed(2)}` : '';
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const presets = useMemo(() => pinsPresets(task, { depthBlocks: state.depth.blocks, dist: state.disp.dist, measure: m }, v), [task, state.depth.blocks, state.disp.dist, mKey, v]);
  return (
    <KitScene room={room} coatOn={scene.coat} gogglesOn={false} presets={presets} read={readPoint(state.depth.h)} guided={guided} onSlow={onSlow} assistantSpot={BAYO_SPOT}>
      <PinsCupboard scene={scene} />
      <Station v={v} task={task} state={state} scene={scene} interactive={interactive} onPaper={ops.tapPaper} card={CARD[task]} />
      {interactive && <DragController g={g} ops={ops} />}
    </KitScene>
  );
}

function ReadPanel({ s, ops, onBack }: { s: PhyPinsState; ops: Ops; onBack: () => void }) {
  return (
    <div className="pointer-events-auto absolute inset-x-2 bottom-24 mx-auto flex max-w-md flex-wrap items-center justify-center gap-1.5 rounded-2xl bg-black/60 p-2 text-[12.5px] text-white backdrop-blur">
      <span>Search pin: read it on the rule (0 at the bench)</span>
      <Button size="sm" variant="outline" className="border-white/20 bg-white/10 text-white" onClick={() => ops.pin(-0.1)}>
        ↓ 1 mm
      </Button>
      <Button size="sm" variant="outline" className="border-white/20 bg-white/10 text-white" onClick={() => ops.pin(0.1)}>
        ↑ 1 mm
      </Button>
      <Button size="sm" variant="brand" onClick={ops.take} disabled={s.depth.blocks < 1}>
        Take this reading
      </Button>
      <Button size="sm" variant="ghost" className="text-white" onClick={onBack}>
        Back
      </Button>
    </div>
  );
}

export default function PhyPinsLab3D(props: SimulatorProps<'phy-pins'>) {
  usePhysicsAssistant();
  const { seed, mode, state: attemptState, onChange, readOnly, startedAt, endsAt, onHandIn, onUse2d, practicalId, attemptId, result } = props;
  const task: PinsTask = attemptState.task ?? lessonTask(practicalId);
  const started = attemptState.log.some((e) => !e.a.startsWith('safety-briefing') && !e.a.startsWith('task:'));
  const kit = useLabKit({ mode, readOnly, practicalId, result, started, onStageChange: () => useBench.setState(BENCH_IDLE) });
  const { stage, work, guided, practice } = kit;
  const gAttempt = usePins({ seed, state: attemptState, onChange, readOnly, startedAt, practicalId });
  const sandbox = useSandbox(startedAt, task);
  const LEARN = useMemo(() => learnState(task), [task]);
  const LEARN_CONFIG = useMemo(() => learnConfig(task), [task]);
  const gLearn = usePins({ seed: demoSeed(seed), state: LEARN, onChange: noop, readOnly: true, startedAt, autoTask: false });
  const precautions = useMemo(() => kit.lesson?.precautions ?? [], [kit.lesson]);
  const demo = usePinsDemo({ task, studentSeed: seed, startedAt, precautions, active: stage === 'demo', onFinished: () => kit.markJourney('demo') });
  const g = stage === 'sandbox' ? sandbox.g : gAttempt;
  const state = stage === 'sandbox' ? sandbox.state : attemptState;
  const scene = useMemo(() => sceneFromState(state, task), [state, task]);
  const shown = stage === 'learn' ? { g: gLearn, state: LEARN } : stage === 'demo' ? { g: demo.g, state: demo.state } : { g, state };
  const shownScene = useMemo(() => sceneFromState(shown.state, task), [shown.state, task]);
  const ops = makeOps(g);
  const camMode = useLabView((v) => v.mode);
  const focus = useLabView((v) => v.focus);
  const sight = useBench((b) => b.sight);
  const phi = useBench((b) => b.phi);
  const look = useBench((b) => b.look);
  const screen = useBench((b) => b.screen);
  const nextI = useBench((b) => b.nextI);
  useBench((b) => b.tool);
  useEffect(() => () => useBench.setState(BENCH_IDLE), []);
  // Dispersion: every setting looked at on the screen is a look in the record (the attempt and the sandbox, not Learn or the demo).
  useLookLogger(g, task === 'DISP' && screen && work && !readOnly, state.disp);

  // ---- eye-level sighting (board), looking straight down (depth): the camera follows the eye (the demo too).
  const sv = shown.g.v;
  const openShown = shown.state.traces.find((t) => !t.joined) ?? null;
  const openKey = JSON.stringify(openShown);
  const bt = task === 'PRISM' ? 'PRISM' : 'MIRROR';
  useEffect(() => {
    if (!sight || (task !== 'MIRROR' && task !== 'PRISM')) return;
    useLabView.setState({ mode: 'bench', focus: 'sight', spot: sightSpot(sv, bt, openShown, eyePhi(shown.g)), selected: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sight, phi, openKey, sv, task]);
  const eyeX = shown.state.depth.eyeX;
  const blocks = shown.state.depth.blocks;
  useEffect(() => {
    if (!look || task !== 'DEPTH') return;
    useLabView.setState({ mode: 'bench', focus: 'look', spot: depthLookSpot(sv, blocks, eyeX), selected: null });
  }, [look, eyeX, blocks, sv, task]);
  const lastFocus = useRef(focus);
  useEffect(() => {
    const was = lastFocus.current;
    lastFocus.current = focus;
    if (stage === 'demo') return;
    const b = useBench.getState();
    if (b.sight && ((was === 'sight' && focus !== 'sight') || camMode === 'walk')) (useBench.setState({ sight: false }), useLabView.setState({ spot: null }));
    if (b.look && ((was === 'look' && focus !== 'look') || camMode === 'walk')) (useBench.setState({ look: false }), useLabView.setState({ spot: null }));
    if (b.screen && camMode === 'walk') useBench.setState({ screen: false });
  }, [focus, camMode, stage]);

  // ---- guidance
  const steps = useMemo(() => (guided ? guideSteps(task, state, scene, { mode: camMode, sight, look, screen, nextI: nextIFor(state, bt, nextI) }) : []), [guided, task, state, scene, camMode, sight, look, screen, nextI, bt]);
  useNewLogEntries(state.log, stage, (fresh) => {
    if (!guided || stage === 'sandbox' || !fresh.length) return;
    let found = null;
    for (const e of fresh) found = correctionFor(task, e.a, state, g.v) ?? found;
    if (found) kit.correct(found);
  });

  if (import.meta.env.DEV) Object.assign(window, { __lab3dState: attemptState, __lab3dShown: shown.state, __lab3dStage: stage, __pinsBench: useBench, __pinsOps: ops, __pins: g });
  const ctx: ActionCtx = { g, s: state, scene, ops, open: (w) => (useLabView.getState().set({ selected: null }), kit.setSheet(w)) };
  const onCarry = useCallback(
    (id: string) => {
      g.note(`collect:${id}`);
      notify(`${APPARATUS_LABEL[id as ApparatusId]} is on your bench.`, 'success', 1500);
    },
    [g],
  );
  const onKey = (e: KeyboardEvent, type: 'down' | 'up') => {
    if (type === 'up' || useLabView.getState().mode === 'walk') return false;
    const b = useBench.getState();
    const k = e.key;
    if (b.sight && (k === 'ArrowLeft' || k === 'ArrowRight')) return ops.moveEye((k === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 1 : 0.1)), true;
    if (b.look && (k === 'ArrowLeft' || k === 'ArrowRight')) return ops.eye((k === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 2 : 0.5)), true;
    if (task === 'DEPTH' && (k === 'ArrowUp' || k === 'ArrowDown')) return e.preventDefault(), ops.pin((k === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 1 : 0.1)), play('tick'), true;
    if (task === 'DEPTH' && k === 'Enter') return ops.take(), true;
    if (task === 'DISP' && (k === 'ArrowLeft' || k === 'ArrowRight')) return ops.rotate((k === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 5 : 0.5)), true;
    if (k.toLowerCase() === 'e') {
      if (task === 'DEPTH') ops.look(!b.look);
      else if (task === 'DISP') ops.screen(!b.screen);
      else if (g.open) ops.sight(!b.sight);
      return true;
    }
    return false;
  };
  const debriefView = (c: CriterionScore) => {
    if (task === 'MIRROR' || task === 'PRISM') return c.id === 'procedure' || c.id === 'tracing' ? { mode: 'bench' as const, focus: 'board' } : c.id === 'readings' ? { mode: 'bench' as const, focus: 'protractor', notebook: true } : { mode: 'bench' as const, focus: 'bench', notebook: true };
    if (task === 'DEPTH') return c.id === 'procedure' || c.id === 'tracing' ? { mode: 'bench' as const, focus: 'stack' } : { mode: 'bench' as const, focus: 'bench', notebook: true };
    return c.id === 'procedure' || c.id === 'tracing' ? { mode: 'bench' as const, focus: 'screen' } : { mode: 'bench' as const, focus: 'bench', notebook: true };
  };
  const canRead = task === 'DEPTH' && scene.ready;
  const needed = apparatusFor(task).filter((a) => a.needed).map((a) => a.label.toLowerCase());

  return (
    <LabShell
      kit={kit}
      title="Physics lab"
      heading={`Physics laboratory — ${WHAT[task]}`}
      intro={{
        short: task === 'MIRROR' ? 'Trace rays with pins and a plane mirror and show that r = i.' : task === 'PRISM' ? 'Trace rays through a prism at seven angles, plot D against i and find n from the minimum deviation.' : task === 'DEPTH' ? 'Find the apparent depth of a cross under 1–4 glass blocks by no parallax, and n from real ÷ apparent.' : 'Split white light with a prism in a darkened room: the order of the colours, minimum deviation and a filter test.',
        steps: [`Collect from the cupboard: ${needed.join(', ')}.`, ...CARD[task]],
      }}
      readingStatus="reading the rule"
      scene={<LabScene v={shown.g.v} task={task} state={shown.state} scene={shownScene} ops={ops} g={g} guided={guided || stage === 'learn'} interactive={!readOnly && work} onSlow={kit.onSlow} />}
      endsAt={endsAt}
      onHandIn={onHandIn}
      onUse2d={onUse2d}
      attemptId={attemptId}
      steps={steps}
      hint={practice && !guided ? (scene.ready ? pinsHint(state, task, g, sight) : `Collect your apparatus from the cupboard (${scene.missing.length} to go).`) : null}
      objectPanel={(id) => objectPanel(id, ctx)}
      explain={explainer}
      task={
        <div className="space-y-2 text-[13.5px] leading-relaxed">
          <PinsTaskText task={task} />
        </div>
      }
      notebook={<Notebook task={task} state={state} readOnly={readOnly} update={g.update} removeTrace={g.removeTrace} removeDepth={g.removeDepth} />}
      cupboard={{
        blurb: `Take what you need for ${WHAT[task]} to your bench — or drag things from the cupboard onto the tray.`,
        items: apparatusFor(task).map((a) => ({ id: a.id, label: a.label })),
        has: (id) => scene.collected.has(id as ApparatusId),
        onToggle: (id, take) => g.note(`${take ? 'collect' : 'return'}:${id}`),
        onCarry,
      }}
      dock={scene.ready ? <PinsDock g={g} s={state} ops={ops} compact={kit.touch} /> : null}
      modeBar={<ModeBar views={viewButtons(task)} read={task === 'DEPTH' ? { label: 'Read the rule', can: canRead } : undefined} onRead={() => canRead && (useLabView.getState().set({ mode: 'read', selected: null, spot: null }), kit.setSheet(null))} />}
      readingPanel={task === 'DEPTH' ? <ReadPanel s={state} ops={ops} onBack={() => useLabView.getState().set({ mode: 'bench', focus: 'stack', spot: null })} /> : undefined}
      canRead={canRead}
      dragFeedback={(drag) => <PinsDragFeedback drag={drag} />}
      learn={LEARN_CONFIG}
      demo={demo.player}
      demoPanel={demo.panel}
      sandbox={{
        form: (
          <SandboxSetupForm
            task={task}
            initial={sandbox.setup}
            onStart={(x) => {
              sandbox.start(x);
              kit.goStage('sandbox');
            }}
          />
        ),
        results: <SandboxResults sandbox={sandbox} />,
      }}
      ask={{ suggestions: ASK[task], extra: stage === 'try' ? undefined : task === 'MIRROR' ? 'Why is the image as far behind the mirror as the object is in front?' : task === 'PRISM' ? 'Why does the deviation have a minimum?' : task === 'DEPTH' ? 'Why does the image move with the pin only when they are at the same place?' : 'Why is violet light deviated most?' }}
      tourSteps={TOUR[task]}
      safety={pinsSafety(task)}
      briefed={attemptState.log.some((e) => e.a.startsWith('safety-briefing'))}
      onBriefing={(outcome) => gAttempt.note(`safety-briefing:${outcome}`)}
      missing={phyPinsMissing(attemptState, seed)}
      helpRows={HELP_ROWS}
      onResetStation={() => useBench.setState(BENCH_IDLE)}
      onKey={onKey}
      debriefView={debriefView}
    />
  );
}
