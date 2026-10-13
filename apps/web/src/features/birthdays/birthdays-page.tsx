import { studentGreetingText, type BirthdayRow } from '@aischool/shared';
import { AlertTriangle, Cake, Download, Eye, Settings, UserRound, Users } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Link } from 'react-router';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { NONE, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/lib/api';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Segmented } from '../operations/ui';
import { downloadBirthdaysCsv, useUpcomingBirthdays } from './api';
import { BirthdayCardView } from './birthday-card';
import { BirthdayLine } from './class-birthdays-card';

type Days = '7' | '30' | '90';

/**
 * Messages → Birthdays: upcoming student and staff birthdays (day and month
 * only), by class, with CSV export, who has no date of birth on record, and
 * a preview of the card students see.
 */
export default function BirthdaysPage() {
  const [days, setDays] = useState<Days>('30');
  const [classArmId, setClassArmId] = useState<string>('');
  const [preview, setPreview] = useState(false);
  const [exporting, setExporting] = useState(false);
  const p = { days: Number(days), classArmId: classArmId || undefined };
  const q = useUpcomingBirthdays(p);
  const d = q.data;

  const exportCsv = async () => {
    setExporting(true);
    try {
      await downloadBirthdaysCsv(p);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setExporting(false);
    }
  };

  return (
    <Page>
      <PageHeader
        eyebrow={
          <Link to="/messages" className="hover:text-foreground">
            Messages
          </Link>
        }
        title="Birthdays"
        description="Upcoming birthdays for students and staff. Lists show the day and month only — never the year or an age."
        actions={
          <>
            <Button variant="outline" onClick={() => setPreview(true)} disabled={!d}>
              <Eye /> Preview student card
            </Button>
            <Button variant="outline" onClick={() => void exportCsv()} disabled={!d || exporting}>
              <Download /> Export CSV
            </Button>
            <Button asChild variant="outline">
              <Link to="/messages/settings">
                <Settings /> Birthday settings
              </Link>
            </Button>
          </>
        }
      />

      {q.error && !d ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <div className="space-y-5">
          <SettingsStrip d={d} />

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Segmented<Days>
              size="sm"
              label="How far ahead"
              value={days}
              onChange={setDays}
              options={[
                { value: '7', label: 'Next 7 days' },
                { value: '30', label: 'Next 30 days' },
                { value: '90', label: 'Next 90 days' },
              ]}
            />
            <Select value={classArmId || NONE} onValueChange={(v) => setClassArmId(v === NONE ? '' : v)}>
              <SelectTrigger aria-label="Class" className="h-9 sm:w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>All classes and staff</SelectItem>
                {(d?.classes ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className={cn('grid gap-5', !classArmId && 'lg:grid-cols-2', q.isPlaceholderData && 'opacity-60')}>
            <ListCard title="Students" icon={<Users className="size-4" aria-hidden />} rows={d?.students} loading={!d} empty="No student birthdays in this period." />
            {!classArmId && <ListCard title="Staff" icon={<UserRound className="size-4" aria-hidden />} rows={d?.staff} loading={!d} empty="No staff birthdays in this period." />}
          </div>

          {d && (d.missing.students > 0 || d.missing.staff > 0) && <MissingCard d={d} />}
        </div>
      )}

      <Dialog open={preview} onOpenChange={setPreview}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>The student’s birthday card</DialogTitle>
            <DialogDescription>
              What a student sees on their dashboard on their birthday{d && !d.settings.greetStudent ? ' once student greetings are turned on' : ''}. Primary 1–3 and early years get the simpler picture card.
            </DialogDescription>
          </DialogHeader>
          {d && (
            <DialogBody className="space-y-4">
              <BirthdayCardView b={{ firstName: 'Ada', school: d.school, message: studentGreetingText(d.settings.greetingTemplate, 'Ada', d.school), young: false, bonusXp: 25 }} preview />
              <BirthdayCardView b={{ firstName: 'Tobi', school: d.school, message: studentGreetingText(d.settings.greetingTemplate, 'Tobi', d.school), young: true, bonusXp: 25 }} preview />
            </DialogBody>
          )}
        </DialogContent>
      </Dialog>
    </Page>
  );
}

function OnOff({ on, label }: { on: boolean; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[12.5px]">
      <span className={cn('size-2 rounded-full', on ? 'bg-success' : 'bg-muted-foreground/40')} aria-hidden />
      {label}: <span className={on ? 'font-medium' : 'text-muted-foreground'}>{on ? 'on' : 'off'}</span>
    </span>
  );
}

function SettingsStrip({ d }: { d: ReturnType<typeof useUpcomingBirthdays>['data'] }) {
  if (!d) return <Skeleton className="h-14 rounded-2xl" />;
  const s = d.settings;
  return (
    <Card className="flex flex-col gap-2.5 p-3.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-5">
      <p className="text-[12.5px] font-medium text-muted-foreground">Automatic greetings</p>
      <OnOff on={s.students} label="Parents on their child’s birthday" />
      <OnOff on={s.greetStudent} label="The student too" />
      <OnOff on={s.staff} label="Staff" />
      <span className="text-[12.5px] text-muted-foreground">{s.students || s.staff ? `Sent at ${s.sendAt}, school time` : 'Off by default — turn on in settings'}</span>
      <Link to="/messages/settings" className="text-[12.5px] font-medium text-brand hover:underline sm:ml-auto">
        Change
      </Link>
    </Card>
  );
}

function ListCard({ title, icon, rows, loading, empty }: { title: string; icon: ReactNode; rows: BirthdayRow[] | undefined; loading: boolean; empty: string }) {
  const today = rows?.filter((r) => r.inDays === 0).length ?? 0;
  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2">
            {icon} {title}
            {rows && <span className="text-[12.5px] font-normal text-muted-foreground tabular">{formatNumber(rows.length)}</span>}
          </CardTitle>
          {today > 0 && <CardDescription>{today} today</CardDescription>}
        </div>
        {today > 0 && (
          <Badge variant="warning">
            <Cake className="size-3" aria-hidden /> Today
          </Badge>
        )}
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-11 rounded-xl" />
            ))}
          </div>
        ) : rows?.length ? (
          <ul className="divide-y divide-border">
            {rows.map((r) => (
              <BirthdayLine key={r.id} r={r} />
            ))}
          </ul>
        ) : (
          <EmptyState compact icon={Cake} title="Nothing coming up" description={empty} />
        )}
      </CardContent>
    </Card>
  );
}

