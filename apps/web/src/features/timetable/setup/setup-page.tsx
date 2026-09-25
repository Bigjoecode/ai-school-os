import { CalendarClock, Clock, DoorOpen, Table2, UserX } from 'lucide-react';
import type * as React from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { AiSparkle } from '@/components/ai/ai-sparkle';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCan } from '@/lib/auth-store';
import { BackLink } from '../../planning/ui';
import { useTimetableSetup } from '../api';
import { TimetableAssistant } from '../assistant';
import { AvailabilityEditor } from './availability-editor';
import { BellEditor } from './bell-editor';
import { LoadsMatrix } from './loads-matrix';
import { RoomsTab } from './rooms-tab';

type Tab = 'day' | 'loads' | 'availability' | 'rooms' | 'assistant';

export default function TimetableSetupPage() {
  const canManage = useCan('timetable.manage');
  const canAi = useCan('ai.use');
  const setup = useTimetableSetup();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tabs: Tab[] = ['day', 'loads', 'availability', 'rooms', ...(canManage && canAi ? (['assistant'] as Tab[]) : [])];
  const raw = params.get('tab') as Tab | null;
  const tab: Tab = raw && tabs.includes(raw) ? raw : 'day';

  const setTab = (t: string) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (t === 'day') p.delete('tab');
        else p.set('tab', t);
        return p;
      },
      { replace: true },
    );

  const s = setup.data;
  const lessons = s?.loads.reduce((n, l) => n + l.periodsPerWeek, 0) ?? 0;

  return (
    <Page>
      <div className="mb-3">
        <BackLink to="/timetable">Timetable</BackLink>
      </div>
      <PageHeader
        title="Timetable setup"
        description="The school day, each class’s weekly periods, when teachers can teach and which rooms exist — everything the solver works from."
        actions={
          <Button asChild variant="outline">
            <Link to="/timetable">
              <CalendarClock /> Open timetable
            </Link>
          </Button>
        }
      />

      {s && (
        <div className="mb-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <Stat label="Lesson slots / class" value={s.slotsPerWeek} sub={`${s.bellSchedule.days.length} days a week`} />
          <Stat label="Lessons to place" value={lessons.toLocaleString()} sub={`${s.loads.filter((l) => l.periodsPerWeek > 0).length} class subjects`} />
          <Stat label="Teachers" value={s.teachers.length} sub={`${s.teachers.filter((t) => t.unavailable.length).length} with blocked periods`} />
          <Stat label="Rooms" value={s.rooms.filter((r) => r.isActive).length} sub={`${s.rooms.filter((r) => r.kind !== 'CLASSROOM').length} specialist`} />
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList aria-label="Timetable setup">
          <TabsTrigger value="day">
            <Clock /> School day
          </TabsTrigger>
          <TabsTrigger value="loads">
            <Table2 /> Subjects & teachers
          </TabsTrigger>
          <TabsTrigger value="availability">
            <UserX /> Teacher availability
          </TabsTrigger>
          <TabsTrigger value="rooms">
            <DoorOpen /> Rooms
          </TabsTrigger>
          {tabs.includes('assistant') && (
            <TabsTrigger value="assistant">
              <AiSparkle className="size-3.5" animated={false} /> AI assistant
            </TabsTrigger>
          )}
        </TabsList>

        {setup.isLoading ? (
          <div className="mt-6 space-y-3" aria-busy>
            <Skeleton className="h-24 w-full rounded-2xl" />
            <Skeleton className="h-72 w-full rounded-2xl" />
          </div>
        ) : !s ? (
          <Card className="mt-6">
            <ErrorState error={setup.error} onRetry={() => void setup.refetch()} />
          </Card>
        ) : (
          <>
            <TabsContent value="day">
              <BellEditor setup={s} canManage={canManage} />
            </TabsContent>
            <TabsContent value="loads">
              <LoadsMatrix setup={s} canManage={canManage} />
            </TabsContent>
            <TabsContent value="availability">
              <AvailabilityEditor setup={s} canManage={canManage} />
            </TabsContent>
            <TabsContent value="rooms">
              <RoomsTab setup={s} canManage={canManage} />
            </TabsContent>
            {tabs.includes('assistant') && (
              <TabsContent value="assistant">
                <div className="mx-auto max-w-3xl">
                  <TimetableAssistant rebuildLabel="Go to the timetable to rebuild" onRebuild={() => navigate('/timetable')} />
                </div>
              </TabsContent>
            )}
          </>
        )}
      </Tabs>
    </Page>
  );
}

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-card px-3.5 py-2.5">
      <p className="truncate text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-display text-lg font-semibold tabular">{value}</p>
      <p className="truncate text-[11.5px] text-muted-foreground">{sub}</p>
    </div>
  );
}
