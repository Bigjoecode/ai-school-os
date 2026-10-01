import { AWARD_CATEGORIES, AWARD_CATEGORY_LABELS, type AwardCategory, type AwardRow } from '@aischool/shared';
import { ChevronDown, Gift, Medal, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { NONE, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useCan } from '@/lib/auth-store';
import { formatDate } from '@/lib/format';
import { useSearchFlag } from '../planning/ui';
import { cn, initialsFromName } from '@/lib/utils';
import { useAwards, useDeleteAward, useHrOverview } from './api';
import { type AwardPrefill, GiveAwardDialog } from './award-dialog';
import { RecognitionList } from './hr-overview-page';

export default function AwardsPage() {
  const canManage = useCan('hr.manage');
  const q = useAwards();
  const overview = useHrOverview();
  const del = useDeleteAward();
  const [newOpen, setNewOpen] = useSearchFlag('new');
  const [prefill, setPrefill] = useState<AwardPrefill | null>(null);
  const [category, setCategory] = useState<AwardCategory | undefined>();
  const [deleting, setDeleting] = useState<AwardRow | null>(null);

  const rows = (q.data ?? []).filter((a) => !category || a.category === category);
  const open = (canManage && newOpen) || !!prefill;
  const thisYear = new Date().getFullYear().toString();

  return (
    <Page>
      <PageHeader
        title="Awards"
        description="Thank people properly — awards sit on their record, and AI can draft the citation from it."
        actions={
          canManage && (
            <Button onClick={() => setNewOpen(true)}>
              <Medal /> Give award
            </Button>
          )
        }
      />
      <div className="grid gap-5 xl:grid-cols-3 [&>*]:min-w-0">
        <div className="space-y-4 xl:col-span-2">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Select value={category ?? NONE} onValueChange={(v) => setCategory(v === NONE ? undefined : (v as AwardCategory))}>
              <SelectTrigger aria-label="Category" className="sm:w-60">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>All categories</SelectItem>
                {AWARD_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {AWARD_CATEGORY_LABELS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {q.data && (
              <p className="text-[13px] text-muted-foreground">
                {q.data.filter((a) => a.awardedOn.startsWith(thisYear)).length} this year · {q.data.length} in total
              </p>
            )}
          </div>
          {q.error && !q.data ? (
            <ErrorState error={q.error} onRetry={() => void q.refetch()} />
          ) : !q.data ? (
            <div className="space-y-3" aria-busy>
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-[96px] rounded-2xl" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <Card>
              <EmptyState
                icon={Medal}
                title={category ? `No ${AWARD_CATEGORY_LABELS[category].toLowerCase()} awards yet` : 'No awards yet'}
                description="A short, specific thank-you goes a long way. The suggestions alongside are a good place to start."
                action={
                  canManage ? (
                    <Button onClick={() => setNewOpen(true)}>
                      <Medal /> Give award
                    </Button>
                  ) : undefined
                }
              />
            </Card>
          ) : (
            <ul className="space-y-3">
              {rows.map((a) => (
                <AwardCard key={a.id} a={a} onDelete={canManage ? () => setDeleting(a) : undefined} />
              ))}
            </ul>
          )}
        </div>
        <Card className="h-fit">
          <CardHeader>
            <div>
              <CardTitle>Worth recognising</CardTitle>
              <CardDescription>From punctuality, attendance and service records</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {!overview.data ? (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : (
              <RecognitionList items={overview.data.recognition} onAward={canManage ? setPrefill : undefined} compact />
            )}
          </CardContent>
        </Card>
      </div>

      {canManage && (
        <GiveAwardDialog
          open={open}
          onOpenChange={(o) => {
            if (o) return;
            setNewOpen(false);
            setPrefill(null);
          }}
          prefill={prefill}
        />
      )}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Remove this award?"
        description={deleting ? `“${deleting.title}” will be removed from ${deleting.staff.name}’s record.` : undefined}
        confirmLabel="Remove award"
        loading={del.isPending}
        onConfirm={() => deleting && del.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}
      />
    </Page>
  );
}

function AwardCard({ a, onDelete }: { a: AwardRow; onDelete?: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const long = (a.citation?.length ?? 0) > 180;
  return (
    <li>
      <Card className="p-4 sm:p-5">
        <div className="flex gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-warning-soft text-warning">
            <Medal className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-display text-[15px] font-semibold tracking-tight">{a.title}</p>
              <Badge variant="outline">{AWARD_CATEGORY_LABELS[a.category]}</Badge>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-muted-foreground">
              <Link to={`/hr/employees/${a.staff.id}?tab=awards`} className="inline-flex items-center gap-1.5 font-medium text-foreground hover:underline">
                <Avatar name={a.staff.name} initials={initialsFromName(a.staff.name)} size="xs" /> {a.staff.name}
              </Link>
              <span>{a.staff.jobTitle}</span>
              <span>{formatDate(a.awardedOn)}</span>
              {a.prize && (
                <span className="inline-flex items-center gap-1">
                  <Gift className="size-3.5" aria-hidden /> {a.prize}
                </span>
              )}
            </div>
            {a.citation && (
              <div className="mt-3">
                <p className={cn('whitespace-pre-line text-[13px] leading-relaxed text-foreground/90', !expanded && long && 'line-clamp-3')}>{a.citation}</p>
                {long && (
                  <button
                    type="button"
                    onClick={() => setExpanded(!expanded)}
                    aria-expanded={expanded}
                    className="mt-1 inline-flex items-center gap-1 rounded text-[12.5px] font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {expanded ? 'Show less' : 'Read citation'} <ChevronDown className={cn('size-3.5 transition-transform', expanded && 'rotate-180')} />
                  </button>
                )}
              </div>
            )}
          </div>
          {onDelete && (
            <Button variant="ghost" size="icon-sm" aria-label={`Remove ${a.title}`} onClick={onDelete} className="text-muted-foreground hover:text-danger">
              <Trash2 />
            </Button>
          )}
        </div>
      </Card>
    </li>
  );
}
