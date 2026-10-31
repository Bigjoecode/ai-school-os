import type { CriterionScore, PhySoundState, SoundTask } from '@aischool/shared';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Kbd } from '@/components/ui/kbd';
import { ModeBar } from '../../../lab3d-kit/hud';
import { KitScene } from '../../../lab3d-kit/scene';
import { LabShell, useLabKit, useNewLogEntries } from '../../../lab3d-kit/shell';
import { play } from '../../../lab3d-kit/sound';
import { notify, useLabView } from '../../../lab3d-kit/store';
import { BAYO_SPOT, physicsTour, usePhysicsAssistant } from '../../phy-common/lab3d/common';
import type { SimulatorProps } from '../../types';
import { lessonTask, soundHint, useSound, type Sound } from '../actions';
import { Notebook, SoundTaskText } from '../index';
import { phySoundMissing } from '../missing';
import { forkStop } from '../synth';
import { SoundDock, SoundDragFeedback, SoundReadingPanel } from './bench-hud';
import { BENCH_IDLE, useBench } from './bench-store';
import { ASK_SUGGESTIONS, explainer, learnConfig, learnState } from './content';
import { demoSeed } from './demo';
import { useSoundDemo } from './demo-hook';
import { DragController } from './drag';
import { correctionFor, guideSteps } from './guide';
import { makeOps, objectPanel, type ActionCtx } from './lab-actions';
import { SOUND_SAFETY } from './safety';
import { SandboxResults, SandboxSetupForm, useSandbox } from './sandbox';
import { APPARATUS, APPARATUS_LABEL, sceneFromState, type ApparatusId, type SceneState } from './scene-state';
import { SoundCupboard, Station } from './station';
import { readPoint, SOUND_VIEWS, soundRoom, VIEW_BUTTONS } from './views';

/**
 * The 3D physics laboratory for resonance: the resonance tube (the speed of
 * sound and the end correction) or the sonometer (frequency and length of a
 * stretched wire), on the shared lab kit — the same state, actions and marks
 * as the 2D lab. The student collects the apparatus, sets it up, takes each
 * fork from the set, strikes it on the rubber pad and finds the resonance —
 * by ear (the fork's tone, synthesised live, swells at resonance) and by eye
 * (the loudness meter, the rings of sound, the rider thrown off) — and takes
 * the length; then plots the graph and deduces v and e, or v and μ.
 */

const noop = () => undefined;
const TOURS: Record<SoundTask, ReturnType<typeof physicsTour>> = {
  TUBE: physicsTour({
    focusId: 'tube',
    focusLabel: 'Resonance tube',
    readLabel: 'Read l',
    readText: '“Read l” puts your eye level with the water surface in the tube, beside its metre rule (0 at the top). Raise or lower your eye until it is level, then read to 0.1 cm.',
    taskText: 'The task card is the question paper: the forks to use and what to plot. Open it now.',
  }),
  SONO: physicsTour({
    focusId: 'sonometer',
    focusLabel: 'Sonometer',
    readLabel: 'Bridge & scale',
    readText: 'The “Bridge & scale” view looks down on the moving bridge and the scale along the box: read its edge to 0.1 cm.',
    taskText: 'The task card is the question paper: the forks, the load and what to plot. Open it now.',
  }),
};
const HELP_ROWS: [string, React.ReactNode][] = [
  ['Strike the fork', <><Kbd>S</Kbd> on the rubber pad (never the bench)</>],
  ['Length', <><Kbd>↑</Kbd> <Kbd>↓</Kbd> 0.1 cm, with <Kbd>Shift</Kbd> 1 cm — or drag the tube / the bridge</>],
  ['Take the length', <><Kbd>Enter</Kbd></>],
  ['No sound?', 'Watch the loudness meter, the rings of sound and the rider'],
];
const CUPBOARD_ITEMS = APPARATUS.map((a) => ({ id: a.id, label: a.label }));
const TASK_LINES: Record<SoundTask, string[]> = {
  TUBE: ['Forks 512, 384, 320, 288, 256 Hz.', 'Strike on the pad; raise the tube slowly.', 'Loudest: read l₁ (and l₂ for 512).', 'Plot l against 1/f: slope v/4, −e.'],
  SONO: ['Load 4.0 kg; keep it fixed.', 'Rider on the middle of the wire.', 'Forks 256, 320, 384, 512 Hz.', 'Plot f against 1/l: slope v/2.'],
};

