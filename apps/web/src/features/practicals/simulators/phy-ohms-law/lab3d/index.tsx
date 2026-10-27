import type { CriterionScore, OhmsTerminal } from '@aischool/shared';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { ModeBar } from '../../../lab3d-kit/hud';
import { play } from '../../../lab3d-kit/sound';
import { notify, useLabView } from '../../../lab3d-kit/store';
import { LabShell, useLabKit, useNewLogEntries } from '../../../lab3d-kit/shell';
import { physicsTour, usePhysicsAssistant } from '../../phy-common/lab3d/common';
import { ELECTRIC_SAFETY } from '../../phy-common/lab3d/safety';
import type { SimulatorProps } from '../../types';
import { lessonTask, settingsOf, useOhms } from '../actions';
import { Notebook, OhmsTaskText } from '../index';
import { phyOhmsMissing } from '../missing';
import { BENCH_IDLE, useBench } from './bench-store';
import { OhmsDock, OhmsDragFeedback, ReadingPanel } from './bench-hud';
import { useOhmsDemo } from './demo-hook';
import { ASK_SUGGESTIONS, explainer } from './explain-content';
import { correctionFor, guideSteps } from './guide';
import { joinWire, nextHint3d, objectPanel, type ActionCtx } from './lab-actions';
import { SandboxResults, SandboxSetupForm, useSandbox } from './sandbox';
import { LabScene } from './scene';
import { APPARATUS, APPARATUS_LABEL, sceneFromState, type ApparatusId } from './scene-state';
import { LEARN_CONFIG, learnState, viewButtons } from './views';
import { ohmsMeters } from '@aischool/shared';

/**
 * The 3D physics laboratory for Ohm's law and the resistivity of a wire: the
 * same state, actions and marks as the 2D lab, on the shared 3D lab kit. The
 * student collects the apparatus, lays it out on the circuit board, joins the
 * wires terminal to terminal, closes the key, reads the analogue meters face
 * on and records everything in the notebook. Journey: Learn → Mr Bayo's demo
 * → Try (plus an unmarked sandbox); timed practicals are Try only.
 */

const noop = () => undefined;
const TOUR = physicsTour({
  focusId: 'ammeter',
  focusLabel: 'Ammeter',
  readLabel: 'Read meters',
  readText: '“Read meters” puts your eye straight in front of the pointer. Read it to half a division — and see how it seems to move when your eye is above or below it (parallax).',
  taskText: 'The task card is the question paper: what to connect, what to measure and what to plot. Open it now.',
});
const HELP_ROWS: [string, React.ReactNode][] = [
  ['Join a wire', 'Drag from one terminal post to another (or select a terminal: “Start a wire here”)'],
  ['Meters', <><Kbd>R</Kbd> read at eye level, ↑ / ↓ to move your eye</>],
  ['Key, reading', <><Kbd>K</Kbd> opens / closes the key, <Kbd>Enter</Kbd> takes the reading</>],
];
const CUPBOARD_ITEMS = APPARATUS.map((a) => ({ id: a.id, label: a.label }));

