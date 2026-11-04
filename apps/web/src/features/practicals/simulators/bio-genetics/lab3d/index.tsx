import { GEN_TASKS, GEN_TASK_TITLE, type BioGeneticsState, type CriterionScore } from '@aischool/shared';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { ModeBar } from '../../../lab3d-kit/hud';
import { LabShell, useLabKit, useNewLogEntries } from '../../../lab3d-kit/shell';
import { play } from '../../../lab3d-kit/sound';
import { notify, useLabView } from '../../../lab3d-kit/store';
import { useBioAssistant } from '../../bio-common/lab3d/common';
import type { SimulatorProps } from '../../types';
import { lessonTask, nextHint, useGenetics } from '../actions';
import { bioGeneticsMissing } from '../missing';
import { GenNotebook, Written } from '../notebook';
import { TaskText } from '../task-text';
import { BENCH_IDLE, FOCUS_OF, VIEW_BUTTONS, useGenBench } from './bench';
import { GEN_ASK, genExplainer, genSafety, genTour, learnConfig, learnState } from './content';
import { useGenDemo } from './demo';
import { DRAG_HINT, GenDrags } from './drag';
import { genCorrection, genGuideSteps } from './guide';
import { genHint3d, genObjectPanel, type GenCtx } from './lab-actions';
import { ReadingPanel } from './reading';
import { GenSandboxBadge, GenSandboxForm, useGenSandbox } from './sandbox';
import { GenLabScene } from './scene';
import { GEN_APPARATUS, GEN_APPARATUS_LABEL, sceneFromState, type GenApparatusId } from './scene-state';

/**
 * The 3D variation, genetics and food-web lab: the same experiments as the 2D
 * lab (same state, same actions, same marks) in the biology room with Mrs
 * Okon. HEIGHT: the height board with the class queueing, the set square and
 * the ruler for hand spans. DISCRETE: each classmate across the bench, the
 * mirror and the health cards. CROSS: two beakers of beads and the tray.
 * FOOD: the field-note cards, the sweep net and the data card.
 *
 * Learn → Mrs Okon's demo (her own class) → Try, plus an unmarked sandbox
 * and Ask; timed practicals are Try only.
 */

/** Sounds and animations follow the log of whatever state is on the bench (the attempt, the demo or the sandbox). */
function useBenchEffects(log: BioGeneticsState['log']) {
  const seen = useRef(log.length);
  useEffect(() => {
    const fresh = log.length < seen.current ? [] : log.slice(seen.current);
    seen.current = log.length;
    const now = performance.now();
    for (const { a } of fresh) {
      const [verb, arg] = a.split(':');
      if (verb === 'measure') (useGenBench.setState(arg === 'S' ? { spanAt: now } : { measureAt: now }), play('tick'));
      else if (verb === 'declined') (useGenBench.setState({ measureAt: now }), play('tick'));
      else if (verb === 'roll') (useGenBench.setState({ rollAt: now }), play('tick'));
      else if (verb === 'card') (useGenBench.setState({ cardAt: now }), play('clink'));
      else if (verb === 'draw') (useGenBench.setState({ drawAt: now }), play('clink'));
      else if (verb === 'fill') play('drip');
      else if (verb === 'survey') (useGenBench.setState({ surveyAt: now }), play('creak'));
      else if (verb === 'collect' || verb === 'gloves' || verb === 'call') play('clink');
    }
  }, [log]);
}

