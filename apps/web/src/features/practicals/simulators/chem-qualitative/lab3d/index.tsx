import type { CriterionScore } from '@aischool/shared';
import { useCallback, useEffect, useMemo } from 'react';
import { setAssistant } from '../../../lab3d-kit/assistant-profile';
import { ModeBar } from '../../../lab3d-kit/hud';
import { LabShell, useLabKit, useNewLogEntries } from '../../../lab3d-kit/shell';
import { notify, useLabView } from '../../../lab3d-kit/store';
import type { SimulatorProps } from '../../types';
import { nextHint, useQualitative } from '../actions';
import { chemQualitativeMissing } from '../missing';
import { Conclusion, Notebook } from '../notebook';
import { QUAL_VIEW_BUTTONS, useQualBench } from './bench';
import { QUAL_ASK, QUAL_LEARN, QUAL_LEARN_ACTIVE, QUAL_LEARN_STATE, QUAL_SAFETY, QUAL_TOUR, qualExplainer } from './content';
import { useQualDemo } from './demo';
import { qualCorrection, qualGuideSteps } from './guide';
import { qualHint3d, qualObjectPanel } from './lab-actions';
import { QualSandboxBadge, QualSandboxForm, useQualSandbox } from './sandbox';
import { QualLabScene } from './scene';
import { QUAL_APPARATUS, QUAL_APPARATUS_LABEL, qualSceneFromState, type QualApparatusId } from './scene-state';

/**
 * The 3D qualitative-analysis lab: the same analysis as the 2D lab (same
 * state, same actions, same marks) in the kit's chemistry room. The student
 * puts on a coat and goggles, collects test tubes, a holder, a Bunsen burner
 * and the gas-test kit, carries out tests on sample C at their bench — the
 * precipitates, colours, fumes and gas tests form in the tube — handles
 * harmful gases in the fume cupboard, wafts instead of sniffing, and writes
 * the TEST | OBSERVATION | INFERENCE table in the notebook.
 *
 * Same journey as the titration: Learn → Mrs Ada's demo (a different salt) →
 * Try, plus an unmarked sandbox and Ask; timed practicals are Try only.
 */

setAssistant({ name: 'Mrs Ada', role: 'lab technician', look: 'ada', pronoun: 'her' });
const noop = () => undefined;
const CUPBOARD_ITEMS = QUAL_APPARATUS.map((a) => ({ id: a.id, label: a.label }));

