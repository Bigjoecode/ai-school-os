import { type AudiencePreview, type Channel, CHANNEL_LABELS, smsSafe } from '@aischool/shared';
import { AlertTriangle, AtSign, Eye, Phone, Smartphone, Users } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/lib/api';
import { useMe } from '@/lib/auth-store';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import { CHANNEL_ICON, CHANNEL_SHORT, money, personaliseSample } from './ui';

const MISSING: Record<Channel, string> = {
  EMAIL: 'no email address',
  SMS: 'no phone number',
  WHATSAPP: 'no phone number',
  PUSH: 'no app account',
  IN_APP: 'no app account',
};

export function PreviewPanel({
  preview,
  loading,
  fetching,
  error,
  problem,
  subject,
  body,
  smsText,
  showSms,
}: {
  preview: AudiencePreview | undefined;
  loading: boolean;
  fetching: boolean;
  error: unknown;
  /** Why there's no preview yet (incomplete audience, no channels). */
  problem: string | null;
  subject: string;
  body: string;
  smsText: string;
  showSms: boolean;
}) {
  const me = useMe();
  const school = me?.tenant?.name ?? 'your school';
  const [sampleIdx, setSampleIdx] = useState(0);
  const sample = preview?.sample[Math.min(sampleIdx, Math.max(0, (preview?.sample.length ?? 1) - 1))];

  return (
    <Card aria-busy={fetching || undefined}>
      <CardHeader className="pb-2">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Eye className="size-4 text-muted-foreground" aria-hidden /> Preview
            {fetching && !loading && <span className="size-1.5 animate-pulse rounded-full bg-brand" aria-hidden />}
          </CardTitle>
          <CardDescription>Who gets it, and how it reads</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {problem ? (
          <EmptyState compact icon={Users} title="Not ready to preview" description={problem} className="py-6" />
        ) : loading ? (
          <div className="space-y-3" aria-live="polite">
            <Skeleton className="h-9 w-28" />
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : error && !preview ? (
          <p role="alert" className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger-soft/50 px-3 py-2.5 text-[12.5px] text-danger">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {errorMessage(error)}
          </p>
        ) : preview ? (
          <div className={cn('space-y-4 transition-opacity', fetching && 'opacity-60')}>
            <div aria-live="polite">
              <p className="font-display text-[30px] font-semibold leading-none tracking-tight tabular">{formatNumber(preview.recipients)}</p>
              <p className="mt-1 text-[12.5px] text-muted-foreground">
                {preview.recipients === 1 ? 'person' : 'people'} · {preview.summary}
              </p>
            </div>

            {preview.recipients === 0 ? (
              <p className="rounded-xl border border-warning/30 bg-warning-soft/50 px-3 py-2.5 text-[12.5px]">Nobody matches this audience yet. Check the classes or filters you picked.</p>
            ) : (
              <>
                <ul className="divide-y divide-border rounded-xl border border-border">
                  {preview.byChannel.map((c) => {
                    const Icon = CHANNEL_ICON[c.channel];
                    return (
                      <li key={c.channel} className="flex items-start gap-2.5 px-3 py-2">
                        <Icon className={cn('mt-0.5 size-3.5 shrink-0', c.configured ? 'text-muted-foreground' : 'text-warning')} aria-hidden />
                        <div className="min-w-0 flex-1 text-[12.5px]">
                          <p className="flex items-baseline justify-between gap-2">
                            <span className="font-medium">{CHANNEL_SHORT[c.channel]}</span>
                            <span className="tabular">
                              {formatNumber(c.reachable)} <span className="text-muted-foreground">reachable</span>
                            </span>
                          </p>
                          {!c.configured ? (
                            <p className="text-warning">
                              Not set up — these will be skipped.{' '}
                              <Link to="/messages/settings" className="font-medium underline-offset-2 hover:underline">
                                Set up
                              </Link>
                            </p>
                          ) : (
                            c.unreachable > 0 && (
                              <p className="text-muted-foreground">
                                {formatNumber(c.unreachable)} with {MISSING[c.channel]}
                              </p>
                            )
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>

                {preview.sms && (
                  <div className="rounded-xl border border-border bg-muted/30 px-3 py-2.5 text-[12.5px]">
                    <p className="flex items-baseline justify-between gap-2">
                      <span className="text-muted-foreground">SMS cost (estimate)</span>
                      <span className="font-display text-[15px] font-semibold tabular">{money(preview.sms.costKobo, preview.currency)}</span>
                    </p>
                    <p className="mt-0.5 text-muted-foreground tabular">
                      {formatNumber(preview.sms.units)} page{preview.sms.units === 1 ? '' : 's'} in all · about {preview.sms.segments} each
                      {preview.sms.encoding === 'UNICODE' && <span className="text-warning"> · Unicode</span>}
                    </p>
                  </div>
                )}

                {preview.sample.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Some of the recipients</p>
                    <ul className="space-y-0.5">
                      {preview.sample.slice(0, 6).map((s, i) => (
                        <li key={`${s.name}-${i}`}>
                          <button
                            type="button"
                            onClick={() => setSampleIdx(i)}
                            aria-pressed={i === sampleIdx}
                            className={cn(
                              'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                              i === sampleIdx && 'bg-muted',
                            )}
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-medium">{s.name}</span>
                              {s.detail && <span className="block truncate text-[11.5px] text-muted-foreground">{s.detail}</span>}
                            </span>
                            <span className="flex shrink-0 items-center gap-1 text-muted-foreground/70">
                              <AtSign className={cn('size-3', s.email ? 'text-foreground/70' : 'opacity-30')} aria-label={s.email ? 'Has email' : 'No email'} />
                              <Phone className={cn('size-3', s.phone ? 'text-foreground/70' : 'opacity-30')} aria-label={s.phone ? 'Has phone' : 'No phone'} />
                              <Smartphone className={cn('size-3', s.hasApp ? 'text-foreground/70' : 'opacity-30')} aria-label={s.hasApp ? 'Uses the app' : 'No app account'} />
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {sample && (body.trim() || smsText.trim()) && (
                  <div className="space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">As {sample.name.split(' ')[0]} sees it</p>
                    {body.trim() && (
                      <div className="rounded-xl border border-border bg-card">
                        {subject.trim() && <p className="border-b border-border px-3 py-2 text-[12.5px] font-semibold">{personaliseSample(subject, sample, school)}</p>}
                        <p className="max-h-56 overflow-y-auto whitespace-pre-wrap break-words px-3 py-2.5 text-[12.5px] leading-relaxed scrollbar-thin">{personaliseSample(body, sample, school)}</p>
                      </div>
                    )}
                    {showSms && smsText.trim() && (
                      <div className="ml-auto max-w-[92%] rounded-2xl rounded-br-md bg-brand px-3 py-2 text-[12.5px] leading-relaxed text-brand-foreground">
                        <span className="mb-0.5 block text-[10.5px] font-semibold uppercase tracking-wider opacity-75">{CHANNEL_LABELS.SMS}</span>
                        <span className="whitespace-pre-wrap break-words">{smsSafe(personaliseSample(smsText, sample, school))}</span>
                      </div>
                    )}
                    <p className="text-[11px] text-muted-foreground">Names are filled in for each person when it sends. Tap someone above to see theirs.</p>
                  </div>
                )}
              </>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
