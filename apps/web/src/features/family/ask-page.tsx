import type { KbAnswer } from '@aischool/shared';
import { ArrowUp, BookOpen, FileText, MessageCircleQuestion } from 'lucide-react';
import { useState } from 'react';
import { Markdown } from '@/components/ai/markdown';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/lib/api';
import { useMe } from '@/lib/auth-store';
import { cn } from '@/lib/utils';
import { useAskSchool } from './api';

const SUGGESTIONS = ['When does next term start?', 'What is the school’s uniform policy?', 'How do I pay school fees?', 'What happens if my child is absent?'];

export default function AskSchoolPage() {
  const me = useMe();
  const ask = useAskSchool();
  const [question, setQuestion] = useState('');
  const [history, setHistory] = useState<{ q: string; a: KbAnswer }[]>([]);
  const [open, setOpen] = useState<string | null>(null);

  const submit = (text: string) => {
    const qq = text.trim();
    if (qq.length < 3 || ask.isPending) return;
    setQuestion(qq);
    ask.mutate(qq, { onSuccess: (a) => setHistory((h) => [{ q: qq, a }, ...h].slice(0, 6)) });
  };
  const current = history[0];

  return (
    <Page className="max-w-3xl">
      <PageHeader eyebrow={me?.tenant?.name} title="Ask the school" description="Questions about policies, term dates, fees and more — answered from the school’s own documents, with sources." />
      <Card className="p-3 sm:p-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(question);
          }}
          className="flex items-end gap-2"
        >
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit(question);
              }
            }}
            rows={2}
            maxLength={500}
            placeholder="e.g. What time does school close on Fridays?"
            aria-label="Your question"
            className="min-h-[52px] flex-1 resize-none bg-transparent px-2 py-1.5 text-[15px] outline-none placeholder:text-muted-foreground"
          />
          <Button type="submit" size="icon" loading={ask.isPending} disabled={question.trim().length < 3} aria-label="Ask">
            {!ask.isPending && <ArrowUp />}
          </Button>
        </form>
      </Card>
      {!current && !ask.isPending && (
        <div className="mt-4 flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button key={s} type="button" onClick={() => submit(s)} className="rounded-full border border-border bg-card px-3 py-1.5 text-[13px] transition-colors hover:bg-muted">
              {s}
            </button>
          ))}
        </div>
      )}
      {ask.error && <p className="mt-4 rounded-xl bg-danger-soft px-4 py-3 text-[13px] text-danger">{errorMessage(ask.error)}</p>}
      {ask.isPending && (
        <Card className="mt-6 space-y-3 p-5">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
        </Card>
      )}
      {history.length > 0 && (
        <div className="mt-6 space-y-4">
          {history.map(({ q, a }, i) => (
            <Card key={`${q}-${i}`} className={cn('p-5', i > 0 && 'opacity-80')}>
              <p className="flex items-start gap-2 text-[13px] font-medium text-muted-foreground">
                <MessageCircleQuestion className="mt-0.5 size-4 shrink-0" aria-hidden /> {q}
              </p>
              <Markdown text={a.answer} className="mt-3" />
              {a.sources.length > 0 ? (
                <div className="mt-4 border-t border-border pt-3">
                  <p className="mb-2 text-[12px] font-medium text-muted-foreground">Sources</p>
                  <ol className="space-y-1.5">
                    {a.sources.map((s, n) => {
                      const key = `${i}-${n}`;
                      return (
                        <li key={key}>
                          <button
                            type="button"
                            onClick={() => setOpen((o) => (o === key ? null : key))}
                            aria-expanded={open === key}
                            className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-muted"
                          >
                            <span className="grid size-5 shrink-0 place-items-center rounded-md bg-brand-soft text-[11px] font-semibold text-brand tabular">{n + 1}</span>
                            <FileText className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                            <span className="min-w-0 font-medium">{s.title}</span>
                          </button>
                          {open === key && <p className="ml-9 mt-1 rounded-lg bg-muted/70 px-3 py-2 text-[12.5px] text-muted-foreground">“{s.excerpt}”</p>}
                        </li>
                      );
                    })}
                  </ol>
                </div>
              ) : (
                <p className="mt-4 flex items-center gap-1.5 border-t border-border pt-3 text-[12px] text-muted-foreground">
                  <BookOpen className="size-3.5" aria-hidden /> No school document covers this yet — the school office can help.
                </p>
              )}
            </Card>
          ))}
        </div>
      )}
    </Page>
  );
}
