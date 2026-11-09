import type { GenDemoView, GenPaper, GenPracticalState } from '@aischool/shared';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, ClipboardList, Eye, X } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { api } from '@/lib/api';
import type { SimulatorProps } from '../types';
import { useGen } from './actions';
import { BenchStrip, GenWorkbook } from './stages';

export const ROOM_LABEL: Record<GenPaper['room'], string> = { workshop: 'Workshop', kitchen: 'Kitchen', studio: 'Studio', field: 'Field work', drawing: 'Drawing office', lab: 'Laboratory' };

/** The practical as the paper sets it (2D task card and the 3D task card). */
export function GenTask({ paper }: { paper: GenPaper }) {
  return (
    <div className="space-y-1.5 text-[13.5px] leading-relaxed">
      <p>
        <span className="font-semibold">Aim:</span> {paper.aim}
      </p>
      <p className="text-muted-foreground">Work through the six stages: safety, setting out, the procedure and its decisions, results, spotting the fault, and the write-up. This is a marked guided practical, out of 20.</p>
    </div>
  );
}

export const useGuidedDemo = (practicalId: string | undefined, on: boolean) =>
  useQuery({ queryKey: ['practicals', 'guided-demo', practicalId], enabled: on && !!practicalId, staleTime: 5 * 60_000, queryFn: () => api.get<GenDemoView>(`/learning/practicals/lessons/${encodeURIComponent(practicalId!)}/guided-demo`) });

/** The worked example, on its own seed: the same worksheet, already filled in, with the demonstrator's reasons. */
function WorkedExample({ practicalId, onClose }: { practicalId?: string; onClose: () => void }) {
  const q = useGuidedDemo(practicalId, true);
  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="font-display text-[15px] font-semibold tracking-tight">Worked example</p>
        <Button size="icon-sm" variant="ghost" aria-label="Close the worked example" onClick={onClose}>
          <X />
        </Button>
      </div>
      {q.data ? <Example demo={q.data} /> : q.error ? <p className="text-[13.5px] text-muted-foreground">The worked example is not available just now.</p> : <Skeleton className="h-48 rounded-xl" />}
    </Card>
  );
}
function Example({ demo }: { demo: GenDemoView }) {
  const [stage, setStage] = useState(0);
  const h = useGen({ paper: demo.paper, state: demo.model, onChange: () => undefined, readOnly: true, startedAt: new Date(0).toISOString() });
  const notes = stage === 2 ? demo.paper.decisions : stage === 3 ? [...demo.paper.observations, ...demo.paper.numerics] : stage === 4 ? demo.paper.faults : [];
  return (
    <>
      <GenWorkbook h={h} stage={stage} onStage={setStage} />
      {notes.map((n) => demo.notes[n.id] && <p key={n.id} className="mt-2 rounded-lg bg-muted px-3 py-2 text-[13px]">{demo.notes[n.id]}</p>)}
    </>
  );
}

/** The 2D Guided practical: first-class, light enough for a cheap phone, the same paper and marks as the 3D room. */
export default function GenPracticalLab({ mode, state, onChange, readOnly, startedAt, attemptId, practicalId, paper, onHandIn }: SimulatorProps<'gen-practical'>) {
  if (!paper) return <Card className="p-6 text-center text-[13.5px] text-muted-foreground">This guided practical could not be opened. Refresh the page.</Card>;
  return <Lab2d mode={mode} state={state} onChange={onChange} readOnly={readOnly} startedAt={startedAt} attemptId={attemptId} practicalId={practicalId} paper={paper} onHandIn={onHandIn} />;
}

function Lab2d({ state, onChange, readOnly, startedAt, attemptId, practicalId, paper }: { mode: string; state: GenPracticalState; onChange: (s: GenPracticalState) => void; readOnly: boolean; startedAt: string; attemptId?: string; practicalId?: string; paper: GenPaper; onHandIn?: () => void }) {
  const h = useGen({ paper, state, onChange, readOnly, startedAt, attemptId });
  // Read-only review pages through locally; the stage in the state is the student's own place.
  const [view, setView] = useState(0);
  const [guided, setGuided] = useState(true);
  const [example, setExample] = useState(false);
  const stage = readOnly ? view : state.stage;
  const go = (i: number) => {
    if (readOnly) setView(i);
    else h.setStage(i);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const live = { ...h, canCheck: h.canCheck && guided };
  return (
    <div className="space-y-3">
      <Card className="p-3 sm:p-4">
        <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
          <Badge variant="ai">
            <ClipboardList /> Guided practical
          </Badge>
          <Badge variant="outline">{ROOM_LABEL[paper.room]}</Badge>
          {paper.feedback && !readOnly && (
            <label className="ml-auto flex items-center gap-2 text-[12.5px] text-muted-foreground">
              Feedback as I go <Switch checked={guided} onCheckedChange={setGuided} aria-label="Feedback as I go" />
            </label>
          )}
        </div>
        <GenTask paper={paper} />
        {paper.feedback && !readOnly && (
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setExample((x) => !x)}>
              <Eye /> Worked example
            </Button>
            {practicalId && (
              <Button asChild size="sm" variant="ghost">
                <a href={`/learn/practicals/lesson/${encodeURIComponent(practicalId)}`}>
                  <BookOpen /> Lesson
                </a>
              </Button>
            )}
          </div>
        )}
      </Card>
      {example && <WorkedExample practicalId={practicalId} onClose={() => setExample(false)} />}
      <BenchStrip h={h} />
      <Card className="p-3 sm:p-4">
        <GenWorkbook h={live} stage={stage} onStage={go} end={readOnly ? undefined : <span className="text-[12.5px] text-muted-foreground">Hand in at the top when you are ready.</span>} />
      </Card>
    </div>
  );
}