export default function ChemQualitativeLab3D(props: SimulatorProps<'chem-qualitative'>) {
  const { seed, mode, state: attemptState, onChange, readOnly, startedAt, endsAt, onHandIn, onUse2d, practicalId, attemptId, result } = props;
  const started = attemptState.log.some((e) => !e.a.startsWith('safety-briefing'));
  const qAttempt = useQualitative({ seed, state: attemptState, onChange, readOnly, startedAt });
  const sandbox = useQualSandbox(startedAt);
  const kit = useLabKit({ mode, readOnly, practicalId, result, started, onStageChange: () => useQualBench.setState({ active: -1, sample: 'SOLID' }) });
  const { stage, work, guided, practice } = kit;
  const demo = useQualDemo({ studentSeed: seed, startedAt, active: stage === 'demo', onFinished: () => kit.markJourney('demo') });
  const q = stage === 'sandbox' ? sandbox.q : qAttempt;
  const state = stage === 'sandbox' ? sandbox.state : attemptState;
  const v = q.v;
  const scene = useMemo(() => qualSceneFromState(state), [state]);
  const shown = stage === 'learn' ? { v: demo.q.v, state: QUAL_LEARN_STATE } : stage === 'demo' ? { v: demo.q.v, state: demo.state } : { v, state };
  const shownScene = useMemo(() => qualSceneFromState(shown.state), [shown.state]);
  const camMode = useLabView((x) => x.mode);
  const active = useQualBench((b) => b.active);
  useLabView((x) => x.held);
  // Back in Try (or on opening): the latest test tube is the one in use.
  const tries = stage === 'try' ? attemptState.tests.length : -1;
  useEffect(() => {
    if (stage === 'learn') useQualBench.setState({ active: QUAL_LEARN_ACTIVE });
    if (stage === 'try' && useQualBench.getState().active < 0) useQualBench.setState({ active: attemptState.tests.length - 1 });
    // Only when the stage changes or the attempt first loads its tests.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, tries > 0]);
  useEffect(() => () => useQualBench.setState({ active: -1, sample: 'SOLID', addedAt: 0 }), []);

  // ---- guidance: steps, and corrections for what was just recorded
  const steps = useMemo(() => (guided ? qualGuideSteps(v, state, scene, camMode) : []), [guided, v, state, scene, camMode]);
  useNewLogEntries(state.log, stage, (fresh) => {
    if (!guided || !fresh.length) return;
    let found = null;
    for (const e of fresh) found = qualCorrection(e.a, state, v, scene) ?? found;
    if (found) kit.correct(found);
  });

  if (import.meta.env.DEV) Object.assign(window, { __lab3dState: attemptState, __lab3dShown: shown.state, __lab3dStage: stage, __qualActive: active });
  const ctx = { q, s: state, scene, open: (w: 'notebook' | 'task' | 'cupboard') => (useLabView.getState().set({ selected: null }), kit.setSheet(w)) };
  const onCarry = useCallback(
    (id: string) => {
      q.note(`collect:${id}`);
      notify(`${QUAL_APPARATUS_LABEL[id as QualApparatusId]} is on your bench.`, 'success', 1500);
    },
    [q],
  );
  const setActive = (i: number) => useQualBench.setState({ active: i });
  const debriefView = (c: CriterionScore) => (c.id === 'tests' ? { mode: 'bench' as const, focus: 'tube' } : { mode: 'bench' as const, focus: 'bench', notebook: true });

  return (
    <LabShell
      kit={kit}
      title="Chemistry lab"
      heading="Chemistry laboratory"
      intro={{
        short: 'Put on your coat and goggles, collect apparatus, then test sample C at your bench.',
        steps: ['Put on your lab coat and goggles (hooks by the door).', 'Collect test tubes, a holder, the Bunsen burner and the gas-test kit from the cupboard.', 'At your bench, test C: dissolve it, add reagents in drops then in excess, heat it, test every gas.', 'Record TEST | OBSERVATION | INFERENCE in your notebook and name the ions.'],
      }}
      scene={<QualLabScene v={shown.v} state={shown.state} scene={shownScene} guided={guided || stage === 'learn'} onSlow={kit.onSlow} />}
      endsAt={endsAt}
      onHandIn={onHandIn}
      onUse2d={onUse2d}
      attemptId={attemptId}
      steps={steps}
      hint={practice && !guided ? qualHint3d(ctx, nextHint(v, state)) : null}
      objectPanel={(id) => (work ? qualObjectPanel(id, ctx) : null)}
      explain={qualExplainer}
      task={
        <>
          <p className="text-[13.5px] leading-relaxed">{v.given}</p>
          <p className="mt-2 text-[13.5px] leading-relaxed">
            Carry out suitable tests on C{v.kind === 'MIXTURE' ? ', the filtrate and the residue' : ' and its solution'}. Test every gas given off. Record each test: what you observed and what you infer. Then
            {v.kind === 'MIXTURE' ? ' name the cation and anion of the soluble salt (filtrate) and of the insoluble salt (residue)' : ' name the cation and the anion in C'}, and write an ionic equation for a confirmatory test.
          </p>
          <p className="mt-4 text-[12.5px] font-semibold">Safety</p>
          <p className="text-[13px] text-muted-foreground">
            Lab coat: {scene.coat ? 'on' : 'not on'} · Goggles: {scene.goggles ? 'on' : 'not on'} · Burner: {scene.burnerOn ? 'lit' : 'off'}
          </p>
          <p className="mt-1 text-[12.5px] text-muted-foreground">Waft gases towards your nose; never smell directly. Tests giving SO₂, H₂S, NO₂ or HCl belong in the fume cupboard.</p>
        </>
      }
      notebook={
        <div className="space-y-4">
          <Notebook v={v} state={state} readOnly={readOnly} update={q.update} active={active} setActive={setActive} book className="border-0 p-0 shadow-none sm:p-0" />
          <Conclusion v={v} state={state} readOnly={readOnly} update={q.update} className="border-0 p-0 shadow-none sm:p-0" />
        </div>
      }
      cupboard={{
        blurb: 'Take what you need for qualitative analysis to your bench — or drag things from the cupboard onto the tray.',
        items: CUPBOARD_ITEMS,
        has: (id) => scene.collected.has(id as QualApparatusId),
        onToggle: (id, take) => q.note(`${take ? 'collect' : 'return'}:${id}`),
        onCarry,
      }}
      modeBar={<ModeBar views={QUAL_VIEW_BUTTONS} />}
      learn={QUAL_LEARN}
      demo={demo.player}
      demoPanel={demo.panel}
      sandbox={{
        form: (
          <QualSandboxForm
            initial={sandbox.salt}
            onStart={(id) => {
              sandbox.start(id);
              kit.goStage('sandbox');
            }}
          />
        ),
        results: <QualSandboxBadge sandbox={sandbox} />,
      }}
      ask={{ suggestions: QUAL_ASK, extra: stage === 'try' ? undefined : 'Why is the gas from heating tested straight away?' }}
      tourSteps={QUAL_TOUR}
      safety={QUAL_SAFETY}
      briefed={attemptState.log.some((e) => e.a.startsWith('safety-briefing'))}
      onBriefing={(outcome) => qAttempt.note(`safety-briefing:${outcome}`)}
      missing={chemQualitativeMissing(attemptState, seed)}
      onResetStation={noop}
      debriefView={debriefView}
    />
  );
}
