import type { CriterionScore } from '@aischool/shared';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Kbd } from '@/components/ui/kbd';
import { ModeBar } from '../../../lab3d-kit/hud';
import { play } from '../../../lab3d-kit/sound';
import { notify, useLabView } from '../../../lab3d-kit/store';
import { LabShell, useLabKit, useNewLogEntries } from '../../../lab3d-kit/shell';
import { physicsTour, usePhysicsAssistant } from '../../phy-common/lab3d/common';
import { PENDULUM_SAFETY } from '../../phy-common/lab3d/safety';
import type { SimulatorProps } from '../../types';
import { pendulumHint, usePendulum } from '../actions';
import { Notebook, PendulumTaskText } from '../index';
import { phyPendulumMissing } from '../missing';
import { PendulumDock, PendulumDragFeedback, ReadingPanel } from './bench-hud';
import { ASK_SUGGESTIONS, explainer } from './content';
import { usePendulumDemo } from './demo-hook';
import { correctionFor, guideSteps, nextHint3d } from './guide';
import { objectPanel, type ActionCtx } from './lab-actions';
import { BENCH_IDLE, useBench } from './layout';
import { SandboxResults, SandboxSetupForm, useSandbox } from './sandbox';
import { LabScene } from './scene';
import { APPARATUS, APPARATUS_LABEL, sceneFromState, type ApparatusId } from './scene-state';
import { LEARN_CONFIG, LEARN_STATE, VIEW_BUTTONS } from './views';

/**
 * The 3D physics laboratory for the simple pendulum: the same state, actions
 * and marks as the 2D lab, on the shared 3D lab kit. The student collects the
 * apparatus, closes the window, sets the thread on the metre rule (read at eye
 * level), pulls the bob aside through a small angle, lets it go and times 20
 * real oscillations on the stopwatch from the fiducial mark. Journey: Learn →
 * Mr Bayo's demo → Try (plus an unmarked sandbox); timed practicals are Try only.
 */

const noop = () => undefined;
const TOUR = physicsTour({
  focusId: 'pendulum',
  focusLabel: 'Pendulum',
  readLabel: 'Read the rule',
  readText: '“Read the rule” brings your eye level with the top of the bob on the metre rule. Move your eye up and down: read where the line and the top of the bob meet, without parallax.',
  taskText: 'The task card is the question paper: the bob’s diameter and the lengths to time. Open it now.',
});
const HELP_ROWS: [string, React.ReactNode][] = [
  ['Swing the bob', 'Drag it sideways and let go (or the dock: Release)'],
  ['Thread length', 'Drag the split cork up or down (or −/+ in the dock)'],
  ['Stopwatch', <><Kbd>S</Kbd> start / stop, <Kbd>Enter</Kbd> records the timing</>],
  ['Metre rule', <><Kbd>R</Kbd> to read at eye level, ↑ / ↓ moves your eye</>],
];
const CUPBOARD_ITEMS = APPARATUS.map((a) => ({ id: a.id, label: a.label }));

