import { BarChart3, ClipboardList, Settings2, Table2, Trophy } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCan } from '@/lib/auth-store';
import { useStructure } from '../academics/api';
import { useAssessmentSettings } from '../assessment/api';
import { useStoredState } from '../assessment/ui';
import { ArmSelect, currentTerm, SubjectSelect, TermSelect } from '../planning/pickers';
import { AnalysisView } from './analysis';
import { BroadsheetView } from './broadsheet';
import { GradingSettingsSheet } from './grading-settings-sheet';
import { ScoreEntry } from './score-entry';

type Tab = 'scores' | 'broadsheet' | 'analysis';
const TABS: Tab[] = ['scores', 'broadsheet', 'analysis'];

export default function ResultsPage() {
  const canPublish = useCan('results.publish');
  const structure = useStructure();
  const settings = useAssessmentSettings();
  const [params, setParams] = useSearchParams();
  const tab = (TABS.includes(params.get('tab') as Tab) ? params.get('tab') : 'scores') as Tab;

  const [pick, setPick] = useStoredState<{ termId?: string; classArmId?: string; subjectId?: string }>('aischool.results.pick', {});
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Fall back to the current term when nothing (or a stale id) is remembered.
  const terms = structure.data?.sessions.flatMap((s) => s.terms) ?? [];
  const termId = pick.termId && terms.some((t) => t.id === pick.termId) ? pick.termId : currentTerm(structure.data)?.id;
  const { classArmId, subjectId } = pick;

  // Unsaved score-entry guard for in-page changes.
  const dirty = useRef(false);
  const onDirtyChange = useCallback((d: boolean) => {
    dirty.current = d;
  }, []);
  const [pending, setPending] = useState<(() => void) | null>(null);
  const guard = (fn: () => void) => {
    if (dirty.current && tab === 'scores') setPending(() => fn);
    else fn();
  };

  const setTab = (t: string) =>
    guard(() =>
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (t === 'scores') p.delete('tab');
          else p.set('tab', t);
          return p;
        },
        { replace: true },
      ),
    );

  const needsSubject = tab === 'scores';
  const ready = !!termId && !!classArmId && (!needsSubject || !!subjectId);

  return (
    <Page>
      <PageHeader
        className="print:hidden"
        title="Results"
        description="Enter continuous assessment and exam scores, see the whole class at a glance and understand how it’s doing."
        actions={
          canPublish && (
            <Button variant="outline" onClick={() => setSettingsOpen(true)}>
              <Settings2 /> Grading & assessment
            </Button>
          )
        }
      />

      <Card className="mb-5 grid gap-3 p-3 sm:grid-cols-3 print:hidden">
        <TermSelect
          structure={structure.data}
          value={termId}
          onChange={(v) => guard(() => setPick({ ...pick, termId: v }))}
          aria-label="Term"
        />
        <ArmSelect
          structure={structure.data}
          value={classArmId}
          onChange={(v) => guard(() => setPick({ ...pick, classArmId: v }))}
          aria-label="Class"
        />
        <SubjectSelect
          structure={structure.data}
          value={subjectId}
          onChange={(v) => guard(() => setPick({ ...pick, subjectId: v }))}
          disabled={!needsSubject}
          aria-label="Subject"
        />
      </Card>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList aria-label="Results views" className="print:hidden">
          <TabsTrigger value="scores">
            <ClipboardList /> Score entry
          </TabsTrigger>
          <TabsTrigger value="broadsheet">
            <Table2 /> Broadsheet
          </TabsTrigger>
          <TabsTrigger value="analysis">
            <BarChart3 /> Analysis
          </TabsTrigger>
        </TabsList>

        {!ready ? (
          <Card className="mt-6">
            <EmptyState
              icon={Trophy}
              title={needsSubject ? 'Pick a class and subject' : 'Pick a class'}
              description={
                needsSubject
                  ? 'Choose the term, class and subject you teach to start entering marks.'
                  : 'Choose a term and class to see every learner’s results side by side.'
              }
            />
          </Card>
        ) : (
          <>
            <TabsContent value="scores">
              {subjectId && <ScoreEntry classArmId={classArmId!} subjectId={subjectId} termId={termId!} onDirtyChange={onDirtyChange} />}
            </TabsContent>
            <TabsContent value="broadsheet">
              <BroadsheetView classArmId={classArmId!} termId={termId!} scale={settings.gradingScale} />
            </TabsContent>
            <TabsContent value="analysis">
              <AnalysisView classArmId={classArmId!} termId={termId!} scale={settings.gradingScale} />
            </TabsContent>
          </>
        )}
      </Tabs>

      {canPublish && <GradingSettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} />}
      <ConfirmDialog
        open={!!pending}
        onOpenChange={(o) => !o && setPending(null)}
        title="Discard unsaved marks?"
        description="You have marks that haven’t been saved. Switching now will lose them."
        confirmLabel="Discard"
        onConfirm={() => {
          const fn = pending;
          setPending(null);
          dirty.current = false;
          fn?.();
        }}
      />
    </Page>
  );
}
