import type { StudentDiscountRow } from '@aischool/shared';
import { BadgePercent, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useCan } from '@/lib/auth-store';
import { cn } from '@/lib/utils';
import { useStructure } from '../academics/api';
import { DiscountDialog, discountValue, discountWindow, KindChip } from './discounts-tab';
import { useStudentDiscounts } from './discounts-api';
import { useCurrency } from './ui';

const ordinal = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;

/** "Discounts" block for the student side sheet: standing awards plus what the automatic rules give. */
export function StudentDiscountsPanel({ student, onNavigate }: { student: { id: string; name: string; admissionNumber: string }; onNavigate?: () => void }) {
  const currency = useCurrency();
  const canManage = useCan('finance.manage');
  const structure = useStructure();
  const q = useStudentDiscounts(student.id);
  const [editing, setEditing] = useState<StudentDiscountRow | 'new' | null>(null);
  const d = q.data;

  const auto: string[] = [];
  if (d?.sibling && d.sibling.position > 1) {
    auto.push(`${ordinal(d.sibling.position)} of ${d.sibling.familySize} siblings${d.sibling.rulePct != null ? ` — ${d.sibling.rulePct}% off tuition` : ' — sibling rule is off'}`);
  } else if (d?.sibling) {
    auto.push(`Eldest of ${d.sibling.familySize} siblings — pays in full`);
  }
  if (d?.staffChild.matched) {
    auto.push(`Child of staff (${d.staffChild.staffName})${d.staffChild.rulePct != null ? ` — ${d.staffChild.rulePct}% off ${d.rules.staffChild.appliesTo === 'ALL' ? 'fees' : 'tuition'}` : ' — staff-child rule is off'}`);
  }

  return (
    <section className="mt-6" aria-labelledby="sheet-discounts">
      <div className="mb-3 flex items-center justify-between">
        <h3 id="sheet-discounts" className="flex items-center gap-2 text-[13px] font-semibold">
          <BadgePercent className="size-4 text-muted-foreground" /> Discounts
        </h3>
        {canManage && (
          <Button variant="ghost" size="sm" onClick={() => setEditing('new')}>
            <Plus /> Add
          </Button>
        )}
      </div>
      {q.isLoading ? (
        <Skeleton className="h-14 w-full rounded-xl" />
      ) : !d ? (
        <p className="rounded-xl border border-dashed border-border p-4 text-[13px] text-muted-foreground">Couldn’t load discounts.</p>
      ) : !d.discounts.length && !auto.length ? (
        <p className="rounded-xl border border-dashed border-border p-4 text-[13px] text-muted-foreground">No discounts — pays the full fees.</p>
      ) : (
        <ul className="space-y-2">
          {d.discounts.map((x) => (
            <li key={x.id}>
              <button
                type="button"
                disabled={!canManage}
                onClick={() => setEditing(x)}
                className={cn('w-full rounded-xl border border-border bg-muted/30 p-3 text-left transition-colors enabled:hover:border-border-strong', !x.active && 'opacity-60')}
              >
                <p className="flex flex-wrap items-center gap-1.5 text-[13px]">
                  <KindChip kind={x.kind} />
                  <span className="font-medium">{x.label}</span>
                  {!x.active && <span className="text-[11.5px] text-muted-foreground">· stopped</span>}
                </p>
                <p className="mt-0.5 text-[12px] text-muted-foreground">
                  {discountValue(x, currency)} · {discountWindow(x)}
                </p>
              </button>
            </li>
          ))}
          {auto.map((a) => (
            <li key={a} className="rounded-xl border border-dashed border-border px-3 py-2 text-[12.5px] text-muted-foreground">
              <span className="font-medium text-foreground">Automatic:</span> {a}
            </li>
          ))}
        </ul>
      )}
      {d && (d.discounts.length > 0 || auto.length > 0) && (
        <p className="mt-2 text-[11.5px] text-muted-foreground">
          {d.rules.combine === 'BEST' ? 'Only the largest discount applies.' : 'Discounts are added together.'}{' '}
          <Link to="/fees?tab=discounts" onClick={onNavigate} className="font-medium text-brand hover:underline">
            Discount rules
          </Link>
        </p>
      )}
      {editing && (
        <DiscountDialog
          open={!!editing}
          onOpenChange={(o) => !o && setEditing(null)}
          discount={editing === 'new' ? null : editing}
          ctx={{ structure: structure.data }}
          student={{ id: student.id, name: student.name, admissionNumber: student.admissionNumber }}
        />
      )}
    </section>
  );
}
