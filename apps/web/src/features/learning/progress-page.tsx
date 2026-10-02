import { Brain, Sparkles, Zap } from 'lucide-react';
import { useState } from 'react';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useAddMemory, useForgetMemory, useMastery, useMemories } from './api';
import { AddMemoryForm, MasteryMapView, MemoryList, QuickQuizDialog, SectionTitle } from './components';

export default function ProgressPage() {
  const mastery = useMastery();
  const memories = useMemories();
  const add = useAddMemory();
  const forget = useForgetMemory();
  const [quiz, setQuiz] = useState<{ subject: string; topic: string } | null>(null);

  return (
    <Page className="max-w-6xl">
      <PageHeader
        eyebrow="Learning"
        title="My progress"
        description="How each topic is going. Your official result comes from your school; practice is what you’ve done here with your tutor."
        actions={
          <Button variant="outline" onClick={() => setQuiz({ subject: '', topic: '' })}>
            <Zap /> Quick quiz
          </Button>
        }
      />
      <div className="space-y-8">
        <section aria-label="Mastery map">
          <SectionTitle icon={Sparkles} title="Mastery map" />
          {mastery.error && !mastery.data ? (
            <ErrorState error={mastery.error} onRetry={() => void mastery.refetch()} />
          ) : !mastery.data ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {[0, 1].map((i) => (
                <Skeleton key={i} className="h-64 rounded-2xl" />
              ))}
            </div>
          ) : (
            <MasteryMapView map={mastery.data} onQuiz={(subject, topic) => setQuiz({ subject, topic })} />
          )}
        </section>

        <section aria-label="What my tutor remembers">
          <Card className="p-5">
            <SectionTitle icon={Brain} title="What my tutor remembers" />
            <p className="mb-3 text-[13px] text-muted-foreground">Your tutor uses these to explain things your way. Remove anything that’s wrong, or tell it something new.</p>
            <AddMemoryForm onAdd={(v) => add.mutateAsync(v)} pending={add.isPending} />
            <div className="mt-3">
              {memories.isLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : (
                <MemoryList memories={memories.data ?? []} onForget={(id) => forget.mutate(id)} forgetting={forget.isPending ? (forget.variables ?? null) : null} />
              )}
            </div>
          </Card>
        </section>
      </div>
      <QuickQuizDialog open={!!quiz} onOpenChange={(o) => !o && setQuiz(null)} subject={quiz?.subject} topic={quiz?.topic} />
    </Page>
  );
}