function LabScene({ o, state, scene, guided, interactive, onSlow }: { o: Sound; state: PhySoundState; scene: SceneState; guided: boolean; interactive: boolean; onSlow: () => void }) {
  const task: SoundTask = state.task ?? 'TUBE';
  const room = useMemo(() => soundRoom(task), [task]);
  const presets = useMemo(() => SOUND_VIEWS(task, state.len), [task, state.len]);
  return (
    <KitScene room={room} coatOn={scene.coat} gogglesOn={false} presets={presets} read={readPoint()} guided={guided} onSlow={onSlow} assistantSpot={BAYO_SPOT}>
      <SoundCupboard scene={scene} />
      <Station o={o} state={state} scene={scene} interactive={interactive} card={TASK_LINES[task]} />
      {interactive && <DragController o={o} />}
    </KitScene>
  );
}

export default function PhySoundLab3D(props: SimulatorProps<'phy-sound'>) {
  usePhysicsAssistant();
  const { seed, mode, state: attemptState, onChange, readOnly, startedAt, endsAt, onHandIn, onUse2d, practicalId, attemptId, result } = props;
  const started = attemptState.log.some((e) => !e.a.startsWith('safety-briefing') && !e.a.startsWith('task:'));
  const task: SoundTask = attemptState.task ?? lessonTask(practicalId);
  const stopRef = useRef<() => void>(noop);
  const kit = useLabKit({
    mode,
    readOnly,
    practicalId,
    result,
    started,
    onStageChange: () => {
      stopRef.current();
      forkStop();
      useBench.setState(BENCH_IDLE);
    },
  });
  const { stage, work, guided, practice } = kit;
  const oAttempt = useSound({ seed, state: attemptState, onChange, readOnly, startedAt, practicalId, audible: stage !== 'demo' && stage !== 'sandbox' && stage !== 'learn' });
  const sandbox = useSandbox(startedAt, task, stage === 'sandbox');
  const learnSeed = demoSeed(seed);
  const LEARN = useMemo(() => learnState(task), [task]);
  const LEARN_CONFIG = useMemo(() => learnConfig(task), [task]);
  const oLearn = useSound({ seed: learnSeed, state: LEARN, onChange: noop, readOnly: true, startedAt, autoTask: false, audible: false });
  const precautions = useMemo(() => kit.lesson?.precautions ?? [], [kit.lesson]);
  const demo = useSoundDemo({ task, studentSeed: seed, startedAt, precautions, active: stage === 'demo', onFinished: () => kit.markJourney('demo') });
  const o = stage === 'sandbox' ? sandbox.o : oAttempt;
  stopRef.current = () => o.damp();
  const state = stage === 'sandbox' ? sandbox.state : attemptState;
  const scene = useMemo(() => sceneFromState(state), [state]);
  const shown = stage === 'learn' ? { o: oLearn, state: LEARN } : stage === 'demo' ? { o: demo.o, state: demo.state } : { o, state };
  const shownScene = useMemo(() => sceneFromState(shown.state), [shown.state]);
  const ops = makeOps(o);
  const camMode = useLabView((v) => v.mode);
  useEffect(() => () => (useBench.setState(BENCH_IDLE), forkStop()), []);

  // ---- guidance
  const steps = useMemo(() => (guided ? guideSteps(state, scene, camMode, o.struck) : []), [guided, state, scene, camMode, o.struck]);
  useNewLogEntries(state.log, stage, (fresh) => {
    if (!guided || stage === 'sandbox' || !fresh.length) return;
    let found = null;
    for (const e of fresh) found = correctionFor(e.a, state, o.v) ?? found;
    if (found) kit.correct(found);
  });

  if (import.meta.env.DEV) Object.assign(window, { __lab3dState: attemptState, __lab3dShown: shown.state, __lab3dStage: stage, __lab3dSandbox: sandbox.state, __soundOps: ops, __sound: o });
  const ctx: ActionCtx = { o, s: state, scene, ops, open: (w) => (useLabView.getState().set({ selected: null }), kit.setSheet(w)) };
  const onCarry = useCallback(
    (id: string) => {
      o.note(`collect:${id}`);
      notify(`${APPARATUS_LABEL[id as ApparatusId]} is on your bench.`, 'success', 1500);
    },
    [o],
  );
  const sono = task === 'SONO';
  const canRead = scene.set && !sono;
  const onKey = (e: KeyboardEvent, type: 'down' | 'up') => {
    if (type === 'up' || useLabView.getState().mode === 'walk' || !scene.set) return false;
    const k = e.key.toLowerCase();
    if (k === 's') ops.strike('pad');
    else if (k === 'arrowup' || k === 'arrowright') (e.preventDefault(), ops.nudge(e.shiftKey ? 1 : 0.1));
    else if (k === 'arrowdown' || k === 'arrowleft') (e.preventDefault(), ops.nudge(e.shiftKey ? -1 : -0.1));
    else if (k === 'enter') ops.take();
    else if (k === 'h') ops.damp();
    else return false;
    if (k !== 's') play('tick');
    return true;
  };
  const debriefView = (c: CriterionScore) =>
    c.id === 'care' || c.id === 'procedure' ? { mode: 'bench' as const, focus: sono ? 'wire' : 'tube' } : c.id === 'readings' ? { mode: 'bench' as const, focus: sono ? 'bridge' : 'tube', notebook: true } : { mode: 'bench' as const, focus: 'bench', notebook: true };
  const what = sono ? 'the sonometer' : 'the speed of sound with a resonance tube';

  return (
    <LabShell
      kit={kit}
      title="Physics lab"
      heading={`Physics laboratory — ${what}`}
      intro={{
        short: sono ? 'Find the resonant length of a sonometer wire for four forks at a fixed tension, and find v and μ from f against 1/l.' : 'Find the first resonance of an air column for five tuning forks, and the speed of sound and end correction from l against 1/f.',
        steps: sono
          ? ['Collect the sonometer, the hanger and masses, the forks, the rubber pad and paper riders.', 'Set the sonometer along the bench and hang 4.0 kg on the wire.', 'For each fork: rider on the middle, strike the fork on the pad, press it on the box and move the bridge until the rider is thrown off; take the length.', 'Plot f against 1/l: v = 2 × slope, T = Mg, μ = T/v².']
          : ['Collect the tube and its jar of water, the clamp and stand, a metre rule, the forks and the rubber pad.', 'Stand the jar on the floor, clamp the tube vertically in it and fix the rule along it.', 'For each fork: strike it on the pad, hold it over the mouth and raise the tube slowly from a short column until the sound is loudest; take l.', 'Plot l against 1/f: v = 4 × slope, e = −intercept.'],
      }}
      readingStatus="reading the length"
      scene={<LabScene o={shown.o} state={shown.state} scene={shownScene} guided={guided || stage === 'learn'} interactive={!readOnly && work} onSlow={kit.onSlow} />}
      endsAt={endsAt}
      onHandIn={onHandIn}
      onUse2d={onUse2d}
      attemptId={attemptId}
      steps={steps}
      hint={practice && !guided ? (!scene.ready ? `Collect your apparatus from the cupboard (${scene.missing.length} to go).` : !scene.set ? 'Set up the apparatus (the dock’s button).' : soundHint(state, o.struck, o.now())) : null}
      objectPanel={(id) => objectPanel(id, ctx)}
      explain={explainer}
      task={
        <div className="space-y-2 text-[13.5px] leading-relaxed">
          <SoundTaskText task={state.task} />
        </div>
      }
      notebook={<Notebook task={state.task ?? task} state={state} readOnly={readOnly} update={o.update} removeRow={o.removeRow} />}
      cupboard={{
        blurb: `Take what you need for ${what} to your bench — or drag things from the cupboard onto the tray.`,
        items: CUPBOARD_ITEMS,
        has: (id) => scene.collected.has(id as ApparatusId),
        onToggle: (id, take) => o.note(`${take ? 'collect' : 'return'}:${id}`),
        onCarry,
      }}
      dock={scene.ready ? <SoundDock o={o} s={state} scene={scene} ops={ops} compact={kit.touch} /> : null}
      modeBar={<ModeBar views={VIEW_BUTTONS(task)} read={{ label: 'Read l', can: canRead }} onRead={() => canRead && (useLabView.getState().set({ mode: 'read', selected: null, spot: null }), kit.setSheet(null))} />}
      readingPanel={<SoundReadingPanel o={o} s={state} ops={ops} onBack={() => useLabView.getState().set({ mode: 'bench', focus: 'mouth', spot: null })} />}
      canRead={canRead}
      dragFeedback={(drag) => <SoundDragFeedback drag={drag} s={state} />}
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
      ask={{ suggestions: ASK_SUGGESTIONS, extra: stage === 'try' ? undefined : sono ? 'Why is the rider thrown off only at resonance?' : 'Why is the first resonance at a quarter of a wavelength?' }}
      tourSteps={TOURS[task]}
      safety={SOUND_SAFETY}
      briefed={attemptState.log.some((e) => e.a.startsWith('safety-briefing'))}
      onBriefing={(outcome) => oAttempt.note(`safety-briefing:${outcome}`)}
      missing={phySoundMissing(attemptState, seed)}
      helpRows={HELP_ROWS}
      onResetStation={() => {
        o.damp();
        useBench.setState(BENCH_IDLE);
      }}
      onKey={onKey}
      debriefView={debriefView}
    />
  );
}
