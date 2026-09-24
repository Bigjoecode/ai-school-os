import { GENDERS, STUDENT_STATUSES, studentSchema } from '@aischool/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm, type UseFormReturn } from 'react-hook-form';
import type { z } from 'zod';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NONE, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { emptyToUndefined } from '@/lib/forms';
import { toDateInput } from '@/lib/format';
import { titleCase } from '@/lib/utils';
import { armOptions, useStructure } from '../academics/api';
import type { StudentDetail } from './api';

export type StudentFormValues = z.input<typeof studentSchema>;
export type StudentFormOutput = z.output<typeof studentSchema>;
export type StudentForm = UseFormReturn<StudentFormValues, unknown, StudentFormOutput>;

export function studentDefaults(s?: StudentDetail): StudentFormValues {
  if (!s) {
    return { firstName: '', middleName: '', lastName: '', gender: 'FEMALE', status: 'ACTIVE' };
  }
  return {
    firstName: s.firstName,
    middleName: s.middleName ?? '',
    lastName: s.lastName,
    gender: s.gender,
    dateOfBirth: toDateInput(s.dateOfBirth) || undefined,
    admissionNumber: s.admissionNumber ?? '',
    classArmId: s.classArm?.id,
    admittedOn: toDateInput(s.admittedOn) || undefined,
    address: s.address ?? '',
    medicalNotes: s.medicalNotes ?? '',
    status: s.status,
  };
}

export function useStudentForm(defaults: StudentFormValues): StudentForm {
  return useForm<StudentFormValues, unknown, StudentFormOutput>({
    resolver: zodResolver(studentSchema),
    defaultValues: defaults,
  });
}

export function StudentFields({ form, showStatus }: { form: StudentForm; showStatus?: boolean }) {
  const { register, control, formState } = form;
  const e = formState.errors;
  const structure = useStructure();
  const arms = armOptions(structure.data);
  const branches = structure.data?.branches ?? [];
  const dateOpts = { setValueAs: emptyToUndefined };

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="First name" htmlFor="st-first" error={e.firstName?.message}>
        <Input id="st-first" autoComplete="off" invalid={!!e.firstName} {...register('firstName')} />
      </Field>
      <Field label="Last name" htmlFor="st-last" error={e.lastName?.message}>
        <Input id="st-last" autoComplete="off" invalid={!!e.lastName} {...register('lastName')} />
      </Field>
      <Field label="Middle name" htmlFor="st-middle" optional error={e.middleName?.message}>
        <Input id="st-middle" autoComplete="off" {...register('middleName')} />
      </Field>
      <Field label="Gender" htmlFor="st-gender" error={e.gender?.message}>
        <Controller
          control={control}
          name="gender"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id="st-gender" invalid={!!e.gender}>
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                {GENDERS.map((g) => (
                  <SelectItem key={g} value={g}>
                    {titleCase(g)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </Field>
      <Field label="Date of birth" htmlFor="st-dob" optional error={e.dateOfBirth?.message}>
        <Input id="st-dob" type="date" invalid={!!e.dateOfBirth} {...register('dateOfBirth', dateOpts)} />
      </Field>
      <Field label="Admission number" htmlFor="st-adm" optional hint="Leave blank to auto-generate" error={e.admissionNumber?.message}>
        <Input id="st-adm" autoComplete="off" {...register('admissionNumber')} />
      </Field>
      <Field label="Class" htmlFor="st-class" optional error={e.classArmId?.message}>
        <Controller
          control={control}
          name="classArmId"
          render={({ field }) => (
            <Select value={field.value ?? NONE} onValueChange={(v) => field.onChange(v === NONE ? undefined : v)}>
              <SelectTrigger id="st-class" disabled={structure.isLoading}>
                <SelectValue placeholder={structure.isLoading ? 'Loading classes…' : 'Not assigned'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Not assigned</SelectItem>
                {arms.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </Field>
      <Field label="Admitted on" htmlFor="st-admitted" optional error={e.admittedOn?.message}>
        <Input id="st-admitted" type="date" invalid={!!e.admittedOn} {...register('admittedOn', dateOpts)} />
      </Field>
      {branches.length > 1 && (
        <Field label="Branch" htmlFor="st-branch" optional error={e.branchId?.message}>
          <Controller
            control={control}
            name="branchId"
            render={({ field }) => (
              <Select value={field.value ?? NONE} onValueChange={(v) => field.onChange(v === NONE ? undefined : v)}>
                <SelectTrigger id="st-branch">
                  <SelectValue placeholder="Default" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Default</SelectItem>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>
      )}
      {showStatus && (
        <Field label="Status" htmlFor="st-status" error={e.status?.message}>
          <Controller
            control={control}
            name="status"
            render={({ field }) => (
              <Select value={field.value ?? 'ACTIVE'} onValueChange={field.onChange}>
                <SelectTrigger id="st-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STUDENT_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {titleCase(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>
      )}
      <Field label="Home address" htmlFor="st-address" optional className="sm:col-span-2" error={e.address?.message}>
        <Textarea id="st-address" rows={2} className="min-h-[64px]" {...register('address')} />
      </Field>
      <Field label="Medical notes" htmlFor="st-medical" optional className="sm:col-span-2" hint="Allergies, conditions, medication" error={e.medicalNotes?.message}>
        <Textarea id="st-medical" rows={2} className="min-h-[64px]" {...register('medicalNotes')} />
      </Field>
    </div>
  );
}
