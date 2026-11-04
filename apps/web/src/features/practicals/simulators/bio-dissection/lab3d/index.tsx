import { DISSECT_TASKS, DISSECT_TASK_TITLE, type CriterionScore } from '@aischool/shared';
import { useCallback, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { ModeBar } from '../../../lab3d-kit/hud';
import { LabShell, useLabKit, useNewLogEntries } from '../../../lab3d-kit/shell';
import { notify, useLabView } from '../../../lab3d-kit/store';
import { useBioAssistant } from '../../bio-common/lab3d/common';
import type { SimulatorProps } from '../../types';
import { lessonTask, nextHint, useDissect } from '../actions';
import { bioDissectionMissing } from '../missing';
import { EosinNotebook, MicroNotebook, RatNotebook, Written } from '../notebook';
import { TaskText } from '../task-text';
import { BENCH_IDLE, VIEW_BUTTONS, useDissectBench } from './bench';
import { DISSECT_ASK, dissectExplainer, dissectSafety, dissectTour, learnConfig, learnState } from './content';
import { useDissectDemo } from './demo';
import { DRAG_HINT, DissectDrags } from './drag';
import { dissectCorrection, dissectGuideSteps } from './guide';
import { dissectHint3d, dissectObjectPanel, type DissectCtx } from './lab-actions';
import { ReadingPanel } from './reading';
import { DissectSandboxBadge, DissectSandboxForm, useDissectSandbox } from './sandbox';
import { DissectLabScene } from './scene';
import { DISSECT_APPARATUS, DISSECT_APPARATUS_LABEL, sceneFromState, type DissectApparatusId } from './scene-state';

/**
 * The 3D dissection lab: the same experiments as the 2D lab (same state, same
 * actions, same marks) in the biology room with Mrs Okon. EOSIN: a balsam
 * plant in eosin, read with the ruler, sectioned on the tile and examined.
 * RAT: a schematic, respectful dissection on the board. MICROBE: four agar
 * plates, the incubator and the bread slices.
 *
 * Learn → Mrs Okon's demo (her own material) → Try, plus an unmarked sandbox
 * and Ask; timed practicals are Try only.
 */

const FOCUS: Record<string, string> = { EOSIN: 'plant', RAT: 'board', MICROBE: 'plates' };

export default function BioDissectionLab3D(props: SimulatorProps<'bio-dissection'>) {
  useBioAssistant();
  const { seed, mode, state: attemptState, onChange, readOnly, startedAt, endsAt, onHandIn, onUse2d, practicalId, attemptId, result } = props;
  const pAttempt = useDissect({ seed, state: attemptState, onChange, readOnly, startedAt, practicalId });
  const task = attemptState.task ?? lessonTask(practicalId);
  const started = attemptState.log.some((e) => !e.a.startsWith('safety-briefing') && !e.a.startsWith('task:'));
  const sandbox = useDissectSandbox(task, startedAt);
  const kit = useLabKit({ mode, readOnly, practicalId, result, started, onStageChange: () => useDissectBench.setState(BENCH_IDLE) });
  const { stage, work, guided, practice } = kit;
  const demo = useDissectDemo({ studentSeed: seed, task, startedAt, active: stage === 'demo', onFinished: () => kit.markJourney('demo') });
  const p = stage === 'sandbox' ? sandbox.p : pAttempt;
  const state = stage === 'sandbox' ? sandbox.state : attemptState;
  const v = p.v;
  const scene = useMemo(() => sceneFromState(state), [state]);
  const lState = useMemo(() => learnState(task), [task]);
  const learn = useMemo(() => learnConfig(task), [task]);
  const safety = useMemo(() => dissectSafety(task), [task]);
  const tour = useMemo(() => dissectTour(task), [task]);
  const shown = stage === 'learn' ? { v: demo.v, state: lState, p: demo.p } : stage === 'demo' ? { v: demo.v, state: demo.state, p: demo.p } : { v, state, p };
  const shownScene = useMemo(() => sceneFromState(shown.state), [shown.state]);
  const camMode = useLabView((x) => x.mode);
  useLabView((x) => x.held);
  useDissectBench((b) => b.cutAt);
  useDissectBench((b) => b.how);
  useDissectBench((b) => b.plate);
  useEffect(() => () => useDissectBench.setState(BENCH_IDLE), []);

  // ---- guidance
  const steps = useMemo(() => (guided ? dissectGuideSteps(state, scene, camMode) : []), [guided, state, scene, camMode]);
  useNewLogEntries(state.log, stage, (fresh) => {
    if (!guided || !fresh.length) return;
    let found = null;
    for (const e of fresh) found = dissectCorrection(e.a, state, scene) ?? found;
    if (found) kit.correct(found);
  });

  if (import.meta.env.DEV) Object.assign(window, { __lab3dState: attemptState, __lab3dShown: shown.state, __lab3dStage: stage, __dissectV: v, __dissectBench: useDissectBench });
  const ctx: DissectCtx = { p, s: state, scene, open: (w) => (useLabView.getState().set({ selected: null }), kit.setSheet(w)) };
  const shownCtx: DissectCtx = { p: shown.p, s: shown.state, scene: shownScene, open: ctx.open };
  const onCarry = useCallback(
    (id: string) => {
      p.note(`collect:${id}`);
      notify(`${DISSECT_APPARATUS_LABEL[id as DissectApparatusId]} is on your bench.`, 'success', 1500);
    },
    [p],
  );
  const ss = shown.state;
  const canRead = task === 'EOSIN' ? true : task === 'RAT' ? !!ss.rat.pinned : ss.micro.incAt !== null || ss.micro.breadAt !== null || ss.micro.slide;
  const debriefView = (c: CriterionScore) => (c.id === 'procedure' ? { mode: 'bench' as const, focus: FOCUS[task]! } : { mode: 'bench' as const, focus: 'bench', notebook: true });
  const flat = 'border-0 p-0 shadow-none sm:p-0';
  const notebook = (
    <div className="space-y-4">
      {task === 'RAT' ? <RatNotebook v={v} state={state} readOnly={readOnly} update={p.update} book className={flat} /> : task === 'MICROBE' ? <MicroNotebook v={v} state={state} readOnly={readOnly} update={p.update} book className={flat} /> : <EosinNotebook v={v} state={state} readOnly={readOnly} update={p.update} book className={flat} />}
      <Written state={state} readOnly={readOnly} update={p.update} className={flat} />
    </div>
  );
  const look = () => canRead && (useLabView.getState().set({ mode: 'read', selected: null }), kit.setSheet(null));
  const intro = {
    EOSIN: { short: 'Coat on; wash a balsam plant’s roots, stand it in eosin, read the red line, then cut and examine thin sections.', steps: ['Put on your lab coat (hooks by the door).', 'Collect the eosin, bowl, tile, razor, ruler, stopwatch, hand lens and microscope.', 'Wash the roots gently; eosin; a bright, airy place; read the red line every 20 min.', 'Cut thin sections on the tile, examine them; record, draw and shade the xylem.'] },
    RAT: { short: 'Coat and gloves on; pin out the rat, open it carefully, display and measure the gut, and draw it as displayed.', steps: ['Put on your lab coat (hooks by the door), then gloves.', 'Collect the dissecting kit, ruler, thread, wash bottle and disinfectant.', 'Pin ventral side up; lift the skin and cut the midline; open the body wall.', 'Seeker: display the gut; measure; label the drawing; disinfect.'] },
    MICROBE: { short: 'Coat on; four agar plates (control, air, fingers), taped and incubated; bread under different conditions.', steps: ['Put on your lab coat (hooks by the door).', 'Collect the plates, marker, tape, incubator, bread, bags, disinfectant, lens and microscope.', 'Label the base; air 20 min; unwashed, soap, washed; tape, invert, 30 °C.', 'Bread A/B/C bagged; after 3 days count through the lids; never open a plate.'] },
  }[task];

  return (
    <LabShell
      kit={kit}
      title="Biology lab"
      heading={`Biology laboratory — ${DISSECT_TASK_TITLE[task].toLowerCase()}`}
      intro={intro}
      readingStatus={task === 'EOSIN' ? 'looking at the plant' : task === 'RAT' ? 'looking at the dissection' : 'looking at the plates'}
      scene={
        <>
          <DissectLabScene v={shown.v} state={shown.state} scene={shownScene} seed={shown.v.seed} guided={guided || stage === 'learn'} onSlow={kit.onSlow} />
          {!readOnly && work && <DissectDrags ctx={ctx} />}
        </>
      }
      endsAt={endsAt}
      onHandIn={onHandIn}
      onUse2d={onUse2d}
      attemptId={attemptId}
      steps={steps}
      hint={practice && !guided ? dissectHint3d(ctx, nextHint(v, state)) : null}
      objectPanel={(id) => (work ? dissectObjectPanel(id, ctx) : null)}
      explain={dissectExplainer}
      task={
        <>
          <TaskText v={v} />
          {!readOnly && !practicalId && stage === 'try' && !started && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {DISSECT_TASKS.map((t) => (
                <Button key={t} size="sm" variant={task === t ? 'brand' : 'outline'} onClick={() => pAttempt.chooseTask(t)}>
                  {DISSECT_TASK_TITLE[t]}
                </Button>
              ))}
            </div>
          )}
          <p className="mt-4 text-[12.5px] font-semibold">Safety</p>
          <p className="text-[13px] text-muted-foreground">
            Lab coat: {scene.coat ? 'on' : 'not on'}
            {task === 'RAT' ? ` · Gloves: ${state.rat.gloves ? 'on' : 'not on'}` : ''} · Hands washed at the end: {scene.washedAtEnd ? 'yes' : 'not yet'}
          </p>
        </>
      }
      notebook={notebook}
      cupboard={{
        blurb: 'Take what you need to your bench — or drag things from the cupboard onto the tray.',
        items: DISSECT_APPARATUS.map((a) => ({ id: a.id, label: a.label })),
        has: (id) => scene.collected.has(id as DissectApparatusId),
        onToggle: (id, take) => p.note(`${take ? 'collect' : 'return'}:${id}`),
        onCarry,
      }}
      modeBar={<ModeBar views={VIEW_BUTTONS[task]} read={{ label: 'Look', can: canRead }} onRead={look} />}
      readingPanel={<ReadingPanel ctx={shownCtx} readOnly={readOnly || stage === 'learn' || stage === 'demo'} onBack={() => useLabView.getState().set({ mode: 'bench', focus: FOCUS[task]! })} />}
      canRead={canRead}
      dragFeedback={(d) => (DRAG_HINT[d.kind] ? <span className="absolute left-1/2 top-24 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1.5 text-[12.5px] font-medium text-white shadow-lg">{DRAG_HINT[d.kind]}</span> : null)}
      learn={learn}
      demo={demo.player}
      demoPanel={demo.panel}
      sandbox={{
        form: (
          <DissectSandboxForm
            sandbox={sandbox}
            onStart={(x) => {
              sandbox.start(x);
              kit.goStage('sandbox');
            }}
          />
        ),
        results: <DissectSandboxBadge sandbox={sandbox} />,
      }}
      ask={{ suggestions: DISSECT_ASK[task], extra: stage === 'try' ? undefined : task === 'EOSIN' ? 'Why does the dye not stain the phloem?' : task === 'RAT' ? 'What does the caecum do in a rat?' : 'Why are fungal colonies fluffy?' }}
      tourSteps={tour}
      safety={safety}
      briefed={attemptState.log.some((e) => e.a.startsWith('safety-briefing'))}
      onBriefing={(outcome) => pAttempt.note(`safety-briefing:${outcome}`)}
      missing={bioDissectionMissing(attemptState, seed)}
      onResetStation={() => useDissectBench.setState(BENCH_IDLE)}
      debriefView={debriefView}
    />
  );
}
