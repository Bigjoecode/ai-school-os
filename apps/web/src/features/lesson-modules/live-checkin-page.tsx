import type { CheckInOutcome } from '@aischool/shared';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, Hourglass, Radio } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/lib/api';
import { lk, sendLiveAnswer, useLiveState } from './api';
import { CheckInReview, QuestionForm } from './step-content';

/** A student in class answering the teacher's live check-in on their own phone. Polls every 2 seconds. */
export default function LiveCheckInPage() {
  const { sessionId = '' } = useParams();
  const q = useLiveState(sessionId);
  const qc = useQueryClient();
  const d = q.data;
  const [result, setResult] = useState<CheckInOutcome | null>(null);
  const [busy, setBusy] = useState(false);
  const fresh = result && d?.open && result.attemptId === d.open.attemptId ? result : null;

  return (
    <Page className="max-w-2xl">
      <PageHeader
        eyebrow={
          <Link to="/my-lessons" className="inline-flex items-center gap-1 hover:text-foreground">
            <ArrowLeft className="size-3.5" /> My lessons
          </Link>
        }
        title={d?.moduleTitle ?? 'Class check-in'}
        description={d ? `${d.subject} · live in class` : undefined}
      />
      {q.error && !d ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !d ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : d.status === 'ENDED' ? (
        <Card className="p-6 text-center">
          <CheckCircle2 className="mx-auto mb-2 size-8 text-success" aria-hidden />
          <p className="font-medium">This lesson has finished.</p>
          <p className="text-[13px] text-muted-foreground">Thanks for taking part. You can go over the lesson again in My lessons.</p>
        </Card>
      ) : !d.open ? (
        <Card className="p-6 text-center">
          <Radio className="mx-auto mb-2 size-8 animate-pulse text-danger" aria-hidden />
          <p className="font-medium">You’re in. Keep this page open.</p>
          <p className="text-[13px] text-muted-foreground">The questions appear here when your teacher starts the check-in.</p>
        </Card>
      ) : fresh ? (
        <Card className="space-y-4 p-5">
          <div className="rounded-xl bg-muted/60 p-4">
            <p className="font-display text-3xl font-semibold tabular">{fresh.percent}%</p>
            <p className="text-[13.5px]">
              {fresh.correct} of {fresh.total} right. {fresh.passed ? 'Well done!' : 'Listen carefully as your teacher goes over it.'}
            </p>
          </div>
          <CheckInReview review={fresh.review} />
        </Card>
      ) : d.answered ? (
        <Card className="p-6 text-center">
          <Hourglass className="mx-auto mb-2 size-8 text-muted-foreground" aria-hidden />
          <p className="font-medium">Answers sent: {d.answered.percent}%</p>
          <p className="text-[13px] text-muted-foreground">Wait for your teacher to go through the answers.</p>
        </Card>
      ) : (
        <Card className="p-5">
          <p className="mb-4 font-display text-[17px] font-semibold">{d.open.title}</p>
          <QuestionForm
            key={d.open.attemptId}
            questions={d.open.questions}
            pending={busy}
            submitLabel="Send my answers"
            onSubmit={(answers) => {
              setBusy(true);
              sendLiveAnswer(sessionId, d.open!.attemptId, answers)
                .then((r) => {
                  setResult(r);
                  void qc.invalidateQueries({ queryKey: lk.live(sessionId) });
                })
                .catch((e: unknown) => toast.error(errorMessage(e)))
                .finally(() => setBusy(false));
            }}
          />
        </Card>
      )}
      {d && d.status === 'LIVE' && (
        <p className="mt-3 text-center text-[11.5px] text-muted-foreground">
          <Button variant="link" size="sm" asChild>
            <Link to="/my-lessons">Leave</Link>
          </Button>
        </p>
      )}
    </Page>
  );
}