export default function PhyOhmsLab3D(props: SimulatorProps<'phy-ohms-law'>) {
  usePhysicsAssistant();
  const { seed, mode, state: attemptState, onChange, readOnly, startedAt, endsAt, onHandIn, onUse2d, practicalId, attemptId, result } = props;
  const started = attemptState.log.some((e) => !e.a.startsWith('safety-briefing') && !e.a.startsWith('task:'));
  const oAttempt = useOhms({ seed, state: attemptState, onChange, readOnly, startedAt, practicalId });
  const sandbox = useSandbox(startedAt);
  const kit = useLabKit({ mode, readOnly, practicalId, result, started, onStageChange: () => useBench.setState({ picked: null }) });
  const { stage, work, guided, practice } = kit;
  const lessonT = attemptState.task ?? lessonTask(practicalId);
  const learnS = useMemo(() => learnState(lessonT), [lessonT]);
  const oLearn = useOhms({ seed, state: learnS, onChange: noop, readOnly: true, startedAt, autoTask: false });
  const demo = useOhmsDemo({ studentSeed: seed, startedAt, task: lessonT, active: stage === 'demo', onFinished: () => kit.markJourney('demo') });
  const o = stage === 'sandbox' ? sandbox.o : oAttempt;
  const state = stage === 'sandbox' ? sandbox.state : attemptState;
  const scene = useMemo(() => sceneFromState(state), [state]);
  const shown = stage === 'learn' ? { o: oLearn, state: learnS } : stage === 'demo' ? { o: demo.o, state: demo.state } : { o, state };
  const shownScene = useMemo(() => sceneFromState(shown.state), [shown.state]);
  const shownMeters = ohmsMeters(shown.o.v, settingsOf(shown.state), shown.state.readings.length);
  const camMode = useLabView((v) => v.mode);
  useBench((b) => b.picked);
  useEffect(() => () => useBench.setState(BENCH_IDLE), []);

  // ---- guidance
  const v = o.v;
  const steps = useMemo(() => (guided ? guideSteps(state, scene, camMode, v) : []), [guided, state, scene, camMode, v]);
  useNewLogEntries(state.log, stage, (fresh) => {
    if (!guided || !fresh.length) return;
    let found = null;
    for (const e of fresh) found = correctionFor(e.a, state, v) ?? found;
    if (found) kit.correct(found);
  });

  if (import.meta.env.DEV) Object.assign(window, { __lab3dState: attemptState, __lab3dShown: shown.state, __lab3dStage: stage, __lab3dSandbox: sandbox.state });
  const open = (w: 'notebook' | 'task' | 'cupboard') => (useLabView.getState().set({ selected: null }), kit.setSheet(w));
  const ctx: ActionCtx = { o, s: state, scene, open };
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  const onCarry = useCallback(
    (id: string) => {
      ctxRef.current.o.note(`collect:${id}`);
      notify(`${APPARATUS_LABEL[id as ApparatusId]} is on your bench.`, 'success', 1500);
    },
    [],
  );
  const canRead = scene.collected.has('ammeter') || scene.collected.has('voltmeter');
  const onKey = (e: KeyboardEvent, type: 'down' | 'up') => {
    if (type === 'up') return false;
    const k = e.key.toLowerCase();
    if (useLabView.getState().mode === 'walk') return false;
    if (k === 'k' && scene.collected.has('key')) {
      o.toggleKey();
      play('clink');
    } else if (k === 'enter' && state.key) {
      o.takeReading();
      play('success');
    } else return false;
    return true;
  };
  const debriefView = (c: CriterionScore) =>
    c.id === 'circuit' || c.id === 'procedure' ? { mode: 'bench' as const, focus: 'board' } : c.id === 'readings' ? { mode: 'bench' as const, focus: 'ammeter' } : { mode: 'bench' as const, focus: 'bench', notebook: true };
  const join = useCallback((a: OhmsTerminal, b: OhmsTerminal) => joinWire(ctxRef.current, a, b), []);

  return (
    <LabShell
      kit={kit}
      title="Physics lab"
      heading="Physics laboratory"
      intro={{
        short: 'Collect the apparatus, wire the circuit on your bench, then read the meters.',
        steps: [
          'Collect the apparatus from the cupboard on the right.',
          'Go to your bench and lay it out on the circuit board.',
          `Join the wires: everything in series, the voltmeter across the ${lessonT === 'WIRE' ? 'length of wire' : 'resistor'}.`,
          'Close the key, read both meters face on, record, open the key.',
        ],
      }}
      readingStatus="reading the meters"
      scene={
        <LabScene
          state={shown.state}
          scene={shownScene}
          meters={shownMeters}
          v={shown.o.v}
          board={shown.o.board}
          guided={guided || stage === 'learn'}
          interactive={!readOnly && work}
          onSlow={kit.onSlow}
          drag={{ board: o.board, state, join, setRheostat: o.setRheostat, setJockey: o.setJockey }}
        />
      }
      endsAt={endsAt}
      onHandIn={onHandIn}
      onUse2d={onUse2d}
      attemptId={attemptId}
      steps={steps}
      hint={practice && !guided ? nextHint3d(state, scene, o.meters.I) : null}
      objectPanel={(id) => objectPanel(id, ctx)}
      explain={explainer}
      task={
        <div className="space-y-2 text-[13.5px] leading-relaxed">
          <OhmsTaskText task={state.task} v={v} />
          {!readOnly && state.readings.length === 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {(['OHM', 'WIRE'] as const).map((t) => (
                <Button key={t} size="sm" variant={state.task === t ? 'brand' : 'outline'} onClick={() => o.chooseTask(t)} aria-pressed={state.task === t}>
                  {t === 'OHM' ? "Verify Ohm's law (resistor)" : 'Resistivity of a wire'}
                </Button>
              ))}
            </div>
          )}
        </div>
      }
      notebook={<Notebook task={o.task} state={state} readOnly={readOnly} update={o.update} removeReading={o.removeReading} />}
      cupboard={{
        blurb: 'Take what you need for this experiment to your bench — or drag things from the cupboard onto the tray.',
        items: CUPBOARD_ITEMS,
        has: (id) => scene.collected.has(id as ApparatusId),
        onToggle: (id, take) => o.note(`${take ? 'collect' : 'return'}:${id}`),
        onCarry,
      }}
      dock={scene.collected.has('key') || scene.collected.has('rheostat') ? <OhmsDock o={o} s={state} compact={kit.touch} /> : null}
      modeBar={<ModeBar views={viewButtons(o.task)} read={{ label: 'Read meters', can: canRead }} onRead={() => canRead && (useLabView.getState().set({ mode: 'read', selected: null }), kit.setSheet(null))} />}
      readingPanel={<ReadingPanel o={o} s={state} onBack={() => useLabView.getState().set({ mode: 'bench', focus: useBench.getState().meter === 'A' ? 'ammeter' : 'voltmeter' })} />}
      canRead={canRead}
      dragFeedback={(drag) => <OhmsDragFeedback drag={drag} s={state} />}
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
      ask={{ suggestions: ASK_SUGGESTIONS, extra: stage === 'try' ? undefined : lessonT === 'WIRE' ? 'Why is R proportional to the length L?' : 'Why must the temperature stay constant?' }}
      tourSteps={TOUR}
      safety={ELECTRIC_SAFETY}
      briefed={attemptState.log.some((e) => e.a.startsWith('safety-briefing'))}
      onBriefing={(outcome) => oAttempt.note(`safety-briefing:${outcome}`)}
      missing={phyOhmsMissing(attemptState, seed)}
      helpRows={HELP_ROWS}
      onResetStation={() => useBench.setState({ picked: null })}
      onKey={onKey}
      debriefView={debriefView}
    />
  );
}