export default function PhyPendulumLab3D(props: SimulatorProps<'phy-pendulum'>) {
  usePhysicsAssistant();
  const { seed, mode, state: attemptState, onChange, readOnly, startedAt, endsAt, onHandIn, onUse2d, practicalId, attemptId, result } = props;
  const started = attemptState.log.some((e) => !e.a.startsWith('safety-briefing'));
  const pAttempt = usePendulum({ seed, state: attemptState, onChange, readOnly, startedAt });
  const sandbox = useSandbox(startedAt);
  const pRef = useRef(pAttempt);
  const kit = useLabKit({
    mode,
    readOnly,
    practicalId,
    result,
    started,
    onStageChange: () => {
      pRef.current.stopSwing();
      useBench.setState({ pull: null });
    },
  });
  const { stage, work, guided, practice } = kit;
  const pLearn = usePendulum({ seed, state: LEARN_STATE, onChange: noop, readOnly: true, startedAt });
  const demo = usePendulumDemo({ studentSeed: seed, startedAt, active: stage === 'demo', onFinished: () => kit.markJourney('demo') });
  const p = stage === 'sandbox' ? sandbox.p : pAttempt;
  pRef.current = p;
  const state = stage === 'sandbox' ? sandbox.state : attemptState;
  const scene = useMemo(() => sceneFromState(state), [state]);
  const shown = stage === 'learn' ? { p: pLearn, state: LEARN_STATE } : stage === 'demo' ? { p: demo.p, state: demo.state } : { p, state };
  const shownScene = useMemo(() => sceneFromState(shown.state), [shown.state]);
  const camMode = useLabView((v) => v.mode);
  useEffect(() => () => useBench.setState(BENCH_IDLE), []);

  // ---- guidance
  const v = p.v;
  const steps = useMemo(() => (guided ? guideSteps(state, scene, camMode, v, p.swing, p.watch) : []), [guided, state, scene, camMode, v, p.swing, p.watch]);
  useNewLogEntries(state.log, stage, (fresh) => {
    if (!guided || !fresh.length) return;
    let found = null;
    for (const e of fresh) found = correctionFor(e.a, state, v) ?? found;
    if (found) kit.correct(found);
  });

  if (import.meta.env.DEV) Object.assign(window, { __lab3dState: attemptState, __lab3dShown: shown.state, __lab3dStage: stage, __lab3dSandbox: sandbox.state, __lab3dPendulum: p });
  const open = (w: 'notebook' | 'task' | 'cupboard') => (useLabView.getState().set({ selected: null }), kit.setSheet(w));
  const ctx: ActionCtx = { p, s: state, scene, open };
  const onCarry = useCallback((id: string) => {
    pRef.current.note(`collect:${id}`);
    notify(`${APPARATUS_LABEL[id as ApparatusId]} is on your bench.`, 'success', 1500);
  }, []);
  const canRead = scene.hung && scene.collected.has('rule') && !p.swing;
  const onKey = (e: KeyboardEvent, type: 'down' | 'up') => {
    if (type === 'up' || useLabView.getState().mode === 'walk') return false;
    const k = e.key.toLowerCase();
    if (k === 's' && p.swing && p.watch.stop === null) {
      if (p.watch.start === null) p.startWatch();
      else p.stopWatch();
      play('tick');
    } else if (k === 'enter' && p.watch.stop !== null) {
      p.record();
      play('success');
    } else if (k === ' ' && scene.hung) {
      e.preventDefault();
      if (p.swing) p.stopSwing();
      else (p.release(), play('clink'));
    } else return false;
    return true;
  };
  const debriefView = (c: CriterionScore) =>
    c.id === 'setup' ? { mode: 'bench' as const, focus: 'cork' } : c.id === 'procedure' ? { mode: 'bench' as const, focus: 'pendulum' } : c.id === 'readings' ? { mode: 'bench' as const, focus: 'stopwatch', notebook: true } : { mode: 'bench' as const, focus: 'bench', notebook: true };

  return (
    <LabShell
      kit={kit}
      title="Physics lab"
      heading="Physics laboratory"
      intro={{
        short: 'Collect the apparatus, close the window, then time the pendulum at your bench.',
        steps: [
          'Collect the apparatus from the cupboard on the right.',
          'Close the window by your bench: no draughts.',
          'Set the thread on the metre rule, pull the bob aside a little and let go.',
          'Time 20 oscillations from the fiducial mark, record, and repeat for each length.',
        ],
      }}
      readingStatus="reading the metre rule"
      scene={<LabScene state={shown.state} scene={shownScene} p={shown.p} guided={guided || stage === 'learn'} interactive={!readOnly && work} onSlow={kit.onSlow} />}
      endsAt={endsAt}
      onHandIn={onHandIn}
      onUse2d={onUse2d}
      attemptId={attemptId}
      steps={steps}
      hint={practice && !guided ? nextHint3d(scene, pendulumHint(state, p.swing, p.watch)) : null}
      objectPanel={(id) => objectPanel(id, ctx)}
      explain={explainer}
      task={
        <div className="space-y-2 text-[13.5px] leading-relaxed">
          <PendulumTaskText v={v} />
          <p className="text-[12.5px] text-muted-foreground">Window: {state.shielded ? 'closed' : 'open (a draught)'} · Thread: {state.thread.toFixed(1)} cm · Angle: {state.amplitude}° · Timing {state.n} oscillations</p>
        </div>
      }
      notebook={<Notebook state={state} readOnly={readOnly} update={p.update} removeRun={p.removeRun} />}
      cupboard={{
        blurb: 'Take what you need for the simple pendulum to your bench — or drag things from the cupboard onto the tray.',
        items: CUPBOARD_ITEMS,
        has: (id) => scene.collected.has(id as ApparatusId),
        onToggle: (id, take) => p.note(`${take ? 'collect' : 'return'}:${id}`),
        onCarry,
      }}
      dock={scene.hung ? <PendulumDock p={p} s={state} lab={mode === 'LAB'} compact={kit.touch} hung={scene.hung} /> : null}
      modeBar={<ModeBar views={VIEW_BUTTONS} read={{ label: 'Read the rule', can: canRead }} onRead={() => canRead && (useLabView.getState().set({ mode: 'read', selected: null }), kit.setSheet(null))} />}
      readingPanel={<ReadingPanel s={state} radius={v.bobRadius} onBack={() => useLabView.getState().set({ mode: 'bench', focus: 'cork' })} />}
      canRead={canRead}
      dragFeedback={(drag) => <PendulumDragFeedback drag={drag} s={state} />}
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
      ask={{ suggestions: ASK_SUGGESTIONS, extra: stage === 'try' ? undefined : 'Why does the period not depend on the mass of the bob?' }}
      tourSteps={TOUR}
      safety={PENDULUM_SAFETY}
      briefed={attemptState.log.some((e) => e.a.startsWith('safety-briefing'))}
      onBriefing={(outcome) => pAttempt.note(`safety-briefing:${outcome}`)}
      missing={phyPendulumMissing(attemptState, seed)}
      helpRows={HELP_ROWS}
      onResetStation={() => {
        p.stopSwing();
        useBench.setState({ pull: null });
      }}
      onKey={onKey}
      debriefView={debriefView}
    />
  );
}