function MissingCard({ d }: { d: NonNullable<ReturnType<typeof useUpcomingBirthdays>['data']> }) {
  const m = d.missing;
  return (
    <Card className="border-warning/30">
      <CardHeader>
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-warning" aria-hidden /> No date of birth on record
          </CardTitle>
          <CardDescription>
            {[m.students && `${formatNumber(m.students)} student${m.students === 1 ? '' : 's'}`, m.staff && `${formatNumber(m.staff)} member${m.staff === 1 ? '' : 's'} of staff`].filter(Boolean).join(' and ')} — their birthdays can’t be shown or greeted. Add the date on their record.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        {m.studentSample.length > 0 && (
          <div>
            <p className="mb-1.5 text-[12px] font-medium text-muted-foreground">Students</p>
            <ul className="space-y-1">
              {m.studentSample.map((s) => (
                <li key={s.id} className="text-[13px]">
                  <Link to={`/students?q=${encodeURIComponent(s.admissionNumber)}`} className="font-medium text-brand hover:underline">
                    {s.name}
                  </Link>
                  {s.detail && <span className="text-muted-foreground"> · {s.detail}</span>}
                </li>
              ))}
            </ul>
            {m.students > m.studentSample.length && (
              <Link to="/students" className="mt-1.5 inline-block text-[12.5px] text-muted-foreground hover:underline">
                and {formatNumber(m.students - m.studentSample.length)} more in Students
              </Link>
            )}
          </div>
        )}
        {m.staffSample.length > 0 && (
          <div>
            <p className="mb-1.5 text-[12px] font-medium text-muted-foreground">Staff</p>
            <ul className="space-y-1">
              {m.staffSample.map((s) => (
                <li key={s.id} className="text-[13px]">
                  <Link to="/staff" className="font-medium text-brand hover:underline">
                    {s.name}
                  </Link>
                  {s.detail && <span className="text-muted-foreground"> · {s.detail}</span>}
                </li>
              ))}
            </ul>
            {m.staff > m.staffSample.length && <p className="mt-1.5 text-[12.5px] text-muted-foreground">and {formatNumber(m.staff - m.staffSample.length)} more</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
