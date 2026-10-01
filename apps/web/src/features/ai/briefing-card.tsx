import { motion } from 'framer-motion';
import { Banknote, Briefcase, CalendarCheck, Check, Copy, MessagesSquare, Package, RotateCw, Trophy } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { AiSparkle } from '@/components/ai/ai-sparkle';
import { Markdown } from '@/components/ai/markdown';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatDateTime, formatRelative } from '@/lib/format';
import { isJobActive, useAiJob } from '../assessment/api';
import { FailedPanel, GeneratingPanel } from '../planning/ui';
import { briefingOf, useBriefingJobId, useStartBriefing } from './api';

const SOURCES = [
  { icon: CalendarCheck, label: 'Attendance' },
  { icon: Trophy, label: 'Results' },
  { icon: Banknote, label: 'Fees' },
  { icon: Briefcase, label: 'Staff' },
  { icon: Package, label: 'Operations' },
  { icon: MessagesSquare, label: 'Messages' },
];

/** The principal's weekly briefing: written in the background, then read here. */
export function BriefingCard() {
  const [jobId, setJobId] = useBriefingJobId();
  const job = useAiJob(jobId);
  const start = useStartBriefing(setJobId);
  const result = briefingOf(job.data);

  if (start.isPending || (jobId && isJobActive(job.data))) {
    return (
      <GeneratingPanel noun="weekly briefing" state={job.data?.state === 'RUNNING' ? 'RUNNING' : 'QUEUED'}>
        <SourceChips />
      </GeneratingPanel>
    );
  }
  if (job.data?.state === 'FAILED') {
    return <FailedPanel noun="weekly briefing" message={job.data.error} onRetry={() => start.mutate()} retrying={start.isPending} />;
  }
  if (result) return <BriefingResultCard text={result.text} generatedAt={result.generatedAt} model={[result.provider, result.model].join(' · ')} onAgain={() => start.mutate()} />;
  if (jobId && job.isLoading) return <Card className="h-40 animate-pulse" aria-label="Loading the briefing" />;

  return (
    <Card className="ai-border relative overflow-hidden border-transparent">
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-ai-2/15 blur-3xl" />
      <div className="relative flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-center">
        <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-ai-gradient shadow-[0_8px_24px_-8px_var(--ai-2)]">
          <AiSparkle className="size-6 [&_path]:fill-white" animated={false} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-lg font-semibold tracking-tight">Weekly briefing</h2>
          <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-muted-foreground">
            A one-page read on the state of the school, written for you by Principal AI — with the numbers that matter and what to do this
            week. It draws on attendance, results, fees, staff, operations and messages.
          </p>
          <SourceChips className="mt-3 justify-start" />
        </div>
        <Button variant="ai" size="lg" onClick={() => start.mutate()} loading={start.isPending} className="self-start lg:self-auto">
          <AiSparkle className="[&_path]:fill-white" animated={false} /> Write this week’s briefing
        </Button>
      </div>
    </Card>
  );
}

function SourceChips({ className }: { className?: string }) {
  return (
    <ul className={`flex flex-wrap justify-center gap-1.5 ${className ?? ''}`} aria-label="Draws on">
      {SOURCES.map(({ icon: Icon, label }) => (
        <li key={label} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/70 px-2.5 py-1 text-[11.5px] text-muted-foreground">
          <Icon className="size-3 text-ai-2" aria-hidden /> {label}
        </li>
      ))}
    </ul>
  );
}

function BriefingResultCard({ text, generatedAt, model, onAgain }: { text: string; generatedAt: string; model: string; onAgain: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success('Briefing copied');
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error('Couldn’t copy — select the text and copy it instead');
    }
  };
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="ai-border relative overflow-hidden border-transparent">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-ai-2/10 blur-3xl" />
        <div className="relative flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-ai-gradient">
              <AiSparkle className="size-4 [&_path]:fill-white" animated={false} />
            </span>
            <div className="min-w-0">
              <h2 className="font-display text-[15px] font-semibold tracking-tight">This week’s briefing</h2>
              <p className="text-[12px] text-muted-foreground">
                <time dateTime={generatedAt} title={formatDateTime(generatedAt)}>
                  Written {formatRelative(generatedAt)}
                </time>
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => void copy()}>
              {copied ? <Check /> : <Copy />} {copied ? 'Copied' : 'Copy'}
            </Button>
            <Button variant="ghost" size="sm" onClick={onAgain}>
              <RotateCw /> Write again
            </Button>
          </div>
        </div>
        <div className="relative px-5 py-5 sm:px-6 sm:py-6">
          <Markdown
            text={text}
            className="max-w-3xl text-[14.5px] leading-[1.7] [overflow-wrap:anywhere] [&_h1]:font-display [&_h2]:mt-5 [&_h2]:font-display [&_h2]:text-[15px] [&_h2]:font-semibold [&_h3]:font-semibold"
          />
          <div className="mt-5 flex flex-wrap items-center gap-2 text-[11.5px] text-muted-foreground">
            <Badge variant="outline" className="font-mono text-[10.5px] font-normal">
              {model}
            </Badge>
            Check the figures before sharing — AI can make mistakes.
          </div>
        </div>
      </Card>
    </motion.div>
  );
}
