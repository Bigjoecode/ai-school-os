import { ORG_TASKS, ORG_TASK_TITLE, type CriterionScore } from '@aischool/shared';
import { useCallback, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { setAssistant } from '../../../lab3d-kit/assistant-profile';
import { ModeBar } from '../../../lab3d-kit/hud';
import { LabShell, useLabKit, useNewLogEntries } from '../../../lab3d-kit/shell';
import { notify, useLabView } from '../../../lab3d-kit/store';
import type { SimulatorProps } from '../../types';
import { lessonTask, nextHint, useOrganic } from '../actions';
import { chemOrganicMissing } from '../missing';
import { OrgRecordAll } from '../notebook';
import { TaskText } from '../task-text';
import { BENCH_IDLE, SOAP_VIEW_BUTTONS, TUBE_VIEW_BUTTONS, useOrgBench } from './bench';
import { ORG_ASK, learnConfig, learnState, orgExplainer, orgSafety, orgTour } from './content';
import { useOrgDemo } from './demo';
import { OrgDrags } from './drag';
import { orgCorrection, orgGuideSteps } from './guide';
import { orgHint3d, orgObjectPanel } from './lab-actions';
import { OrgSandboxBadge, OrgSandboxForm, useOrgSandbox } from './sandbox';
import { OrgLabScene } from './scene';
import { ORG_APPARATUS, ORG_APPARATUS_LABEL, orgSceneFromState, type OrgApparatusId } from './scene-state';

/**
 * The 3D organic lab: the same tests as the 2D lab (same state, same actions,
 * same marks) in the kit's chemistry room with Mrs Ada. Functional groups on
 * A–D, sugars and starch on W–Z, proteins on P, Q, R and water, or soap from
 * palm oil: coat and goggles, the cupboard, the water bath (no flames near
 * organic liquids), the reagent shelf, the colours forming in the tube, the
 * soap beaker on its tripod, the balance, and the notebook.
 *
 * Learn → Mrs Ada's demo (her own bench) → Try, plus an unmarked sandbox and
 * Ask; timed practicals are Try only.
 */

export default function ChemOrganicLab3D(props: SimulatorProps<'chem-organic'>) {
  setAssistant({ name: 'Mrs Ada', role: 'lab technician', look: 'ada', pronoun: 'her' });
  const { seed, mode, state: attemptState, onChange, readOnly, startedAt, endsAt, onHandIn, onUse2d, practicalId, attemptId, result } = props;
  const oAttempt = useOrganic({ seed, state: attemptState, onChange, readOnly, startedAt, practicalId });
  const task = attemptState.task ?? lessonTask(practicalId);
  const started = attemptState.log.some((e) => !e.a.startsWith('safety-briefing') && !e.a.startsWith('task:'));
  const sandbox = useOrgSandbox(task, startedAt);
  const kit = useLabKit({ mode, readOnly, practicalId, result, started, onStageChange: () => useOrgBench.setState(BENCH_IDLE) });
  const { stage, work, guided, practice } = kit;
  const demo = useOrgDemo({ studentSeed: seed, task, startedAt, active: stage === 'demo', onFinished: () => kit.markJourney('demo') });
  const o = stage === 'sandbox' ? sandbox.o : oAttempt;
  const state = stage === 'sandbox' ? sandbox.state : attemptState;
  const v = o.v;
  const scene = useMemo(() => orgSceneFromState(state), [state]);
  const lState = useMemo(() => learnState(task), [task]);
  const learn = useMemo(() => learnConfig(task), [task]);
  const safety = useMemo(() => orgSafety(task), [task]);
  const tour = useMemo(() => orgTour(task), [task]);
  const shown = stage === 'learn' ? { v: demo.v, state: lState } : stage === 'demo' ? { v: demo.v, state: demo.state } : { v, state };
  const shownScene = useMemo(() => orgSceneFromState(shown.state), [shown.state]);
  const camMode = useLabView((x) => x.mode);
  const active = useOrgBench((b) => b.active);
  useLabView((x) => x.held);
  const tries = stage === 'try' ? attemptState.tests.length : -1;
  useEffect(() => {
    if (stage === 'learn') useOrgBench.setState({ active: 0, anim: null });
    if (stage === 'try' && useOrgBench.getState().active < 0) useOrgBench.setState({ active: attemptState.tests.length - 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, tries > 0]);
  useEffect(() => () => useOrgBench.setState(BENCH_IDLE), []);

  const steps = useMemo(() => (guided ? orgGuideSteps(v, state, scene, camMode) : []), [guided, v, state, scene, camMode]);
  useNewLogEntries(state.log, stage, (fresh) => {
    if (!guided || !fresh.length) return;
    let found = null;
    for (const e of fresh) found = orgCorrection(e.a, state, scene) ?? found;
    if (found) kit.correct(found);
  });

  if (import.meta.env.DEV) Object.assign(window, { __lab3dState: attemptState, __lab3dShown: shown.state, __lab3dStage: stage, __orgActive: active });
  const ctx = { o, s: state, scene, open: (w: 'notebook' | 'task' | 'cupboard') => (useLabView.getState().set({ selected: null }), kit.setSheet(w)) };
  const onCarry = useCallback(
    (id: string) => {
      o.note(`collect:${id}`);
      notify(`${ORG_APPARATUS_LABEL[id as OrgApparatusId]} is on your bench.`, 'success', 1500);
    },
    [o],
  );
  const setActive = (i: number) => i >= 0 && useOrgBench.setState({ active: i, anim: null });
  const soap = task === 'SOAP';
  const debriefView = (c: CriterionScore) => (c.id === 'procedure' ? { mode: 'bench' as const, focus: soap ? 'beaker' : 'bath' } : { mode: 'bench' as const, focus: 'bench', notebook: true });

  return (
    <LabShell
      kit={kit}
      title="Chemistry lab"
      heading={`Chemistry laboratory — ${ORG_TASK_TITLE[task].toLowerCase()}`}
      intro={{
        short: soap ? 'Coat and goggles on, collect the beaker, tripod, burner, rod, funnel and balance, then make soap from palm oil.' : 'Coat and goggles on, collect test tubes and the water bath, then test each sample.',
        steps: soap
          ? ['Put on your lab coat and goggles (hooks by the door).', 'Collect the beaker, burner with tripod and gauze, glass rod, measuring cylinder, filter funnel and balance.', 'Weigh 10 cm³ of palm oil, add 20 cm³ of NaOH and boil 15–20 minutes, stirring and topping up the water.', 'Salt out with brine, filter, wash, dry and weigh; test the lather. Record and work out the yield.']
          : ['Put on your lab coat and goggles (hooks by the door).', 'Collect test tubes, a holder and the water bath; light the burner.', 'Test each sample with the reagents on your shelf — warm only in the water bath.', 'Record TEST | OBSERVATION | INFERENCE, identify each sample and do the calculation.'],
      }}
      scene={
        <>
          <OrgLabScene v={shown.v} state={shown.state} scene={shownScene} guided={guided || stage === 'learn'} onSlow={kit.onSlow} />
          {!readOnly && work && !soap && <OrgDrags ctx={ctx} />}
        </>
      }
      endsAt={endsAt}
      onHandIn={onHandIn}
      onUse2d={onUse2d}
      attemptId={attemptId}
      steps={steps}
      hint={practice && !guided ? orgHint3d(ctx, nextHint(v, state)) : null}
      objectPanel={(id) => (work ? orgObjectPanel(id, ctx) : null)}
      explain={orgExplainer}
      task={
        <>
          <TaskText v={v} />
          {!readOnly && !practicalId && stage === 'try' && !attemptState.tests.length && !attemptState.soap.length && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {ORG_TASKS.map((t) => (
                <Button key={t} size="sm" variant={task === t ? 'brand' : 'outline'} onClick={() => oAttempt.chooseTask(t)}>
                  {ORG_TASK_TITLE[t]}
                </Button>
              ))}
            </div>
          )}
          <p className="mt-4 text-[12.5px] font-semibold">Safety</p>
          <p className="text-[13px] text-muted-foreground">
            Lab coat: {scene.coat ? 'on' : 'not on'} · Goggles: {scene.goggles ? 'on' : 'not on'} · Burner: {scene.burnerOn ? 'lit' : 'off'}
          </p>
        </>
      }
      notebook={<OrgRecordAll v={v} state={state} readOnly={readOnly} update={o.update} active={active} setActive={setActive} book />}
      cupboard={{
        blurb: 'Take what you need to your bench — or drag things from the cupboard onto the tray.',
        items: ORG_APPARATUS.map((a) => ({ id: a.id, label: a.label })),
        has: (id) => scene.collected.has(id as OrgApparatusId),
        onToggle: (id, take) => o.note(`${take ? 'collect' : 'return'}:${id}`),
        onCarry,
      }}
      modeBar={<ModeBar views={soap ? SOAP_VIEW_BUTTONS : TUBE_VIEW_BUTTONS} />}
      dragFeedback={(d) =>
        d.kind === 'reagentdrag' || d.kind === 'tubedrag' ? (
          <span className="absolute left-1/2 top-24 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1.5 text-[12.5px] font-medium text-white shadow-lg">{d.kind === 'tubedrag' ? 'Drop the tube in the water bath' : 'Drop it on a sample, or on the tube in use'}</span>
        ) : null
      }
      learn={learn}
      demo={demo.player}
      demoPanel={demo.panel}
      sandbox={{
        form: (
          <OrgSandboxForm
            sandbox={sandbox}
            onStart={(ids) => {
              sandbox.start(ids);
              kit.goStage('sandbox');
            }}
          />
        ),
        results: <OrgSandboxBadge sandbox={sandbox} />,
      }}
      ask={{ suggestions: ORG_ASK[task], extra: stage === 'try' ? undefined : soap ? 'Why is soap less soluble in brine?' : 'Why must organic liquids never be heated over a flame?' }}
      tourSteps={tour}
      safety={safety}
      briefed={attemptState.log.some((e) => e.a.startsWith('safety-briefing'))}
      onBriefing={(outcome) => oAttempt.note(`safety-briefing:${outcome}`)}
      missing={chemOrganicMissing(attemptState, seed)}
      onResetStation={() => useOrgBench.setState(BENCH_IDLE)}
      debriefView={debriefView}
    />
  );
}
