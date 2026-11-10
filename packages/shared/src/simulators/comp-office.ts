import type { SimulatorSpec } from '../practicals';
import { ck, coAnswerRight, emptyCompOfficeState, type CoCheck, type CoCrit, type CoDef, type CoTask, type CoVariant, type CompOfficeState } from './comp-office-data';
import { CO_DOC_DEFS } from './comp-office-tasks-doc';
import { CO_DB_DEFS } from './comp-office-tasks-db';
import { CO_DECK_DEFS, CO_FILE_DEFS } from './comp-office-tasks-apps';
import { CO_NET_DEFS } from './comp-office-tasks-net';
import { CO_SHEET_DEFS } from './comp-office-tasks-sheet';

export * from './comp-office-apps';
export * from './comp-office-data';
export * from './comp-office-db';
export * from './comp-office-doc';
export * from './comp-office-formula';
export * from './comp-office-sheet';
export { CO_BROWSER_PARTS, type CoCloudInfo, type CoMailInfo } from './comp-office-tasks-net';
export { coSourceRecords } from './comp-office-tasks-doc';

export const COMP_OFFICE: SimulatorSpec = {
  id: 'comp-office',
  subject: 'Computer Studies',
  title: 'Application software on a simulated computer',
  topicNames: ['Spreadsheet', 'Word Processing', 'Database', 'Database Management System', 'Relational Model', 'Presentation Package', 'Presentation', 'Handling Computer Files', 'Operating System', 'Internet', 'The Internet', 'Internet Access', 'Electronic Mail (E-mail) Services', 'The Art of Information Processing'],
  minutes: 45,
  rubric: [
    { id: 'procedure', label: 'Procedure', marks: 6, how: 'AUTO', guide: 'The application was operated correctly: the right tools in the right order, the steps on the task card carried out (copying formulas, Find and Replace, the spelling check, relationships, slide-show rehearsal, Cut and Paste, a scanned download) and the file saved under the required name and place, previewed before printing.' },
    { id: 'product', label: 'The finished work', marks: 6, how: 'AUTO', guide: 'The finished worksheet, document, database, presentation, folder tree or message is recomputed and inspected: values follow from real formulas (they stay right when the data changes), formatting is as asked, queries return the right records, charts cover the right range.' },
    { id: 'calculation', label: 'Calculation and results', marks: 4, how: 'AUTO', guide: 'The numbers and answers asked for on the task card, worked from this attempt’s data.' },
    { id: 'precautions', label: 'Precautions', marks: 2, how: 'AI', guide: 'Two correct precautions for this practical (1 each).' },
    { id: 'explanation', label: 'Explanation', marks: 2, how: 'AI', guide: 'The question on the task card (2 marks).' },
  ],
};

const DEFS: CoDef[] = [...CO_SHEET_DEFS, ...CO_DOC_DEFS, ...CO_DB_DEFS, ...CO_DECK_DEFS, ...CO_FILE_DEFS, ...CO_NET_DEFS];
const BY_TASK = new Map(DEFS.map((d) => [d.task, d]));
export const coDefOf = (t: CoTask): CoDef => BY_TASK.get(t)!;
export const coTaskTitle = (t: CoTask) => coDefOf(t).title;

export type CompOfficeVariant = CoVariant<unknown>;
export function compOfficeVariant(seed: number, task: CoTask): CompOfficeVariant {
  const def = coDefOf(task);
  const data = def.make(seed);
  return { seed, task, family: def.family, title: def.title, apps: def.apps, brief: def.brief(data), answers: def.answers(data), data, ...def.extra?.(data) };
}
/** A fresh attempt at a task, with its seeded files open. */
export function coStartState(v: CompOfficeVariant): CompOfficeState {
  const base = { ...emptyCompOfficeState(), task: v.task };
  return coDefOf(v.task).start(v.data, base, v);
}
/** Every marked item, for the grader and the guide: the operations and the work, then the answers. */
export function coChecks(v: CompOfficeVariant, s: CompOfficeState): CoCheck[] {
  const out = coDefOf(v.task).checks(v.data, s, v);
  return [...out, ...v.answers.map((a) => ck('calculation', `a:${a.id}`, a.label, coAnswerRight(a, s.answers[a.id])))];
}
/** The ideal attempt, made with the same operations as the apps. */
export function coModelState(v: CompOfficeVariant): CompOfficeState {
  const s = coDefOf(v.task).model(v.data, coStartState(v), v);
  const answers = Object.fromEntries(v.answers.map((a) => [a.id, String(a.value)]));
  return { ...s, answers };
}
/** Marks out of the criterion: its share of the checks done, to the half mark below. */
export function coCritMarks(checks: CoCheck[], crit: CoCrit, marks: number): number {
  const xs = checks.filter((c) => c.crit === crit);
  if (!xs.length) return marks;
  return Math.floor(((xs.filter((c) => c.done).length / xs.length) * marks + 1e-9) * 2) / 2;
}
export const coAiText = (t: CoTask) => ({ prec: coDefOf(t).prec, explain: coDefOf(t).explain });
