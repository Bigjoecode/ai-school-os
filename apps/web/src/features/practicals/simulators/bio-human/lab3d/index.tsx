import { HUMAN_TASKS, HUMAN_TASK_TITLE, type BioHumanState, type CriterionScore } from '@aischool/shared';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { ModeBar } from '../../../lab3d-kit/hud';
import { LabShell, useLabKit, useNewLogEntries } from '../../../lab3d-kit/shell';
import { play } from '../../../lab3d-kit/sound';
import { notify, useLabView } from '../../../lab3d-kit/store';
import { useBioAssistant } from '../../bio-common/lab3d/common';
import type { SimulatorProps } from '../../types';
import { lessonTask, nextHint, useHuman } from '../actions';
import { bioHumanMissing } from '../missing';
import { BreathNotebook, PulseNotebook, ReactNotebook, SkinNotebook, Written } from '../notebook';
import { TaskText } from '../task-text';
import { BENCH_IDLE, VIEW_BUTTONS, useHumanBench } from './bench';
import { HUMAN_ASK, humanExplainer, humanSafety, humanTour, learnConfig, learnState } from './content';
import { useHumanDemo } from './demo';
import { DRAG_HINT, HumanDrags } from './drag';
import { humanCorrection, humanGuideSteps } from './guide';
import { humanHint3d, humanObjectPanel, type HumanCtx } from './lab-actions';
import { ReadingPanel } from './reading';
import { HumanSandboxBadge, HumanSandboxForm, useHumanSandbox } from './sandbox';
import { HumanLabScene } from './scene';
import { HUMAN_APPARATUS, HUMAN_APPARATUS_LABEL, sceneFromState, type HumanApparatusId } from './scene-state';

/**
 * The 3D human physiology lab: the same experiments as the 2D lab (same
 * state, same actions, same marks) in the biology room with Mrs Okon and a
 * partner. PULSE: rest, fingertips on the wrist, step-ups, counts every
 * minute. BREATH: the lime water apparatus, mirror and cobalt chloride, the
 * thermometer, breathing counts. REACTION: the knee-jerk and the falling
 * rule. SKIN: blindfold, the dividers on five areas of skin.
 *
 * Learn → Mrs Okon's demo (her own partner) → Try, plus an unmarked sandbox
 * and Ask; timed practicals are Try only.
 */

/** Sounds and animations follow the log of whatever state is on the bench (the attempt, the demo or the sandbox). */
function useBenchEffects(log: BioHumanState['log']) {
  const seen = useRef(log.length);
  useEffect(() => {
    const fresh = log.length < seen.current ? [] : log.slice(seen.current);
    seen.current = log.length;
    const now = performance.now();
    for (const { a } of fresh) {
      const verb = a.split(':')[0]!;
      if (verb.startsWith('count')) (useHumanBench.setState({ countAt: now }), play('tick'));
      else if (verb === 'bcount') play('tick');
      else if (verb === 'exercise') (useHumanBench.setState({ exAt: now }), play('creak'));
      else if (verb === 'breathe' || verb === 'mirror' || verb === 'tbreath') (useHumanBench.setState({ breatheAt: now }), play('drip'));
      else if (verb.startsWith('drop')) (useHumanBench.setState({ dropAt: now }), play('clink'));
      else if (verb === 'knee') (useHumanBench.setState({ kneeAt: now }), play('tick'));
      else if (verb === 'touch') (useHumanBench.setState({ touchAt: now }), play('tick'));
      else if (verb === 'lime' || verb === 'cobalt' || verb === 'clean') play('drip');
      else if (verb === 'collect' || verb === 'mouthpiece' || verb === 'blind') play('clink');
    }
  }, [log]);
}

