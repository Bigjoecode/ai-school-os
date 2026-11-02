import { ECO_TASKS, ECO_TASK_TITLE, type CriterionScore } from '@aischool/shared';
import { useCallback, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { ModeBar } from '../../../lab3d-kit/hud';
import { LabShell, useLabKit, useNewLogEntries } from '../../../lab3d-kit/shell';
import { notify, useLabView } from '../../../lab3d-kit/store';
import { useBioAssistant } from '../../bio-common/lab3d/common';
import type { SimulatorProps } from '../../types';
import { EcoNotebook } from '..';
import { lessonTask, nextHint, useEcology } from '../actions';
import { bioEcologyMissing } from '../missing';
import { Written } from '../notebook';
import { TaskText } from '../task-text';
import { BENCH_IDLE, VIEW_BUTTONS, useEcoBench } from './bench';
import { ECO_ASK, ecoExplainer, ecoSafety, ecoTour, learnConfig, learnState } from './content';
import { useEcoDemo } from './demo';
import { DRAG_HINT, EcoDrags } from './drag';
import { ecoCorrection, ecoGuideSteps } from './guide';
import { ecoHint3d, ecoObjectPanel, type EcoCtx } from './lab-actions';
import { ReadingPanel } from './reading';
import { EcoSandboxBadge, EcoSandboxForm, useEcoSandbox } from './sandbox';
import { EcoLabScene } from './scene';
import { ECO_APPARATUS_LABEL, sceneFromState, shedFor, type EcoApparatusId } from './scene-state';

/**
 * The 3D ecology lab: the same investigations as the 2D lab (same state, same
 * actions, same marks), outdoors on a procedural school field with Mrs Okon —
 * the study plot and its quadrats, the grasshoppers and the sweep net, the
 * weather station, the open field and the shade tree, the pond, the soil pit
 * and a field table of soil apparatus. Learn → Mrs Okon's demo (her own field)
 * → Try, plus an unmarked sandbox and Ask; timed practicals are Try only.
 */

export default function BioEcologyLab3D(props: SimulatorProps<'bio-ecology'>) {
  useBioAssistant();
  const { seed, mode, state: attemptState, onChange, readOnly, startedAt, endsAt, onHandIn, onUse2d, practicalId, attemptId, result } = props;
  const oAttempt = useEcology({ seed, state: attemptState, onChange, readOnly, startedAt, practicalId });
  const task = attemptState.task ?? lessonTask(practicalId);
  const started = attemptState.log.some((e) => !e.a.startsWith('safety-briefing') && !e.a.startsWith('task:'));
  const sandbox = useEcoSandbox(task, startedAt);
  const kit = useLabKit({ mode, readOnly, practicalId, result, started, onStageChange: () => useEcoBench.setState(BENCH_IDLE) });
  const { stage, work, guided, practice } = kit;
  const demo = useEcoDemo({ studentSeed: seed, task, startedAt, active: stage === 'demo', onFinished: () => kit.markJourney('demo') });
  const o = stage === 'sandbox' ? sandbox.o : oAttempt;
  const state = stage === 'sandbox' ? sandbox.state : attemptState;
  const v = o.v;
  const scene = useMemo(() => sceneFromState(state), [state]);
  const lState = useMemo(() => learnState(task), [task]);
  const learn = useMemo(() => learnConfig(task), [task]);
  const safety = useMemo(() => ecoSafety(task), [task]);
  const tour = useMemo(() => ecoTour(task), [task]);
  const shown = stage === 'learn' ? { v: demo.v, state: lState, o: demo.o } : stage === 'demo' ? { v: demo.v, state: demo.state, o: demo.o } : { v, state, o };
  const shownScene = useMemo(() => sceneFromState(shown.state), [shown.state]);
  const camMode = useLabView((x) => x.mode);
  useLabView((x) => x.held);
  useEffect(() => () => useEcoBench.setState(BENCH_IDLE), []);

  const steps = useMemo(() => (guided ? ecoGuideSteps(state, scene, camMode) : []), [guided, state, scene, camMode]);
  useNewLogEntries(state.log, stage, (fresh) => {
    if (!guided || !fresh.length) return;
    let found = null;
    for (const e of fresh) found = ecoCorrection(e.a, state, scene) ?? found;
    if (found) kit.correct(found);
  });

  if (import.meta.env.DEV) Object.assign(window, { __lab3dState: attemptState, __lab3dShown: shown.state, __lab3dStage: stage, __ecoV: v });
  const ctx: EcoCtx = { o, s: state, scene, open: (w) => (useLabView.getState().set({ selected: null }), kit.setSheet(w)) };
  const shownCtx: EcoCtx = { o: shown.o, s: shown.state, scene: shownScene, open: ctx.open };
  const onCarry = useCallback(
    (id: string) => {
      o.note(`collect:${id}`);
      notify(`${ECO_APPARATUS_LABEL[id as EcoApparatusId]} is on your table.`, 'success', 1500);
    },
    [o],
  );
  const canRead = true;
  const backView = task === 'FACTORS' ? ({ STATION: 'station', OPEN: 'open', SHADE: 'shade', POND: 'pond' } as const)[shown.state.fac.at] : task === 'SOIL' ? 'bench' : 'plot';
  const debriefView = (c: CriterionScore) => (c.id === 'procedure' ? { mode: 'bench' as const, focus: task === 'FACTORS' ? 'open' : task === 'SOIL' ? 'rack' : 'plot' } : { mode: 'bench' as const, focus: 'bench', notebook: true });
  const flat = 'border-0 p-0 shadow-none sm:p-0';
  const notebook = (
    <div className="space-y-4">
      <EcoNotebook o={o} state={state} readOnly={readOnly} book className={flat} />
      <Written state={state} readOnly={readOnly} update={o.update} className={flat} />
    </div>
  );
  const look = () => (useLabView.getState().set({ mode: 'read', selected: null }), kit.setSheet(null));

  return (
    <LabShell
      kit={kit}
      title="Biology field work"
      heading={`School field — ${ECO_TASK_TITLE[task].toLowerCase()}`}
      intro={{
        short: task === 'QUADRAT' ? 'Collect the quadrat, tapes and random-number table; peg out the plot and sample it at random.' : task === 'CAPTURE' ? 'Sweep the plot, mark the grasshoppers harmlessly, release them, and recapture a day later.' : task === 'FACTORS' ? 'Read the weather station each morning, then the open field and the canopy at the same time, for three days.' : 'Coat and goggles on; jar, funnels, air test and crucibles for sand, loam and clay.',
        steps:
          task === 'QUADRAT'
            ? ['Put on your lab coat (hooks by the door).', 'Collect the quadrat, tapes, pegs, random-number table and guide from the shed.', 'Peg out the plot; place 10+ quadrats from random numbers.', 'Count each herb and the grass squares in each; work out density, frequency and population.']
            : task === 'CAPTURE'
              ? ['Put on your lab coat (hooks by the door).', 'Collect the sweep net, box, tray, paint and stopwatch from the shed.', 'Sweep, count, mark with a small dot underneath, release where caught.', 'A day later sweep the same way; count n₂ and m; N = n₁ × n₂ ÷ m.']
              : task === 'FACTORS'
                ? ['Put on your lab coat (hooks by the door).', 'Collect the instruments from the shed.', '9 am: Six’s, rain gauge, vane; reset and empty.', 'Open field and canopy at the same time, thermometers shaded; three days; the pond.']
                : ['Put on your lab coat and goggles (hooks by the door).', 'Collect the jars, funnels, cylinders, rod, crucibles, burner, tongs, desiccator, balance, ruler and stopwatch.', 'Jar of loam; three funnels; air tests; crucibles to constant mass.', 'Measure the jar next day; tables, graph, labels, conclusions.'],
      }}
      readingStatus="looking closely"
      scene={
        <>
          <EcoLabScene v={shown.v} state={shown.state} scene={shownScene} guided={guided || stage === 'learn'} onSlow={kit.onSlow} />
          {!readOnly && work && <EcoDrags ctx={ctx} />}
        </>
      }
      endsAt={endsAt}
      onHandIn={onHandIn}
      onUse2d={onUse2d}
      attemptId={attemptId}
      steps={steps}
      hint={practice && !guided ? ecoHint3d(ctx, nextHint(v, state)) : null}
      objectPanel={(id) => (work ? ecoObjectPanel(id, ctx) : null)}
      explain={ecoExplainer}
      task={
        <>
          <TaskText v={v} />
          {!readOnly && !practicalId && stage === 'try' && !started && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {ECO_TASKS.map((t) => (
                <Button key={t} size="sm" variant={task === t ? 'brand' : 'outline'} onClick={() => oAttempt.chooseTask(t)}>
                  {ECO_TASK_TITLE[t]}
                </Button>
              ))}
            </div>
          )}
          <p className="mt-4 text-[12.5px] font-semibold">Safety</p>
          <p className="text-[13px] text-muted-foreground">
            Lab coat: {scene.coat ? 'on' : 'not on'} · Goggles: {scene.goggles ? 'on' : 'not on'} · Hands washed at the end: {scene.washedAtEnd ? 'yes' : 'not yet'}
          </p>
        </>
      }
      notebook={notebook}
      cupboard={{
        blurb: 'Take what you need to your field table — or drag things from the shed onto the tray.',
        items: shedFor(task).map((a) => ({ id: a.id, label: a.label })),
        has: (id) => scene.collected.has(id as EcoApparatusId),
        onToggle: (id, take) => o.note(`${take ? 'collect' : 'return'}:${id}`),
        onCarry,
      }}
      modeBar={<ModeBar views={VIEW_BUTTONS[task]} read={{ label: 'Close-up', can: canRead }} onRead={look} />}
      readingPanel={<ReadingPanel ctx={shownCtx} readOnly={readOnly || stage === 'learn' || stage === 'demo'} onBack={() => useLabView.getState().set({ mode: 'bench', focus: backView, spot: null })} />}
      canRead={canRead}
      dragFeedback={(d) => (DRAG_HINT[d.kind] ? <span className="absolute left-1/2 top-24 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1.5 text-[12.5px] font-medium text-white shadow-lg">{DRAG_HINT[d.kind]}</span> : null)}
      learn={learn}
      demo={demo.player}
      demoPanel={demo.panel}
      sandbox={{
        form: (
          <EcoSandboxForm
            sandbox={sandbox}
            onStart={(x) => {
              sandbox.start(x);
              kit.goStage('sandbox');
            }}
          />
        ),
        results: <EcoSandboxBadge sandbox={sandbox} />,
      }}
      ask={{ suggestions: ECO_ASK[task], extra: stage === 'try' ? undefined : task === 'QUADRAT' ? 'Why do plants grow in clumps?' : task === 'CAPTURE' ? 'Why does a bright mark make N too big?' : task === 'FACTORS' ? 'Why does a sunny thermometer read high?' : 'Why does clay hold so much water?' }}
      tourSteps={tour}
      safety={safety}
      briefed={attemptState.log.some((e) => e.a.startsWith('safety-briefing'))}
      onBriefing={(outcome) => oAttempt.note(`safety-briefing:${outcome}`)}
      missing={bioEcologyMissing(attemptState, seed)}
      onResetStation={() => useEcoBench.setState(BENCH_IDLE)}
      debriefView={debriefView}
    />
  );
}
