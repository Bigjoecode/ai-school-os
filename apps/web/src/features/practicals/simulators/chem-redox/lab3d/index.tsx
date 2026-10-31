import type { CriterionScore } from '@aischool/shared';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Kbd } from '@/components/ui/kbd';
import { setAssistant } from '../../../lab3d-kit/assistant-profile';
import { defaultTourSteps } from '../../../lab3d-kit/tour';
import { ModeBar } from '../../../lab3d-kit/hud';
import { notify, useLabView } from '../../../lab3d-kit/store';
import { CHEM_SAFETY } from '../../../lab3d-kit/safety-content';
import { LabShell, useLabKit, useNewLogEntries } from '../../../lab3d-kit/shell';
import { play, startPour, stopPour } from '../../../lab3d-kit/sound';
import type { SimulatorProps } from '../../types';
import { TASK_TITLE, lessonTask, useRedox } from '../actions';
import { chemRedoxMissing } from '../missing';
import { Notebook, TaskBrief } from '../notebook';
import { askSuggestions } from './ask-content';
import { BENCH_IDLE, tapLevel, useBench } from './bench-store';
import { ReadingPanel, RedoxDock, RedoxDragFeedback } from './bench-hud';
import { useRedoxDemo } from './demo-hook';
import { explainer } from './explain-content';
import { correctionFor, guideSteps } from './guide';
import { nextHint3d, objectPanel, swirl } from './lab-actions';
import { learnConfig, learnState } from './learn-config';
import { SandboxResults, SandboxSetupForm, useSandbox } from './sandbox';
import { LabScene } from './scene';
import { APPARATUS_LABEL, apparatusFor, sceneFromState, type ApparatusId } from './scene-state';
import { viewButtons } from './views';

/**
 * The 3D chemistry laboratory for redox titrations: the same lab as the 2D
 * one (same state, same actions, same marks) in the kit's walk-in room, built
 * on the titration lab's bench. Which titration (KMnO₄ with iron(II), KMnO₄
 * with ethanedioic acid, iodine with thiosulphate) follows from the lesson.
 *
 * The journey: Learn → Watch Mrs Ada's demo → Try (plus an unmarked sandbox),
 * with Ask Mrs Ada throughout; timed (exam) practicals are Try only, without
 * guidance. After marking, the same lab opens read-only with a debrief.
 */

const noop = () => undefined;
const TOUR = defaultTourSteps({
  focusId: 'burette',
  focusLabel: 'Burette',
  readLabel: 'Read burette',
  readText: 'Once the burette is filled, “Read burette” brings your eye level with the meniscus. Move your eye until the ring marks look like straight lines. KMnO₄ is too dark to see through: read the TOP of its meniscus.',
});
const HELP_ROWS: [string, React.ReactNode][] = [
  ['Read the burette', <><Kbd>R</Kbd>, then ↑ / ↓ or the wheel to move your eye</>],
  ['Tap', <>Hold <Kbd>Space</Kbd> to run A in, <Kbd>D</Kbd> one drop, <Kbd>F</Kbd> swirl</>],
];