export default function BioGeneticsLab3D(props: SimulatorProps<'bio-genetics'>) {
  useBioAssistant();
  const { seed, mode, state: attemptState, onChange, readOnly, startedAt, endsAt, onHandIn, onUse2d, practicalId, attemptId, result } = props;
  const gAttempt = useGenetics({ seed, state: attemptState, onChange, readOnly, startedAt, practicalId });
  const task = attemptState.task ?? lessonTask(practicalId);
  const started = attemptState.log.some((e) => !e.a.startsWith('safety-briefing') && !e.a.startsWith('task:'));
  const sandbox = useGenSandbox(task, startedAt);
  const kit = useLabKit({ mode, readOnly, practicalId, result, started, onStageChange: () => useGenBench.setState(BENCH_IDLE) });
  const { stage, work, guided, practice } = kit;
  const demo = useGenDemo({ studentSeed: seed, task, startedAt, active: stage === 'demo', onFinished: () => kit.markJourney('demo') });
  const g = stage === 'sandbox' ? sandbox.g : gAttempt;
  const state0 = stage === 'sandbox' ? sandbox.state : attemptState;
  const state = state0.task ? state0 : { ...state0, task };
  const v = g.v;
  const scene = useMemo(() => sceneFromState(state), [state]);
  const lState = useMemo(() => learnState(task), [task]);
  const learn = useMemo(() => learnConfig(task), [task]);
  const safety = useMemo(() => genSafety(task), [task]);
  const tour = useMemo(() => genTour(task), [task]);
  const shown = stage === 'learn' ? { v: demo.v, state: lState, g: demo.g } : stage === 'demo' ? { v: demo.v, state: demo.state, g: demo.g } : { v, state, g };
  const shownScene = useMemo(() => sceneFromState(shown.state), [shown.state]);
  const camMode = useLabView((x) => x.mode);
  useLabView((x) => x.held);
  useEffect(() => () => useGenBench.setState(BENCH_IDLE), []);
  useBenchEffects(shown.state.log);

  // ---- guidance
  const steps = useMemo(() => (guided ? genGuideSteps(v, state, scene, camMode) : []), [guided, v, state, scene, camMode]);
  useNewLogEntries(state.log, stage, (fresh) => {
    if (!guided || !fresh.length) return;
    let found = null;
    for (const e of fresh) found = genCorrection(e.a, state, v) ?? found;
    if (found) kit.correct(found);
  });

  if (import.meta.env.DEV) Object.assign(window, { __lab3dState: attemptState, __lab3dShown: shown.state, __lab3dStage: stage, __genV: v });
  const ctx: GenCtx = { g, s: state, scene, open: (w) => (useLabView.getState().set({ selected: null }), kit.setSheet(w)) };
  const shownCtx: GenCtx = { g: shown.g, s: shown.state, scene: shownScene, open: ctx.open };
  const onCarry = useCallback(
    (id: string) => {
      g.note(`collect:${id}`);
      notify(`${GEN_APPARATUS_LABEL[id as GenApparatusId]} is on your bench.`, 'success', 1500);
    },
    [g],
  );
  const canRead = true;
  const focusOf = FOCUS_OF[task];
  const debriefView = (c: CriterionScore) => (c.id === 'procedure' ? { mode: 'bench' as const, focus: focusOf } : { mode: 'bench' as const, focus: 'bench', notebook: true });
  const flat = 'border-0 p-0 shadow-none sm:p-0';
  const notebook = (
    <div className="space-y-4">
      <GenNotebook state={state} v={v} readOnly={readOnly} update={g.update} book className={flat} />
      <Written state={state} readOnly={readOnly} update={g.update} className={flat} />
    </div>
  );
  const look = () => (useLabView.getState().set({ mode: 'read', selected: null }), kit.setSheet(null));

  return (
    <LabShell
      kit={kit}
      title="Biology lab"
      heading={`Biology laboratory — ${GEN_TASK_TITLE[task].toLowerCase()}`}
      intro={{
        short: task === 'DISCRETE' ? 'Coat on; survey your class for tongue rolling and read their blood groups from the health cards.' : task === 'CROSS' ? 'Coat on; model a Tt × Tt cross with red and white beads, 100 draws.' : task === 'FOOD' ? 'Coat on; survey the field notes, then build food chains, a web and pyramids.' : 'Coat on; measure the height and hand span of your class and draw a histogram.',
        steps:
          task === 'DISCRETE'
            ? ['Put on your lab coat (hooks by the door).', 'Collect the mirror, health cards, survey sheet, protractor and graph paper.', 'By number; three attempts at rolling for anyone who cannot at first.', 'Read every health card; tallies, %, pie and bar charts.']
            : task === 'CROSS'
              ? ['Put on your lab coat (hooks by the door).', 'Collect the two beakers, the beads, the tray and the tally sheet.', '50 red + 50 white in each; draw blind; return and shake.', '100 draws; ratio x : 1; compare with the class.']
              : task === 'FOOD'
                ? ['Put on your lab coat (hooks by the door).', 'Collect the field notes, sweep net, hand lens, gloves, chart and graph paper.', 'Gloves on; survey all seven spots.', 'Chains, web, trophic levels, pyramids to scale, efficiency.']
                : ['Put on your lab coat (hooks by the door).', 'Collect the height board, set square, ruler and graph paper.', 'Shoes off, set square, eye level; hand spans with fingers spread.', 'Equal classes, histogram, mean, modal class, range.'],
      }}
      readingStatus={task === 'DISCRETE' ? 'surveying the class' : task === 'CROSS' ? 'drawing beads' : task === 'FOOD' ? 'reading the field notes' : 'measuring the class'}
      scene={
        <>
          <GenLabScene v={shown.v} state={shown.state} scene={shownScene} guided={guided || stage === 'learn'} onSlow={kit.onSlow} />
          {!readOnly && work && <GenDrags ctx={ctx} />}
        </>
      }
      endsAt={endsAt}
      onHandIn={onHandIn}
      onUse2d={onUse2d}
      attemptId={attemptId}
      steps={steps}
      hint={practice && !guided ? genHint3d(ctx, nextHint(v, state)) : null}
      objectPanel={(id) => (work ? genObjectPanel(id, ctx) : null)}
      explain={genExplainer}
      task={
        <>
          <TaskText v={v} />
          {!readOnly && !practicalId && stage === 'try' && !started && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {GEN_TASKS.map((t) => (
                <Button key={t} size="sm" variant={task === t ? 'brand' : 'outline'} onClick={() => gAttempt.chooseTask(t)}>
                  {GEN_TASK_TITLE[t]}
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
        items: GEN_APPARATUS.map((a) => ({ id: a.id, label: a.label })),
        has: (id) => scene.collected.has(id as GenApparatusId),
        onToggle: (id, take) => g.note(`${take ? 'collect' : 'return'}:${id}`),
        onCarry,
      }}
      modeBar={<ModeBar views={VIEW_BUTTONS[task]} read={{ label: task === 'HEIGHT' ? 'Measure' : task === 'DISCRETE' ? 'Survey' : task === 'CROSS' ? 'Draw' : 'Notes', can: canRead }} onRead={look} />}
      readingPanel={<ReadingPanel ctx={shownCtx} readOnly={readOnly || stage === 'learn' || stage === 'demo'} onBack={() => useLabView.getState().set({ mode: 'bench', focus: focusOf })} />}
      canRead={canRead}
      dragFeedback={(d) => (DRAG_HINT[d.kind] ? <span className="absolute left-1/2 top-24 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1.5 text-[12.5px] font-medium text-white shadow-lg">{DRAG_HINT[d.kind]}</span> : null)}
      learn={learn}
      demo={demo.player}
      demoPanel={demo.panel}
      sandbox={{
        form: (
          <GenSandboxForm
            sandbox={sandbox}
            onStart={(x) => {
              sandbox.start(x);
              kit.goStage('sandbox');
            }}
          />
        ),
        results: <GenSandboxBadge sandbox={sandbox} />,
      }}
      ask={{ suggestions: GEN_ASK[task], extra: stage === 'try' ? undefined : task === 'DISCRETE' ? 'Why are blood groups discontinuous?' : task === 'CROSS' ? 'Why is my ratio not exactly 3 : 1?' : task === 'FOOD' ? 'Why is energy lost at each level?' : 'Why is height continuous?' }}
      tourSteps={tour}
      safety={safety}
      briefed={attemptState.log.some((e) => e.a.startsWith('safety-briefing'))}
      onBriefing={(outcome) => gAttempt.note(`safety-briefing:${outcome}`)}
      missing={bioGeneticsMissing(attemptState, seed)}
      onResetStation={() => useGenBench.setState(BENCH_IDLE)}
      debriefView={debriefView}
    />
  );
}
