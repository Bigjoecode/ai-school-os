import { BarChart3, Briefcase, CalendarCheck, ClipboardCheck, QrCode } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCan } from '@/lib/auth-store';
import { ParentMessageDialog } from './parent-message-dialog';
import { RegisterTab } from './register-tab';
import { ReportsTab } from './reports-tab';
import { StaffTab } from './staff-tab';
import { TodayTab } from './today-tab';

type Tab = 'today' | 'register' | 'reports' | 'staff';
const TABS: Tab[] = ['today', 'register', 'reports', 'staff'];

export default function AttendancePage() {
  const canManage = useCan('attendance.manage');
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab') as Tab | null;
  const tab: Tab = raw && TABS.includes(raw) && (raw !== 'staff' || canManage) ? raw : 'today';
  const date = params.get('date') ?? undefined;
  const classArmId = params.get('class') ?? undefined;
  const termId = params.get('termId') ?? undefined;
  const view = params.get('view') === 'class' ? 'class' : 'school';

  const [draftFor, setDraftFor] = useState<{ id: string; name: string } | null>(null);

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

  return (
    <Page>
      <PageHeader
        title="Attendance"
        description="Daily registers in a few taps, live absence tracking and term-long patterns — for learners and staff."
        actions={
          canManage && (
            <Button asChild variant="outline">
              <Link to="/attendance/kiosk" target="_blank" rel="noopener">
                <QrCode /> Check-in kiosk
              </Link>
            </Button>
          )
        }
      />

      <Tabs value={tab} onValueChange={(t) => patch({ tab: t === 'today' ? undefined : t })}>
        <TabsList aria-label="Attendance sections">
          <TabsTrigger value="today">
            <CalendarCheck /> Today
          </TabsTrigger>
          <TabsTrigger value="register">
            <ClipboardCheck /> Take register
          </TabsTrigger>
          <TabsTrigger value="reports">
            <BarChart3 /> Reports
          </TabsTrigger>
          {canManage && (
            <TabsTrigger value="staff">
              <Briefcase /> Staff
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="today">
          <TodayTab
            date={date}
            onDateChange={(d) => patch({ date: d })}
            onOpenRegister={(id) => patch({ tab: 'register', class: id })}
            onDraftMessage={setDraftFor}
          />
        </TabsContent>
        <TabsContent value="register">
          <RegisterTab classArmId={classArmId} date={date} onChange={(n) => patch({ class: n.classArmId, date: n.date })} />
        </TabsContent>
        <TabsContent value="reports">
          <ReportsTab
            termId={termId}
            onTermChange={(t) => patch({ termId: t })}
            view={view}
            classArmId={classArmId}
            onViewChange={(n) => patch({ view: n.view === 'class' ? 'class' : undefined, class: n.classArmId ?? classArmId })}
          />
        </TabsContent>
        {canManage && (
          <TabsContent value="staff">
            <StaffTab date={date} onDateChange={(d) => patch({ date: d })} />
          </TabsContent>
        )}
      </Tabs>

      {draftFor && (
        <ParentMessageDialog
          open={!!draftFor}
          onOpenChange={(o) => !o && setDraftFor(null)}
          studentId={draftFor.id}
          studentName={draftFor.name}
        />
      )}
    </Page>
  );
}
