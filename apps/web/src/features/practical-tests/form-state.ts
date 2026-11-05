import type { CbtShowResults, PracticalAssessmentKind, PracticalAssessmentSummary } from '@aischool/shared';

/** ISO → value for <input type="datetime-local"> in the device's time zone. */
export function toLocalInput(iso: string | Date) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : '');

/** The next round quarter hour. */
export function nextSlot(addMinutes = 0) {
  const d = new Date(Date.now() + addMinutes * 60_000);
  d.setSeconds(0, 0);
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15);
  return d;
}

export interface FormState {
  subjectId: string;
  practicalId: string;
  title: string;
  kind: PracticalAssessmentKind;
  arms: string[];
  opensAt: string;
  closesAt: string;
  duration: string;
  termId: string;
  componentKey: string;
  showResults: CbtShowResults;
  accessCode: string;
}

export function initialForm(e?: PracticalAssessmentSummary): FormState {
  if (e) {
    return {
      subjectId: e.subject.id,
      practicalId: e.practical.id,
      title: e.title,
      kind: e.kind,
      arms: e.classArms.map((a) => a.id),
      opensAt: toLocalInput(e.opensAt),
      closesAt: toLocalInput(e.closesAt),
      duration: String(e.durationMinutes),
      termId: e.term?.id ?? '',
      componentKey: e.component?.key ?? '',
      showResults: e.showResults,
      accessCode: e.accessCode ?? '',
    };
  }
  const start = nextSlot(15);
  return { subjectId: '', practicalId: '', title: '', kind: 'EXAM', arms: [], opensAt: toLocalInput(start), closesAt: toLocalInput(new Date(start.getTime() + 90 * 60_000)), duration: '45', termId: '', componentKey: '', showResults: 'AFTER_CLOSE', accessCode: '' };
}

/** Client-side checks before sending (the server checks again). `started`: the window is history, and a test closed early is shorter than its duration. */
export function formErrors(f: FormState, editing: boolean, started = false): Record<string, string> {
  const errs: Record<string, string> = {};
  if (!editing && !f.subjectId) errs.subjectId = 'Pick a subject';
  if (!editing && !f.practicalId) errs.practicalId = 'Pick a practical';
  if (f.title.trim().length < 3) errs.title = 'Give it a title';
  if (!f.arms.length) errs.classArmIds = 'Pick at least one class';
  if (!f.termId) errs.termId = 'Pick a term';
  if (!f.opensAt) errs.opensAt = 'When does it open?';
  if (!f.closesAt) errs.closesAt = 'When does it close?';
  const mins = Number(f.duration);
  if (!Number.isInteger(mins) || mins < 5 || mins > 240) errs.durationMinutes = 'Whole minutes, 5 to 240';
  if (started) return errs;
  if (f.opensAt && f.closesAt && new Date(f.closesAt) <= new Date(f.opensAt)) errs.closesAt = 'Must be after the opening time';
  else if (f.opensAt && f.closesAt && Number.isInteger(mins) && new Date(f.closesAt).getTime() - new Date(f.opensAt).getTime() < mins * 60_000) errs.closesAt = `Leave at least ${mins} minutes`;
  return errs;
}
