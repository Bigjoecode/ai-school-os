import { BadgePercent, FileStack, LayoutDashboard, Receipt, Settings2, Wallet } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCan } from '@/lib/auth-store';
import type { InvoiceStatusFilter } from './api';
import { DiscountsTab } from './discounts-tab';
import { InvoicesTab, STATUS_FILTERS } from './invoices-tab';
import { OverviewTab } from './overview-tab';
import { FindInvoiceDialog, type PayableInvoice, RecordPaymentDialog, ReminderDialog } from './payment-dialogs';
import { ScheduleTab } from './schedule-tab';
import { FinanceSettingsSheet } from './settings-sheet';
import { FinanceTermSelect, useTermContext } from './ui';

type Tab = 'overview' | 'invoices' | 'schedule' | 'discounts';
const TABS: Tab[] = ['overview', 'invoices', 'schedule', 'discounts'];

export default function FeesPage() {
  const canManage = useCan('finance.manage');
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab') as Tab | null;
  const tab: Tab = raw && TABS.includes(raw) ? raw : 'overview';
  const ctx = useTermContext(params.get('termId') ?? undefined);
  const rawStatus = params.get('status') as InvoiceStatusFilter | null;
  const status = rawStatus && STATUS_FILTERS.some((s) => s.value === rawStatus) ? rawStatus : undefined;
  const page = Math.max(1, Number(params.get('page')) || 1);

  const [reminder, setReminder] = useState<{ id: string; studentName: string } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [paying, setPaying] = useState<PayableInvoice | null>(null);

  const patch = (next: Record<string, string | undefined>) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(next)) {
          if (v) p.set(k, v);
          else p.delete(k);
        }
        return p;
      },
      { replace: true },
    );

  // ⌘K deep links: ?issue=1, ?pay=1, ?settings=1, ?find=1, ?briefing=1
  const issueOpen = params.get('issue') === '1' && canManage;
  useEffect(() => {
    if (params.get('pay') === '1') {
      if (canManage) setFindOpen(true);
      patch({ pay: undefined });
    }
    if (params.get('settings') === '1') {
      setSettingsOpen(true);
      patch({ settings: undefined });
    }
    if (params.get('find') === '1') {
      patch({ find: undefined, tab: 'invoices' });
      window.setTimeout(() => document.querySelector<HTMLInputElement>('input[type="search"]')?.focus(), 150);
    }
    if (params.get('briefing') === '1') {
      patch({ briefing: undefined, tab: undefined });
      window.setTimeout(() => document.getElementById('finance-briefing')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 600);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const setTerm = (t: string | undefined) => patch({ termId: t, page: undefined });

  return (
    <Page>
      <PageHeader
        title="Fees"
        description="Fee schedules, invoices and collections — with secure online payment links for parents."
        actions={
          <>
            {canManage && (
              <Button variant="outline" onClick={() => setSettingsOpen(true)}>
                <Settings2 /> Settings
              </Button>
            )}
            {canManage && (
              <Button onClick={() => setFindOpen(true)}>
                <Wallet /> Record payment
              </Button>
            )}
          </>
        }
      />

      <Tabs value={tab} onValueChange={(t) => patch({ tab: t === 'overview' ? undefined : t, page: undefined })}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <TabsList aria-label="Fees sections">
            <TabsTrigger value="overview">
              <LayoutDashboard /> Overview
            </TabsTrigger>
            <TabsTrigger value="invoices">
              <Receipt /> Invoices
            </TabsTrigger>
            <TabsTrigger value="schedule">
              <FileStack /> Fee schedule
            </TabsTrigger>
            <TabsTrigger value="discounts">
              <BadgePercent /> Discounts
            </TabsTrigger>
          </TabsList>
          {tab === 'overview' && <FinanceTermSelect ctx={ctx} onChange={setTerm} className="sm:w-72" />}
        </div>

        <TabsContent value="overview">
          <OverviewTab
            termId={ctx.canPick ? ctx.termId : params.get('termId') ?? undefined}
            onDraftReminder={setReminder}
            onGoInvoices={(s) => patch({ tab: 'invoices', status: s, page: undefined })}
            onGoSchedule={() => patch({ tab: 'schedule' })}
          />
        </TabsContent>
        <TabsContent value="invoices">
          <InvoicesTab
            ctx={ctx}
            onTermChange={setTerm}
            classArmId={params.get('class') ?? undefined}
            status={status}
            q={params.get('q') ?? ''}
            page={page}
            onChange={(n) => patch(n)}
            onGoSchedule={() => patch({ tab: 'schedule' })}
          />
        </TabsContent>
        <TabsContent value="schedule">
          <ScheduleTab ctx={ctx} onTermChange={setTerm} issueOpen={issueOpen} onIssueOpenChange={(o) => patch({ issue: o ? '1' : undefined })} />
        </TabsContent>
        <TabsContent value="discounts">
          <DiscountsTab ctx={ctx} onTermChange={setTerm} />
        </TabsContent>
      </Tabs>

      {reminder && <ReminderDialog open={!!reminder} onOpenChange={(o) => !o && setReminder(null)} invoiceId={reminder.id} studentName={reminder.studentName} />}
      {canManage && <FinanceSettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} />}
      <FindInvoiceDialog
        open={findOpen}
        onOpenChange={setFindOpen}
        onPick={(inv) => {
          setFindOpen(false);
          setPaying(inv);
        }}
      />
      <RecordPaymentDialog open={!!paying} onOpenChange={(o) => !o && setPaying(null)} invoice={paying} />
    </Page>
  );
}