export default function ChemRedoxLab3D(props: SimulatorProps<'chem-redox'>) {
  // Set on every render: another lab (biology, physics) may have changed it in this tab.
  setAssistant({ name: 'Mrs Ada', role: 'lab technician', look: 'ada', pronoun: 'her' });
  const { seed, mode, state: attemptState, onChange, readOnly, startedAt, endsAt, onHandIn, onUse2d, practicalId, attemptId, result } = props;
  const task = attemptState.task ?? lessonTask(practicalId);
  const started = attemptState.log.some((e) => !e.a.startsWith('safety-briefing') && !e.a.startsWith('task:'));
  const tAttempt = useRedox({ seed, state: attemptState, onChange, readOnly, startedAt, practicalId });
  const sandbox = useSandbox(startedAt, task);
  const tRef = useRef(tAttempt);
  const kit = useLabKit({
    mode,
    readOnly,
    practicalId,
    result,
    started,
    onStageChange: () => {
      tRef.current.stopStream();
      tRef.current.heatStop();
      useBench.setState({ pip: 'idle', streaming: false, tap: 0 });
    },
  });
  const { stage, work, guided, practice } = kit;
  const learnS = useMemo(() => learnState(task), [task]);
  const learnT = useRedox({ seed, state: learnS, onChange: noop, readOnly: true, startedAt, autoTask: false });
  const precautions = useMemo(() => kit.lesson?.precautions ?? [], [kit.lesson]);
  const demo = useRedoxDemo({ studentSeed: seed, task, startedAt, precautions, active: stage === 'demo', onFinished: () => kit.markJourney('demo') });
  const t = stage === 'sandbox' ? sandbox.t : tAttempt;
  tRef.current = t;
  const state = stage === 'sandbox' ? sandbox.state : attemptState;
  const scene = useMemo(() => sceneFromState(state), [state]);
  const shown = stage === 'learn' ? { t: learnT, state: learnS } : stage === 'demo' ? { t: demo.t, state: demo.state } : { t, state };
  const shownScene = useMemo(() => sceneFromState(shown.state), [shown.state]);
  const camMode = useLabView((v) => v.mode);
  const tap = useBench((v) => v.tap);
  useBench((v) => v.pip);
  useLabView((v) => v.held);
  useEffect(() => () => useBench.setState(BENCH_IDLE), []);
  const apparatus = useMemo(() => apparatusFor(t.task), [t.task]);
  const cupboardItems = useMemo(() => apparatus.map((a) => ({ id: a.id, label: a.label })), [apparatus]);

  // ---- the tap: turned by dragging (closed / drop by drop / stream) or held open with the button
  const canRun = work && t.canDeliver && scene.flaskUnder;
  const level = tapLevel(tap);
  useEffect(() => {
    if (!work) return;
    const bench = useBench.getState();
    if (!canRun) {
      if (bench.streaming) t.stopStream();
      if (bench.tap || bench.streaming) useBench.setState({ streaming: false, tap: 0 });
      stopPour();
      return;
    }
    if (level === 'stream') {
      useBench.setState({ streaming: true });
      t.startStream();
      startPour();
      return () => {
        t.stopStream();
        useBench.setState({ streaming: false });
        stopPour();
      };
    }
    if (level === 'drops') {
      const id = setInterval(() => {
        t.drop();
        useBench.setState({ dropAt: performance.now() });
        play('drip');
      }, 450);
      return () => clearInterval(id);
    }
  }, [level, canRun, work]);

  // ---- OX: the flame warms the flask while it stands on the gauze over the lit burner
  const warming = work && t.task === 'OX' && scene.onTripod && scene.burnerLit && !!t.open && t.open.initial === null;
  useEffect(() => {
    if (!warming) return;
    t.heatStart();
    return () => t.heatStop();
  }, [warming, t.openIndex]);

  // ---- guidance
  const v = t.v;
  const steps = useMemo(() => (guided ? guideSteps(state, scene, camMode, v, t.temp) : []), [guided, state, scene, camMode, v, t.temp === null ? null : Math.round(t.temp / 5)]);
  const sceneBefore = useRef(scene);
  useNewLogEntries(state.log, stage, (fresh) => {
    if (guided && fresh.length) {
      let found = null;
      for (const e of fresh) found = correctionFor(e.a, state, v, sceneBefore.current) ?? found;
      if (found) kit.correct(found);
    }
    sceneBefore.current = scene;
  });

  if (import.meta.env.DEV) Object.assign(window, { __lab3dState: attemptState, __lab3dShown: shown.state, __lab3dStage: stage, __redoxTemp: () => t.tempNow(), __redoxColour: () => t.colour });
  const canRead = scene.clamped && state.burette !== null;
  const ctx = { t, s: state, scene, open: (w: 'notebook' | 'task' | 'cupboard') => (useLabView.getState().set({ selected: null }), kit.setSheet(w)) };
  const onCarry = useCallback(
    (id: string) => {
      t.note(`collect:${id}`);
      notify(`${APPARATUS_LABEL[id as ApparatusId]} is on your bench.`, 'success', 1500);
    },
    [t],
  );
  const onKey = (e: KeyboardEvent, type: 'down' | 'up') => {
    const vw = useLabView.getState();
    const k = e.key.toLowerCase();
    if (type === 'up') {
      if (e.key === ' ' && useBench.getState().streaming && tapLevel(useBench.getState().tap) !== 'stream') {
        useBench.setState({ streaming: false });
        t.stopStream();
        stopPour();
      }
      return true;
    }
    if (vw.mode !== 'walk' && k === ' ' && !e.repeat && canRun) {
      e.preventDefault();
      useBench.setState({ streaming: true });
      t.startStream();
      startPour();
    } else if (vw.mode !== 'walk' && k === 'd' && canRun) {
      t.drop();
      useBench.setState({ dropAt: performance.now() });
      play('drip');
    } else if (vw.mode !== 'walk' && k === 'f' && t.open) swirl(t);
    else return false;
    return true;
  };
  const debriefView = (c: CriterionScore) =>
    c.id === 'setup' ? { mode: 'bench' as const, focus: 'burette' } : c.id === 'procedure' || c.id === 'technique' ? { mode: 'bench' as const, focus: 'flask' } : c.id === 'readings' ? { mode: 'read' as const, eye: 0 } : { mode: 'bench' as const, focus: 'bench', notebook: true };

  return (
    <LabShell
      kit={kit}
      title="Chemistry lab"
      heading={`Chemistry laboratory · ${TASK_TITLE[task]}`}
      intro={{
        short: 'Put on your coat and goggles, collect apparatus, then titrate at your bench.',
        steps: [
          'Put on your lab coat and goggles (hooks by the door).',
          'Collect your apparatus from the cupboard on the right.',
          task === 'IOD' ? 'Titrate the iodine with thiosulphate to pale straw, add starch, then to colourless.' : task === 'OX' ? 'Acidify the ethanedioic acid, warm it to 60–70 °C and titrate with KMnO₄.' : 'Acidify the iron(II) solution with dilute H₂SO₄ and titrate with KMnO₄ — no indicator.',
          task === 'IOD' ? 'Read the burette at eye level and record it in your notebook.' : 'Read the TOP of the dark meniscus at eye level and record it in your notebook.',
        ],
      }}
      readingStatus="reading the burette"
      scene={<LabScene state={shown.state} scene={shownScene} t={shown.t} v={shown.t.v} guided={guided || stage === 'learn'} interactive={!readOnly && work} onSlow={kit.onSlow} />}
      endsAt={endsAt}
      onHandIn={onHandIn}
      onUse2d={onUse2d}
      attemptId={attemptId}
      steps={steps}
      hint={practice && !guided ? nextHint3d(state, scene, t) : null}
      objectPanel={(id) => objectPanel(id, ctx)}
      explain={explainer}
      task={
        <>
          <TaskBrief v={v} />
          <p className="mt-4 text-[12.5px] font-semibold">Safety</p>
          <p className="text-[13px] text-muted-foreground">
            Lab coat: {scene.coat ? 'on' : 'not on'} · Goggles: {scene.goggles ? 'on' : 'not on'}
          </p>
        </>
      }
      notebook={<Notebook v={v} state={state} readOnly={readOnly} update={t.update} book className="border-0 p-0 shadow-none sm:p-0" />}
      cupboard={{
        blurb: 'Take what you need for this titration to your bench — or drag things from the cupboard onto the tray.',
        items: cupboardItems,
        has: (id) => scene.collected.has(id as ApparatusId),
        onToggle: (id, take) => t.note(`${take ? 'collect' : 'return'}:${id}`),
        onCarry,
      }}
      dock={scene.clamped ? <RedoxDock t={t} scene={scene} s={state} compact={kit.touch} /> : null}
      modeBar={<ModeBar views={viewButtons(task)} read={{ label: 'Read burette', can: canRead }} onRead={() => canRead && (useLabView.getState().set({ mode: 'read', selected: null }), kit.setSheet(null))} />}
      readingPanel={<ReadingPanel t={t} s={state} onBack={() => useLabView.getState().set({ mode: 'bench', focus: 'burette' })} />}
      canRead={canRead}
      dragFeedback={(drag) => <RedoxDragFeedback drag={drag} />}
      learn={learnConfig(task)}
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
      ask={{ suggestions: askSuggestions(task), extra: stage === 'try' ? undefined : task === 'IOD' ? 'Why is starch added near the end point?' : 'Why is no indicator needed with KMnO₄?' }}
      tourSteps={TOUR}
      safety={CHEM_SAFETY}
      briefed={attemptState.log.some((e) => e.a.startsWith('safety-briefing'))}
      onBriefing={(outcome) => tAttempt.note(`safety-briefing:${outcome}`)}
      missing={chemRedoxMissing(attemptState, seed)}
      helpRows={HELP_ROWS}
      onResetStation={() => {
        t.stopStream();
        t.heatStop();
        useBench.setState({ pip: 'idle', streaming: false, tap: 0 });
      }}
      onKey={onKey}
      debriefView={debriefView}
    />
  );
}
