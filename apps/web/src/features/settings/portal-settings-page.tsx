import { DEFAULT_PORTAL_SETTINGS, type PortalSettings } from '@aischool/shared';
import { Banknote, CalendarCheck, CalendarDays, Download, Lock, Save, Trophy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useCan } from '@/lib/auth-store';
import { cn } from '@/lib/utils';
import { usePortalSettings, useSavePortalSettings } from '../portal/api';
import { LearningUpdatesSettings } from './learning-updates-settings';
import { GamesSettingsCard } from '../games/widgets';

type BoolKey = 'showAttendance' | 'showResults' | 'showCalendar' | 'showDownloads';

const SECTIONS: { key: BoolKey; label: string; note: string; icon: typeof Trophy }[] = [
  { key: 'showAttendance', label: 'Attendance', note: 'Attendance rate, every marked day and any notes from the register.', icon: CalendarCheck },
  { key: 'showResults', label: 'Results and report cards', note: 'Published report cards only. Drafts are never shown.', icon: Trophy },
  { key: 'showCalendar', label: 'Exams and calendar', note: 'Upcoming exams, holidays and events for the child’s class.', icon: CalendarDays },
  { key: 'showDownloads', label: 'Downloads', note: 'Documents from Website → Downloads shared with families.', icon: Download },
];

const DEFAULT_MESSAGE = 'Results are available once school fees are fully paid. Please contact the school bursar.';

export default function PortalSettingsPage() {
  const canManage = useCan('school.manage');
  const q = usePortalSettings();
  const save = useSavePortalSettings();
  const canFinance = useCan('finance.manage');
  const [v, setV] = useState<PortalSettings>(DEFAULT_PORTAL_SETTINGS);
  useEffect(() => {
    if (q.data) setV(q.data);
  }, [q.data]);

  if (q.error && !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Skeleton className="h-[480px] rounded-2xl" />;

  const dirty = JSON.stringify(v) !== JSON.stringify(q.data);
  const set = (patch: Partial<PortalSettings>) => setV((x) => ({ ...x, ...patch }));

  return (
    <div className="max-w-3xl space-y-6">
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate({ ...v, withholdMessage: v.withholdMessage?.trim() || null });
      }}
    >
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Parent & student portal</CardTitle>
            <CardDescription>
              Choose what parents and students see under “My school” when they sign in.
              {!canManage && ' Only admins can change these.'}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <fieldset disabled={!canManage || save.isPending} className="space-y-2.5">
            <legend className="sr-only">Sections families can see</legend>
            {SECTIONS.map((s) => (
              <label key={s.key} className={cn('flex items-center gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3', canManage && 'cursor-pointer')}>
                <s.icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-medium">{s.label}</span>
                  <span className="block text-[12px] text-muted-foreground">{s.note}</span>
                </span>
                <Switch checked={v[s.key]} onCheckedChange={(on) => set({ [s.key]: on })} aria-label={`Show ${s.label.toLowerCase()}`} />
              </label>
            ))}

            <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
              <label className={cn('flex items-center gap-3', canManage && 'cursor-pointer')}>
                <Banknote className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-medium">Fees and online payment (parents)</span>
                  <span className="block text-[12px] text-muted-foreground">Invoices, what’s owed, payment history and printable receipts. Students never see fees.</span>
                </span>
                <Switch checked={v.showFees} onCheckedChange={(on) => set({ showFees: on })} aria-label="Show fees and online payment to parents" />
              </label>
              <p className="mt-2 pl-7 text-[12px] text-muted-foreground">
                Pay now needs Paystack connected in{' '}
                {canFinance ? (
                  <Link to="/fees?settings=1" className="font-medium text-brand hover:underline">
                    Finance settings
                  </Link>
                ) : (
                  'Finance settings'
                )}
                . Without it, parents see your bank details and are asked to quote the invoice number.
              </p>
            </div>

            <div className={cn('rounded-xl border border-border px-4 py-3', !v.showResults && 'opacity-60')}>
              <label className={cn('flex items-center gap-3', canManage && v.showResults && 'cursor-pointer')}>
                <Lock className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-medium">Hold back results while fees are owed</span>
                  <span className="block text-[12px] text-muted-foreground">Families who owe fees see the term listed with your message instead of the report card.</span>
                </span>
                <Switch
                  checked={v.withholdResultsWhenOwing}
                  disabled={!v.showResults}
                  onCheckedChange={(on) => set({ withholdResultsWhenOwing: on })}
                  aria-label="Hold back results while fees are owed"
                />
              </label>
              {v.withholdResultsWhenOwing && v.showResults && (
                <Field label="Message families see" htmlFor="portal-withhold" optional className="mt-3">
                  <Textarea
                    id="portal-withhold"
                    rows={3}
                    maxLength={300}
                    placeholder={DEFAULT_MESSAGE}
                    value={v.withholdMessage ?? ''}
                    onChange={(e) => set({ withholdMessage: e.target.value })}
                  />
                </Field>
              )}
            </div>
          </fieldset>
        </CardContent>
        {canManage && (
          <CardFooter className="justify-end">
            <Button type="button" variant="ghost" disabled={!dirty || save.isPending} onClick={() => setV(q.data)}>
              Discard
            </Button>
            <Button type="submit" loading={save.isPending} disabled={!dirty}>
              <Save /> Save changes
            </Button>
          </CardFooter>
        )}
      </Card>
    </form>
    <LearningUpdatesSettings />
    <GamesSettingsCard />
    </div>
  );
}
