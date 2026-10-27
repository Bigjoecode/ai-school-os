import type { CriterionScore, PhyGlassState, PhyGlassVariant } from '@aischool/shared';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Kbd } from '@/components/ui/kbd';
import { ModeBar } from '../../../lab3d-kit/hud';
import { KitScene } from '../../../lab3d-kit/scene';
import { BAYO_SPOT } from '../../phy-common/lab3d/common';
import { LabShell, useLabKit, useNewLogEntries } from '../../../lab3d-kit/shell';
import { notify, useLabView } from '../../../lab3d-kit/store';
import { physicsTour, usePhysicsAssistant } from '../../phy-common/lab3d/common';
import { OPTICS_SAFETY } from '../../phy-common/lab3d/safety';
import type { SimulatorProps } from '../../types';
import { useGlass, type Glass } from '../actions';
import { hint, Notebook } from '../index';
import { phyGlassMissing } from '../missing';
import { GlassDock, GlassDragFeedback } from './bench-hud';
import { BENCH_IDLE, useBench } from './bench-store';
import { ASK_SUGGESTIONS, explainer, LEARN_CONFIG, LEARN_STATE } from './content';
import { useGlassDemo } from './demo-hook';
import { DragController } from './drag';
import { correctionFor, guideSteps } from './guide';
import { makeOps, objectPanel, type Ops } from './lab-actions';
import { SandboxResults, SandboxSetupForm, useSandbox } from './sandbox';
import { APPARATUS, APPARATUS_LABEL, nextIFor, sceneFromState, type ApparatusId, type SceneState } from './scene-state';
import { GlassCupboard, Station } from './station';
import { GLASS_ROOM, GLASS_VIEW_BUTTONS, GLASS_VIEWS, sightSpot, toLocal } from './views';

/**
 * The 3D physics laboratory: refraction through a rectangular glass block, on
 * the shared lab kit — the same state, actions and marks as the 2D lab. The
 * student collects the board, paper, block, pins and drawing tools, traces the
 * block, draws the normal and the ray, pushes P₁ and P₂ in, puts an eye down
 * at the level of the paper to line up the images through face CD, pushes P₃
 * and P₄ in, removes the block, joins the points and measures r with the
 * protractor, then works out n in the notebook.
 */

const noop = () => undefined;
const TOUR = physicsTour({ focusId: 'board', focusLabel: 'Board', taskText: 'The task card is the question paper: the angles of incidence to use and what to plot. Open it now.' });
const HELP_ROWS: [string, React.ReactNode][] = [
  ['Look through face CD', <>Choose “Look through face CD”, then <Kbd>←</Kbd> <Kbd>→</Kbd> or drag sideways to move your eye</>],
  ['Pins', 'Push them in with the dock buttons, or pick a pin and tap the paper; drag P₃ / P₄ to move them'],
];
const CUPBOARD_ITEMS = APPARATUS.map((a) => ({ id: a.id, label: a.label }));
const TASK_LINES = ['Trace ABCD; normal at O; ray at i = 20°; pins P₁, P₂.', 'Look through CD: P₃, P₄ in line with the images.', 'Remove the block, join, measure r. Repeat for 30°–60°.', 'Plot sin i against sin r; slope = n.'];

function LabScene({ v, state, scene, g, ops, guided, interactive, onSlow }: { v: PhyGlassVariant; state: PhyGlassState; scene: SceneState; g: Glass; ops: Ops; guided: boolean; interactive: boolean; onSlow: () => void }) {
  const O = toLocal({ x: 0, y: 0 });
  return (
    <KitScene room={GLASS_ROOM} coatOn={scene.coat} gogglesOn={false} presets={GLASS_VIEWS} read={[O[0], O[1], O[2]]} guided={guided} onSlow={onSlow} assistantSpot={BAYO_SPOT}>
      <GlassCupboard scene={scene} />
      <Station v={v} state={state} scene={scene} interactive={interactive} onPaper={ops.tapPaper} task={TASK_LINES} />
      {interactive && <DragController g={g} ops={ops} />}
    </KitScene>
  );
}

