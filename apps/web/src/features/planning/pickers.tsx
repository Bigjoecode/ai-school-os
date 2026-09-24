import type { AcademicStructure } from '@aischool/shared';
import { NONE, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatDate } from '@/lib/format';

type Structure = AcademicStructure | undefined;

export function sortedLevels(structure: Structure) {
  return [...(structure?.classLevels ?? [])].sort((a, b) => a.order - b.order);
}

export function sortedSubjects(structure: Structure) {
  return [...(structure?.subjects ?? [])].sort((a, b) => a.name.localeCompare(b.name));
}

export interface TermOption {
  id: string;
  name: string;
  order: number;
  label: string;
  sessionId: string;
  sessionName: string;
  sessionIsCurrent: boolean;
  isCurrent: boolean;
  startsOn: string;
  endsOn: string;
}

/** All terms, current session first, then newest sessions. */
export function termOptions(structure: Structure): TermOption[] {
  const sessions = [...(structure?.sessions ?? [])].sort((a, b) => {
    if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
    return b.startsOn.localeCompare(a.startsOn);
  });
  return sessions.flatMap((s) =>
    [...s.terms]
      .sort((a, b) => a.order - b.order)
      .map((t) => ({
        id: t.id,
        name: t.name,
        order: t.order,
        label: `${t.name} · ${s.name}`,
        sessionId: s.id,
        sessionName: s.name,
        sessionIsCurrent: s.isCurrent,
        isCurrent: t.isCurrent,
        startsOn: t.startsOn,
        endsOn: t.endsOn,
      })),
  );
}

export function currentTerm(structure: Structure): TermOption | undefined {
  const terms = termOptions(structure);
  return terms.find((t) => t.isCurrent) ?? terms[0];
}

/** The term with this order in the current session (for "Term 2 → scheme"). */
export function termByOrder(structure: Structure, order: number): TermOption | undefined {
  const terms = termOptions(structure);
  const current = currentTerm(structure);
  return terms.find((t) => t.order === order && t.sessionId === current?.sessionId) ?? terms.find((t) => t.order === order);
}

export function levelOfArm(structure: Structure, armId: string | undefined) {
  if (!armId) return undefined;
  return structure?.classLevels.find((l) => l.arms.some((a) => a.id === armId));
}

export function armsOf(structure: Structure, levelId?: string) {
  return sortedLevels(structure)
    .filter((l) => !levelId || l.id === levelId)
    .flatMap((l) => l.arms.map((a) => ({ id: a.id, label: `${l.name} ${a.name}`, levelId: l.id })));
}

export function termDates(t: { startsOn: string; endsOn: string }) {
  return `${formatDate(t.startsOn, { year: undefined })} – ${formatDate(t.endsOn)}`;
}

// ------------------------------------------------------------------ selects

interface PickerProps {
  id?: string;
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  structure: Structure;
  invalid?: boolean;
  disabled?: boolean;
  /** Include an "All …" option (filters) instead of a required placeholder. */
  allLabel?: string;
  className?: string;
  'aria-label'?: string;
}

function Picker({
  id,
  value,
  onChange,
  invalid,
  disabled,
  allLabel,
  className,
  placeholder,
  options,
  ...rest
}: Omit<PickerProps, 'structure'> & { placeholder: string; options: { id: string; label: string }[] }) {
  return (
    <Select
      value={value ?? (allLabel ? NONE : '')}
      onValueChange={(v) => onChange(v === NONE ? undefined : v)}
      disabled={disabled}
    >
      <SelectTrigger id={id} invalid={invalid} className={className} aria-label={rest['aria-label']}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {allLabel && <SelectItem value={NONE}>{allLabel}</SelectItem>}
        {options.map((o) => (
          <SelectItem key={o.id} value={o.id}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function SubjectSelect({ structure, ...props }: PickerProps) {
  const options = sortedSubjects(structure).map((s) => ({ id: s.id, label: s.name }));
  return <Picker {...props} placeholder={options.length ? 'Select subject' : 'No subjects set up'} options={options} />;
}

export function LevelSelect({ structure, ...props }: PickerProps) {
  const options = sortedLevels(structure).map((l) => ({ id: l.id, label: l.name }));
  return <Picker {...props} placeholder={options.length ? 'Select class' : 'No classes set up'} options={options} />;
}

export function TermSelect({ structure, ...props }: PickerProps) {
  const options = termOptions(structure).map((t) => ({ id: t.id, label: t.isCurrent ? `${t.label} (current)` : t.label }));
  return <Picker {...props} placeholder={options.length ? 'Select term' : 'No terms set up'} options={options} />;
}

export function ArmSelect({ structure, levelId, ...props }: PickerProps & { levelId?: string }) {
  const options = armsOf(structure, levelId);
  return <Picker {...props} placeholder={options.length ? 'Select class' : 'No class arms set up'} options={options} />;
}
