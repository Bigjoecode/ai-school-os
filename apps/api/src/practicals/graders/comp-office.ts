import { COMP_OFFICE, coAiText, coChecks, coCritMarks, coDefOf, coTaskTitle, compOfficeVariant, type CompOfficeState } from '@aischool/shared';
import { score } from './helpers';
import type { AiItem, GraderOutput, SimulatorGrader } from './types';

const crit = (id: string) => COMP_OFFICE.rubric.find((c) => c.id === id)!;

/**
 * Marks a computer-room practical from the work itself: formulas are
 * re-evaluated (and again with changed data, so typed-in results fail),
 * queries are re-run against the database, folders are walked, and the
 * answers are compared with this attempt's data. Precautions and the
 * explanation go to AI.
 */
export const compOfficeGrader: SimulatorGrader<'comp-office'> = {
  id: 'comp-office',
  grade(state: CompOfficeState, seed: number): GraderOutput {
    const task = state.task;
    if (!task) {
      const none = (id: string) => score(crit(id), 0, ['The practical was not started.']);
      return {
        auto: ['procedure', 'product', 'calculation'].map(none),
        ai: ['precautions', 'explanation'].map((id): AiItem => ({ criterionId: id, question: crit(id).guide, answer: '', keywords: [['precaution']], need: 1 })),
        solution: [],
        facts: ['The practical was not started.'],
      };
    }
    const v = compOfficeVariant(seed, task);
    const checks = coChecks(v, state);
    const notes = (id: 'procedure' | 'product' | 'calculation') =>
      checks
        .filter((c) => c.crit === id && !c.done)
        .slice(0, 6)
        .map((c) => (id === 'calculation' ? `${c.label}: ${String(v.answers.find((a) => `a:${a.id}` === c.id)?.value ?? '')}.` : `Not done: ${c.label}.`));
    const auto = (['procedure', 'product', 'calculation'] as const).map((id) => score(crit(id), coCritMarks(checks, id, crit(id).marks), notes(id)));
    const { prec, explain } = coAiText(task);
    const ai: AiItem[] = [
      { criterionId: 'precautions', question: 'State two precautions you took in this practical.', answer: state.written.precautions.trim(), guide: `2 marks: one for each correct precaution. ${prec.guide} A vague statement (“be careful”) earns nothing.`, keywords: prec.kw, need: 2 },
      { criterionId: 'explanation', question: explain.q, answer: state.written.explain.trim(), guide: explain.guide, keywords: explain.kw, need: explain.need },
    ];
    const solution = [
      `Task: ${coTaskTitle(task)}.`,
      ...coDefOf(task).brief(v.data),
      `Answers for this attempt: ${v.answers.map((a) => `${a.label} = ${a.value}`).join('; ')}.`,
    ];
    const done = checks.filter((c) => c.done).length;
    return { auto, ai, solution, facts: [`${coTaskTitle(task)}: ${done} of ${checks.length} marked items done.`, `Log entries: ${state.log.length}.`] };
  },
};
