import type { LeaveRequestRow } from '@aischool/shared';
import { CalendarDays, CalendarPlus, ChevronRight, FileText, Link2Off, Medal } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useMe } from '@/lib/auth-store';
import { formatDate, greeting } from '@/lib/format';
import { money, schoolToday } from '../finance/ui';
import { useCancelMyLeave, useMyHr } from './api';
import { AwardList, LeaveBalances } from './employee-page';
import { RequestLeaveDialog } from './leave-dialogs';
import { dateRange, daysLabel, LeaveStatusBadge, PayrollStatusBadge } from './ui';

export default function MyHrPage() {
  const me = useMe();
  const q = useMyHr();
  const cancel = useCancelMyLeave();
  const [params, setParams] = useSearchParams();
  const [requestOpen, setRequestOpen] = useState(false);
  const [cancelling, setCancelling] = useState<LeaveRequestRow | null>(null);
  const today = schoolToday();

  // ⌘K deep link: ?request=1
  useEffect(() => {
    if (params.get('request') === '1' && q.data?.staff) {
      setRequestOpen(true);
      const p = new URLSearchParams(params);
      p.delete('request');
      setParams(p, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, q.data]);

  const d = q.data;
  const firstName = d?.staff?.name.split(' ')[0] ?? me?.user.firstName ?? '';
  const canCancel = (l: LeaveRequestRow) => l.status === 'PENDING' || (l.status === 'APPROVED' && l.startDate > today);

  return (
    <Page className="max-w-5xl">
      <PageHeader
        title="My HR"
        eyebrow={`${greeting()}, ${firstName}`}
        description={d?.staff ? `${d.staff.jobTitle}${d.staff.department ? ` · ${d.staff.department}` : ''} · ${d.staff.staffNumber}` : 'Your leave, payslips and awards.'}
        actions={
          d?.staff && (
            <Button onClick={() => setRequestOpen(true)}>
              <CalendarPlus /> Request leave
            </Button>
          )
        }
      />
      {q.error && !d ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !d ? (
        <div className="space-y-5" aria-busy>
          <div className="grid gap-3 sm:grid-cols-3 [&>*]:min-w-0">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-[104px] rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-[240px] rounded-2xl" />
        </div>
      ) : !d.staff ? (
        <Card>
          <EmptyState
            icon={Link2Off}
            title="Your account isn’t linked to a staff record yet"
            description="Once HR links your sign-in to your staff record, you’ll be able to request leave and see your payslips here. Ask your HR manager or school admin to link it."
          />
        </Card>
      ) : (
        <div className="space-y-5">
          {d.leaveBalances.length > 0 ? (
            <section aria-labelledby="balances-title">
              <h2 id="balances-title" className="mb-3 font-display text-[15px] font-semibold tracking-tight">
                Leave left this year
              </h2>
              <LeaveBalances balances={d.leaveBalances} />
            </section>
          ) : null}

          <Card className="overflow-hidden">
            <CardHeader>
              <div>
                <CardTitle>My leave requests</CardTitle>
                <CardDescription>You can cancel a request until it starts.</CardDescription>
              </div>
            </CardHeader>
            {d.leave.length === 0 ? (
              <EmptyState
                compact
                icon={CalendarDays}
                title="No leave requested yet"
                action={
                  <Button variant="outline" size="sm" onClick={() => setRequestOpen(true)}>
                    <CalendarPlus /> Request leave
                  </Button>
                }
              />
            ) : (
              <ul className="divide-y divide-border">
                {d.leave.map((l) => (
                  <li key={l.id} className="flex flex-col gap-2 px-5 py-3.5 sm:flex-row sm:items-center sm:px-6">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[13.5px] font-medium">{l.leaveType.name}</span>
                        <LeaveStatusBadge status={l.status} />
                      </div>
                      <p className="text-[12.5px] text-muted-foreground">
                        {dateRange(l.startDate, l.endDate)} · {daysLabel(l.days)}
                      </p>
                      {l.decisionNote && (
                        <p className="mt-1 text-[12.5px]">
                          <span className="text-muted-foreground">{l.decidedBy ?? 'Approver'}:</span> “{l.decisionNote}”
                        </p>
                      )}
                    </div>
                    {canCancel(l) && (
                      <Button variant="ghost" size="sm" className="self-start sm:self-auto" onClick={() => setCancelling(l)}>
                        Cancel
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <div className="grid gap-5 lg:grid-cols-2 [&>*]:min-w-0">
            <Card className="overflow-hidden">
              <CardHeader>
                <div>
                  <CardTitle>My payslips</CardTitle>
                  <CardDescription>Shown once a month’s payroll is approved</CardDescription>
                </div>
              </CardHeader>
              {d.payslips.length === 0 ? (
                <EmptyState compact icon={FileText} title="No payslips yet" />
              ) : (
                <ul className="divide-y divide-border">
                  {d.payslips.map((p) => (
                    <li key={p.id}>
                      <Link to={`/me/payslips/${p.id}`} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/40 focus-visible:bg-muted/60 focus-visible:outline-none sm:px-6">
                        <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13.5px] font-medium">{p.label}</span>
                          <span className="block text-[12px] text-muted-foreground">{p.paidOn ? `Paid ${formatDate(p.paidOn)}` : 'Approved — payment on its way'}</span>
                        </span>
                        <PayrollStatusBadge status={p.status} className="hidden sm:inline-flex" />
                        <span className="text-[13.5px] font-semibold tabular">{money(p.netKobo, d.currency)}</span>
                        <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card className="overflow-hidden">
              <CardHeader>
                <div>
                  <CardTitle>My awards</CardTitle>
                  <CardDescription>Thank you for your work</CardDescription>
                </div>
              </CardHeader>
              {d.awards.length === 0 ? <EmptyState compact icon={Medal} title="No awards yet" /> : <AwardList awards={d.awards} />}
            </Card>
          </div>
        </div>
      )}

      {d?.staff && <RequestLeaveDialog open={requestOpen} onOpenChange={setRequestOpen} types={d.leaveTypes} balances={d.leaveBalances} />}
      <ConfirmDialog
        open={!!cancelling}
        onOpenChange={(o) => !o && setCancelling(null)}
        title="Cancel this leave request?"
        description={cancelling ? `${cancelling.leaveType.name} · ${dateRange(cancelling.startDate, cancelling.endDate)}. The days go back to your balance.` : undefined}
        confirmLabel="Cancel request"
        loading={cancel.isPending}
        onConfirm={() => cancelling && cancel.mutate(cancelling.id, { onSuccess: () => setCancelling(null) })}
      />
    </Page>
  );
}