export default function BioHumanLab3D(props: SimulatorProps<'bio-human'>) {
  useBioAssistant();
  const { seed, mode, state: attemptState, onChange, readOnly, startedAt, endsAt, onHandIn, onUse2d, practicalId, attemptId, result } = props;
  const hAttempt = useHuman({ seed, state: attemptState, onChange, readOnly, startedAt, practicalId });
  const task = attemptState.task ?? lessonTask(practicalId);
  const started = attemptState.log.some((e) => !e.a.startsWith('safety-briefing') && !e.a.startsWith('task:'));
  const sandbox = useHumanSandbox(task, startedAt);
  const kit = useLabKit({ mode, readOnly, practicalId, result, started, onStageChange: () => useHumanBench.setState(BENCH_IDLE) });
  const { stage, work, guided, practice } = kit;
  const demo = useHumanDemo({ studentSeed: seed, task, startedAt, active: stage === 'demo', onFinished: () => kit.markJourney('demo') });
  const h = stage === 'sandbox' ? sandbox.h : hAttempt;
  const state = stage === 'sandbox' ? sandbox.state : attemptState;
  const v = h.v;
  const scene = useMemo(() => sceneFromState(state), [state]);
  const lState = useMemo(() => learnState(task), [task]);
  const learn = useMemo(() => learnConfig(task), [task]);
  const safety = useMemo(() => humanSafety(task), [task]);
  const tour = useMemo(() => humanTour(task), [task]);
  const shown = stage === 'learn' ? { v: demo.v, state: lState, h: demo.h } : stage === 'demo' ? { v: demo.v, state: demo.state, h: demo.h } : { v, state, h };
  const shownScene = useMemo(() => sceneFromState(shown.state), [shown.state]);
  const camMode = useLabView((x) => x.mode);
  useLabView((x) => x.held);
  useHumanBench((b) => b.area);
  useHumanBench((b) => b.sep);
  useEffect(() => () => useHumanBench.setState(BENCH_IDLE), []);
  useBenchEffects(shown.state.log);

  // ---- guidance
  const steps = useMemo(() => (guided ? humanGuideSteps(state, scene, camMode) : []), [guided, state, scene, camMode]);
  useNewLogEntries(state.log, stage, (fresh) => {
    if (!guided || !fresh.length) return;
    let found = null;
    for (const e of fresh) found = humanCorrection(e.a, state) ?? found;
    if (found) kit.correct(found);
  });

  if (import.meta.env.DEV) Object.assign(window, { __lab3dState: attemptState, __lab3dShown: shown.state, __lab3dStage: stage, __humanV: v });
  const ctx: HumanCtx = { h, s: state, scene, open: (w) => (useLabView.getState().set({ selected: null }), kit.setSheet(w)) };
  const shownCtx: HumanCtx = { h: shown.h, s: shown.state, scene: shownScene, open: ctx.open };
  const onCarry = useCallback(
    (id: string) => {
      h.note(`collect:${id}`);
      notify(`${HUMAN_APPARATUS_LABEL[id as HumanApparatusId]} is on your bench.`, 'success', 1500);
    },
    [h],
  );
  const canRead = true;
  const focusOf = task === 'BREATH' ? 'apparatus' : task === 'REACTION' ? 'rule' : task === 'SKIN' ? 'arm' : 'wrist';
  const debriefView = (c: CriterionScore) => (c.id === 'procedure' ? { mode: 'bench' as const, focus: focusOf } : { mode: 'bench' as const, focus: 'bench', notebook: true });
  const flat = 'border-0 p-0 shadow-none sm:p-0';
  const notebook = (
    <div className="space-y-4">
      {task === 'BREATH' ? <BreathNotebook state={state} readOnly={readOnly} update={h.update} book className={flat} /> : task === 'REACTION' ? <ReactNotebook state={state} readOnly={readOnly} update={h.update} book className={flat} /> : task === 'SKIN' ? <SkinNotebook state={state} readOnly={readOnly} update={h.update} book className={flat} /> : <PulseNotebook state={state} readOnly={readOnly} update={h.update} book className={flat} />}
      <Written state={state} readOnly={readOnly} update={h.update} className={flat} />
    </div>
  );
  const look = () => (useLabView.getState().set({ mode: 'read', selected: null }), kit.setSheet(null));

  return (
    <LabShell
      kit={kit}
      title="Biology lab"
      heading={`Biology laboratory — ${HUMAN_TASK_TITLE[task].toLowerCase()}`}
      intro={{
        short: task === 'BREATH' ? 'Coat on; your partner breathes through the lime water apparatus, on a mirror and on a thermometer.' : task === 'REACTION' ? 'Coat on; test your partner’s knee-jerk, then time their catch of a falling metre rule.' : task === 'SKIN' ? 'Coat on; blindfold your partner and find the smallest gap felt as two points on five areas of skin.' : 'Coat on; take your partner’s pulse at rest, after step-ups and every minute as it recovers.',
        steps:
          task === 'BREATH'
            ? ['Put on your lab coat (hooks by the door).', 'Collect the apparatus, lime water, mouthpieces, mirror, cobalt chloride paper, thermometer and stopwatch.', 'Clean mouthpiece, equal lime water, ten gentle breaths.', 'Dry mirror + cobalt chloride; room then breath temperature; count breaths.']
            : task === 'REACTION'
              ? ['Put on your lab coat (hooks by the door).', 'Collect the metre rule.', 'Knee-jerk with the side of your hand.', 'Forearm on the bench edge, thumb at 0 cm; drop without warning ×10, other hand ×5.']
              : task === 'SKIN'
                ? ['Put on your lab coat (hooks by the door).', 'Collect the dividers, mm ruler, blindfold and alcohol wipes.', 'Clean the points; blindfold your partner.', 'One or two points at random; narrow the gap on each of five areas.']
                : ['Put on your lab coat (hooks by the door).', 'Collect the stopwatch and the step.', 'Ask about asthma, heart, sickle cell; rest 5 min; count 15 s ×3.', 'Step-ups 2 min; count at once, then every minute until back to rest.'],
      }}
      readingStatus={task === 'BREATH' ? 'watching the lime water' : task === 'REACTION' ? 'reading the rule' : task === 'SKIN' ? 'touching the skin' : 'taking the pulse'}
      scene={
        <>
          <HumanLabScene v={shown.v} state={shown.state} scene={shownScene} guided={guided || stage === 'learn'} onSlow={kit.onSlow} />
          {!readOnly && work && <HumanDrags ctx={ctx} />}
        </>
      }
      endsAt={endsAt}
      onHandIn={onHandIn}
      onUse2d={onUse2d}
      attemptId={attemptId}
      steps={steps}
      hint={practice && !guided ? humanHint3d(ctx, nextHint(v, state)) : null}
      objectPanel={(id) => (work ? humanObjectPanel(id, ctx) : null)}
      explain={humanExplainer}
      task={
        <>
          <TaskText v={v} />
          {!readOnly && !practicalId && stage === 'try' && !started && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {HUMAN_TASKS.map((t) => (
                <Button key={t} size="sm" variant={task === t ? 'brand' : 'outline'} onClick={() => hAttempt.chooseTask(t)}>
                  {HUMAN_TASK_TITLE[t]}
                </Button>
              ))}
            </div>
          )}
          <p className="mt-4 text-[12.5px] font-semibold">Safety</p>
          <p className="text-[13px] text-muted-foreground">
            Lab coat: {scene.coat ? 'on' : 'not on'} · Hands washed at the end: {scene.washedAtEnd ? 'yes' : 'not yet'}
          </p>
        </>
      }
      notebook={notebook}
      cupboard={{
        blurb: 'Take what you need to your bench — or drag things from the cupboard onto the tray.',
        items: HUMAN_APPARATUS.map((a) => ({ id: a.id, label: a.label })),
        has: (id) => scene.collected.has(id as HumanApparatusId),
        onToggle: (id, take) => h.note(`${take ? 'collect' : 'return'}:${id}`),
        onCarry,
      }}
      modeBar={<ModeBar views={VIEW_BUTTONS[task]} read={{ label: task === 'SKIN' ? 'Touch' : task === 'PULSE' ? 'Count' : task === 'BREATH' ? 'Watch' : 'Read', can: canRead }} onRead={look} />}
      readingPanel={<ReadingPanel ctx={shownCtx} readOnly={readOnly || stage === 'learn' || stage === 'demo'} onBack={() => useLabView.getState().set({ mode: 'bench', focus: focusOf })} />}
      canRead={canRead}
      dragFeedback={(d) => (DRAG_HINT[d.kind] ? <span className="absolute left-1/2 top-24 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1.5 text-[12.5px] font-medium text-white shadow-lg">{DRAG_HINT[d.kind]}</span> : null)}
      learn={learn}
      demo={demo.player}
      demoPanel={demo.panel}
      sandbox={{
        form: (
          <HumanSandboxForm
            sandbox={sandbox}
            onStart={(x) => {
              sandbox.start(x);
              kit.goStage('sandbox');
            }}
          />
        ),
        results: <HumanSandboxBadge sandbox={sandbox} />,
      }}
      ask={{ suggestions: HUMAN_ASK[task], extra: stage === 'try' ? undefined : task === 'BREATH' ? 'Why does tube A stay clear?' : task === 'REACTION' ? 'Why is catching slower than the knee-jerk?' : task === 'SKIN' ? 'Why does the forearm need a wide gap?' : 'Why does the pulse fall gradually?' }}
      tourSteps={tour}
      safety={safety}
      briefed={attemptState.log.some((e) => e.a.startsWith('safety-briefing'))}
      onBriefing={(outcome) => hAttempt.note(`safety-briefing:${outcome}`)}
      missing={bioHumanMissing(attemptState, seed)}
      onResetStation={() => useHumanBench.setState(BENCH_IDLE)}
      debriefView={debriefView}
    />
  );
}