export default function PhyGlassLab3D(props: SimulatorProps<'phy-glass-block'>) {
  usePhysicsAssistant();
  const { seed, mode, state: attemptState, onChange, readOnly, startedAt, endsAt, onHandIn, onUse2d, practicalId, attemptId, result } = props;
  const started = attemptState.log.some((e) => !e.a.startsWith('safety-briefing'));
  const gAttempt = useGlass({ seed, state: attemptState, onChange, readOnly, startedAt });
  const sandbox = useSandbox(startedAt);
  const kit = useLabKit({ mode, readOnly, practicalId, result, started, onStageChange: () => useBench.setState(BENCH_IDLE) });
  const { stage, work, guided, practice } = kit;
  const learnG = useGlass({ seed, state: LEARN_STATE, onChange: noop, readOnly: true, startedAt });
  const precautions = useMemo(() => kit.lesson?.precautions ?? [], [kit.lesson]);
  const demo = useGlassDemo({ studentSeed: seed, startedAt, precautions, active: stage === 'demo', onFinished: () => kit.markJourney('demo') });
  const g = stage === 'sandbox' ? sandbox.g : gAttempt;
  const state = stage === 'sandbox' ? sandbox.state : attemptState;
  const scene = useMemo(() => sceneFromState(state), [state]);
  const shown = stage === 'learn' ? { g: learnG, state: LEARN_STATE } : stage === 'demo' ? { g: demo.g, state: demo.state } : { g, state };
  const shownScene = useMemo(() => sceneFromState(shown.state), [shown.state]);
  const ops = makeOps(g);
  const camMode = useLabView((v) => v.mode);
  const focus = useLabView((v) => v.focus);
  const sight = useBench((b) => b.sight);
  const eyeX = useBench((b) => b.eyeX);
  const nextI = useBench((b) => b.nextI);
  useBench((b) => b.tool);
  useEffect(() => () => useBench.setState(BENCH_IDLE), []);

  // ---- sighting through face CD: the camera at the eye, looking at the image of P₂ (any stage: the demo sights too)
  const v = shown.g.v;
  const openShown = shown.state.traces.find((t) => !t.joined) ?? null;
  const openKey = JSON.stringify(openShown);
  useEffect(() => {
    if (!sight) return;
    useLabView.setState({ mode: 'bench', focus: 'sight', spot: sightSpot(v, openShown, eyeX), selected: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sight, eyeX, openKey, v]);
  // Choosing another view (or walking away) ends the sighting.
  const lastFocus = useRef(focus);
  useEffect(() => {
    const was = lastFocus.current;
    lastFocus.current = focus;
    // (not in the demo: its steps change the view themselves, and its beats end the sighting when it is done)
    if (stage !== 'demo' && useBench.getState().sight && ((was === 'sight' && focus !== 'sight') || camMode === 'walk')) {
      useBench.setState({ sight: false });
      useLabView.setState({ spot: null });
    }
  }, [focus, camMode, stage]);

  // ---- guidance
  const steps = useMemo(() => (guided ? guideSteps(state, scene, camMode, sight, nextIFor(state, nextI)) : []), [guided, state, scene, camMode, sight, nextI]);
  useNewLogEntries(state.log, stage, (fresh) => {
    if (!guided || !fresh.length) return;
    let found = null;
    for (const e of fresh) found = correctionFor(e.a, state, g.v) ?? found;
    if (found) kit.correct(found);
  });

  if (import.meta.env.DEV) Object.assign(window, { __lab3dState: attemptState, __lab3dShown: shown.state, __lab3dStage: stage, __glassBench: useBench });
  const ctx = { g, s: state, scene, ops, open: (w: 'notebook' | 'task' | 'cupboard') => (useLabView.getState().set({ selected: null }), kit.setSheet(w)) };
  const onCarry = useCallback(
    (id: string) => {
      g.note(`collect:${id}`);
      notify(`${APPARATUS_LABEL[id as ApparatusId]} is on your bench.`, 'success', 1500);
    },
    [g],
  );
  const onKey = (e: KeyboardEvent, type: 'down' | 'up') => {
    if (type === 'up' || useLabView.getState().mode !== 'bench') return false;
    if (useBench.getState().sight && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      ops.moveEye((e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 1 : 0.1));
      return true;
    }
    if (e.key.toLowerCase() === 'e' && g.open) {
      ops.sight(!useBench.getState().sight);
      return true;
    }
    return false;
  };
  const debriefView = (c: CriterionScore) =>
    c.id === 'procedure' || c.id === 'tracing' ? { mode: 'bench' as const, focus: 'board' } : c.id === 'readings' ? { mode: 'bench' as const, focus: 'protractor' } : { mode: 'bench' as const, focus: 'bench', notebook: true };

  return (
    <LabShell
      kit={kit}
      title="Physics lab"
      heading="Physics laboratory — refraction through a glass block"
      intro={{
        short: 'Collect the board, block and pins, then trace rays through the block at your bench.',
        steps: ['Collect the drawing board, paper, glass block, pins and drawing tools from the cupboard on the right.', 'At your bench, trace the block, draw the normal and the ray at i, and push in P₁ and P₂.', 'Put your eye down at the level of the paper, line up the images through face CD and push in P₃ and P₄.', 'Remove the block, join the points, measure r — five angles — then work out n.'],
      }}
      scene={<LabScene v={shown.g.v} state={shown.state} scene={shownScene} g={g} ops={ops} guided={guided || stage === 'learn'} interactive={!readOnly && work} onSlow={kit.onSlow} />}
      endsAt={endsAt}
      onHandIn={onHandIn}
      onUse2d={onUse2d}
      attemptId={attemptId}
      steps={steps}
      hint={practice && !guided ? (scene.ready ? hint(g.open, g.done) : `Collect your apparatus from the cupboard (${scene.missing.length} to go).`) : null}
      objectPanel={(id) => objectPanel(id, ctx)}
      explain={explainer}
      task={
        <div className="space-y-2 text-[13.5px] leading-relaxed">
          <p>You are provided with a rectangular glass block, a drawing board with paper, four optical pins and a protractor.</p>
          <ol className="list-[lower-roman] space-y-0.5 pl-6">
            <li>Trace the outline ABCD of the block. Draw the normal at O on AB and a line making an angle i = 20° with the normal. Fix pins P₁ and P₂ on this line.</li>
            <li>With the block in place, look through face CD and fix P₃ and P₄ in line with the images of P₁ and P₂.</li>
            <li>Remove the block. Join P₃P₄ to meet CD at E, join OE and measure the angle of refraction r.</li>
            <li>Repeat for i = 30°, 40°, 50°, 60° and 70°. Tabulate i, r, sin i and sin r.</li>
            <li>Plot sin i against sin r, find the slope and hence the refractive index n of the glass. State two precautions.</li>
          </ol>
        </div>
      }
      notebook={<Notebook state={state} readOnly={readOnly} update={g.update} removeTrace={(k) => g.removeTrace(k)} />}
      cupboard={{
        blurb: 'Take what you need for tracing rays through a glass block to your bench — or drag things from the cupboard onto the tray.',
        items: CUPBOARD_ITEMS,
        has: (id) => scene.collected.has(id as ApparatusId),
        onToggle: (id, take) => g.note(`${take ? 'collect' : 'return'}:${id}`),
        onCarry,
      }}
      dock={scene.ready && scene.collected.has('board') ? <GlassDock g={g} s={state} ops={ops} compact={kit.touch} /> : null}
      modeBar={<ModeBar views={GLASS_VIEW_BUTTONS} />}
      dragFeedback={(drag) => <GlassDragFeedback drag={drag} />}
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
      ask={{ suggestions: ASK_SUGGESTIONS, extra: stage === 'try' ? undefined : 'Why does the emergent ray come out parallel to the incident ray?' }}
      tourSteps={TOUR}
      safety={OPTICS_SAFETY}
      briefed={attemptState.log.some((e) => e.a.startsWith('safety-briefing'))}
      onBriefing={(outcome) => gAttempt.note(`safety-briefing:${outcome}`)}
      missing={phyGlassMissing(attemptState, seed)}
      helpRows={HELP_ROWS}
      onResetStation={() => useBench.setState(BENCH_IDLE)}
      onKey={onKey}
      debriefView={debriefView}
    />
  );
}
