import { PRACTICAL_SITTING_OPEN, type PracticalAttemptAssessment, type PracticalSittingLock } from '@aischool/shared';
import { FlaskConical, PlayCircle } from 'lucide-react';
import { createContext, useContext } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ApiError } from '@/lib/api';

/** The practical test being sat in this lab, if any: the 3D lab then stays at the bench (no Learn, Demo or Sandbox, and the lesson isn't fetched). */
export const LabSittingContext = createContext<PracticalAttemptAssessment | null>(null);
export const useLabSitting = () => useContext(LabSittingContext);

/** The refusal the API gives while the student has a practical test running on this practical. */
export function sittingLock(error: unknown): PracticalSittingLock | null {
  return error instanceof ApiError && error.details.code === PRACTICAL_SITTING_OPEN ? (error.details as unknown as PracticalSittingLock) : null;
}

/** Shown instead of a lesson or practice lab while its practical test is running. */
export function SittingLockCard({ lock }: { lock: PracticalSittingLock }) {
  return (
    <Card className="mx-auto mt-6 flex max-w-lg flex-col items-center gap-3 p-8 text-center" role="status">
      <div className="grid size-14 place-items-center rounded-2xl bg-warning-soft text-warning">
        <FlaskConical className="size-7" aria-hidden />
      </div>
      <p className="font-display text-lg font-semibold tracking-tight">Locked during your practical test</p>
      <p className="text-[13.5px] text-muted-foreground">{lock.message}</p>
      <Button asChild>
        <Link to={`/learn/practicals/labs/${lock.attemptId}`}>
          <PlayCircle /> Back to {lock.title}
        </Link>
      </Button>
    </Card>
  );
}
