import { DEFAULT_OPERATIONS_SETTINGS, type OperationsSettings, operationsSettingsSchema } from '@aischool/shared';
import { Lock } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { useCan } from '@/lib/auth-store';
import { koboToInput, MoneyInput, parseNaira, useCurrency } from '../finance/ui';
import { useOperationsSettings, useSaveOperationsSettings } from './api';
import { apiFieldErrors, dateInput, FormError, zodErrors } from './ui';

/**
 * Library rules or certificate/ID card settings. Everyone with school.read can
 * see them; only school.manage can change them.
 */
export function OperationsSettingsSheet({
  open,
  onOpenChange,
  section,
  fallback,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  section: 'library' | 'documents';
  /** Settings already in hand (e.g. from the library overview) for users without school.read. */
  fallback?: OperationsSettings;
}) {
  const canManage = useCan('school.manage');
  const q = useOperationsSettings(open);
  const save = useSaveOperationsSettings();
  const currency = useCurrency();
  const base = q.data ?? fallback;
  const [v, setV] = useState({ loanDays: '', studentMax: '', staffMax: '', fine: '', prefix: '', validUntil: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open || !base) return;
    setV({
      loanDays: String(base.libraryLoanDays),
      studentMax: String(base.libraryStudentMaxLoans),
      staffMax: String(base.libraryStaffMaxLoans),
      fine: base.libraryFinePerDayKobo ? koboToInput(base.libraryFinePerDayKobo) : '0',
      prefix: base.certificatePrefix,
      validUntil: base.idCardValidUntil ?? '',
    });
    setErrors({});
  }, [open, base]);

  const set = (p: Partial<typeof v>) => setV((s) => ({ ...s, ...p }));
  const digits = (s: string) => s.replace(/\D/g, '').slice(0, 3);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!base) return;
    const naira = parseNaira(v.fine) ?? 0;
    const parsed = operationsSettingsSchema.safeParse({
      libraryLoanDays: Number(v.loanDays),
      libraryStudentMaxLoans: Number(v.studentMax),
      libraryStaffMaxLoans: Number(v.staffMax),
      libraryFinePerDayKobo: Math.round(naira * 100),
      certificatePrefix: v.prefix,
      idCardValidUntil: v.validUntil || null,
    });
    if (!parsed.success) {
      const errs = zodErrors(parsed.error.issues);
      if (errs.libraryLoanDays) errs.libraryLoanDays = '1–120 days';
      if (errs.libraryStudentMaxLoans) errs.libraryStudentMaxLoans = '1–20 books';
      if (errs.libraryStaffMaxLoans) errs.libraryStaffMaxLoans = '1–50 books';
      setErrors(errs);
      return;
    }
    setErrors({});
    save.mutate(parsed.data, { onSuccess: () => onOpenChange(false), onError: (err) => setErrors(apiFieldErrors(err)) });
  };

  const year = new Date().getFullYear();
  const disabled = !canManage;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle className="font-display text-lg font-semibold tracking-tight">{section === 'library' ? 'Library rules' : 'Certificates & ID cards'}</SheetTitle>
          <SheetDescription className="text-[13px] text-muted-foreground">
            {section === 'library' ? 'How long books go out for, how many each reader may borrow, and overdue fines.' : 'Certificate numbering and how long ID cards stay valid.'}
          </SheetDescription>
        </SheetHeader>
        <SheetBody>
          {!base ? (
            <div className="space-y-3" aria-busy>
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-2/3" />
            </div>
          ) : (
            <form id="ops-settings" onSubmit={submit} noValidate className="grid gap-5">
              {disabled && (
                <p className="flex items-start gap-2 rounded-xl border border-border bg-muted/40 px-3.5 py-2.5 text-[12.5px] text-muted-foreground">
                  <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden /> Only a school admin can change these settings.
                </p>
              )}
              {section === 'library' ? (
                <>
                  <div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
                    <Field label="Loan period (days)" htmlFor="os-days" error={errors.libraryLoanDays} hint="The usual due date for a new loan">
                      <Input id="os-days" inputMode="numeric" value={v.loanDays} onChange={(e) => set({ loanDays: digits(e.target.value) })} disabled={disabled} invalid={!!errors.libraryLoanDays} className="tabular" />
                    </Field>
                    <Field label="Fine per day overdue" htmlFor="os-fine" error={errors.libraryFinePerDayKobo} hint="0 for no fines">
                      <MoneyInput id="os-fine" value={v.fine} onChange={(fine) => set({ fine })} currency={currency} disabled={disabled} invalid={!!errors.libraryFinePerDayKobo} />
                    </Field>
                    <Field label="Books a student may borrow" htmlFor="os-smax" error={errors.libraryStudentMaxLoans}>
                      <Input id="os-smax" inputMode="numeric" value={v.studentMax} onChange={(e) => set({ studentMax: digits(e.target.value) })} disabled={disabled} invalid={!!errors.libraryStudentMaxLoans} className="tabular" />
                    </Field>
                    <Field label="Books staff may borrow" htmlFor="os-tmax" error={errors.libraryStaffMaxLoans}>
                      <Input id="os-tmax" inputMode="numeric" value={v.staffMax} onChange={(e) => set({ staffMax: digits(e.target.value) })} disabled={disabled} invalid={!!errors.libraryStaffMaxLoans} className="tabular" />
                    </Field>
                  </div>
                  <p className="text-[12px] text-muted-foreground">Readers with an overdue book can’t borrow another until it’s back.</p>
                </>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
                  <Field label="Certificate prefix" htmlFor="os-prefix" error={errors.certificatePrefix} hint={`Serials look like ${v.prefix || DEFAULT_OPERATIONS_SETTINGS.certificatePrefix}/${year}/0001`}>
                    <Input
                      id="os-prefix"
                      value={v.prefix}
                      onChange={(e) => set({ prefix: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) })}
                      disabled={disabled}
                      invalid={!!errors.certificatePrefix}
                      className="font-mono"
                    />
                  </Field>
                  <Field label="ID cards valid until" htmlFor="os-valid" optional error={errors.idCardValidUntil} hint="Scanned cards show as expired after this date">
                    <Input id="os-valid" type="date" value={v.validUntil} onChange={(e) => set({ validUntil: e.target.value })} disabled={disabled} className={dateInput} />
                  </Field>
                </div>
              )}
              <FormError message={errors.form} />
            </form>
          )}
        </SheetBody>
        <SheetFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {disabled ? 'Close' : 'Cancel'}
          </Button>
          {!disabled && (
            <Button type="submit" form="ops-settings" loading={save.isPending} disabled={!base}>
              Save settings
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
