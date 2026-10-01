import type { InvoiceRow } from '@aischool/shared';
import { Receipt } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { type Column, DataTable, Pagination } from '@/components/ui/data-table';
import { SearchInput } from '@/components/ui/search-input';
import { NONE, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDebounced } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { ArmSelect } from '../planning/pickers';
import { type InvoiceStatusFilter, useInvoices } from './api';
import { FinanceTermSelect, InvoiceStatusBadge, money, schoolDate, type TermContext, useCurrency } from './ui';

export const STATUS_FILTERS: { value: InvoiceStatusFilter; label: string }[] = [
  { value: 'OUTSTANDING', label: 'Outstanding' },
  { value: 'OVERDUE', label: 'Overdue' },
  { value: 'ISSUED', label: 'Unpaid' },
  { value: 'PART_PAID', label: 'Part-paid' },
  { value: 'PAID', label: 'Paid' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

interface Props {
  ctx: TermContext;
  onTermChange: (termId: string | undefined) => void;
  classArmId: string | undefined;
  status: InvoiceStatusFilter | undefined;
  q: string;
  page: number;
  onChange: (next: Record<string, string | undefined>) => void;
  onGoSchedule: () => void;
}

const PAGE_SIZE = 25;

export function InvoicesTab({ ctx, onTermChange, classArmId, status, q, page, onChange, onGoSchedule }: Props) {
  const currency = useCurrency();
  const navigate = useNavigate();
  const [search, setSearch] = useState(q);
  const debounced = useDebounced(search.trim(), 300);

  useEffect(() => {
    if (debounced !== q) onChange({ q: debounced || undefined, page: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const list = useInvoices({ termId: ctx.termId, classArmId, status, q: q || undefined, page, pageSize: PAGE_SIZE }, !!ctx.termId);
  const filtered = !!(classArmId || status || q);

  const columns: Column<InvoiceRow>[] = [
    {
      key: 'number',
      header: 'Invoice',
      cell: (r) => <span className="font-mono text-[12.5px] text-muted-foreground">{r.number}</span>,
    },
    {
      key: 'student',
      header: 'Learner',
      cell: (r) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{r.student.name}</p>
          <p className="font-mono text-[11.5px] text-muted-foreground">{r.student.admissionNumber}</p>
        </div>
      ),
    },
    { key: 'class', header: 'Class', cell: (r) => <span className="text-muted-foreground">{r.student.classArm ?? '—'}</span> },
    { key: 'total', header: 'Total', headClassName: 'text-right', className: 'text-right tabular', cell: (r) => money(r.totalKobo, currency) },
    { key: 'paid', header: 'Paid', headClassName: 'text-right', className: 'text-right tabular text-success', cell: (r) => (r.paidKobo ? money(r.paidKobo, currency) : '—') },
    {
      key: 'balance',
      header: 'Balance',
      headClassName: 'text-right',
      className: 'text-right tabular font-semibold',
      cell: (r) => <span className={cn(r.balanceKobo > 0 && r.overdue && 'text-danger', r.balanceKobo === 0 && 'text-muted-foreground')}>{money(r.balanceKobo, currency)}</span>,
    },
    { key: 'status', header: 'Status', cell: (r) => <InvoiceStatusBadge status={r.status} overdue={r.overdue} /> },
    { key: 'due', header: 'Due', cell: (r) => <span className={cn('whitespace-nowrap text-[12.5px] tabular', r.overdue ? 'text-danger' : 'text-muted-foreground')}>{schoolDate(r.dueDate)}</span> },
  ];

  return (
    <div className="space-y-4">
      <Card className="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)]">
        <FinanceTermSelect ctx={ctx} onChange={(t) => onTermChange(t)} />
        {ctx.structure ? (
          <ArmSelect structure={ctx.structure} value={classArmId} onChange={(v) => onChange({ class: v, page: undefined })} allLabel="All classes" aria-label="Class" />
        ) : (
          <div className="hidden lg:block" />
        )}
        <Select value={status ?? NONE} onValueChange={(v) => onChange({ status: v === NONE ? undefined : v, page: undefined })}>
          <SelectTrigger aria-label="Status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>All statuses</SelectItem>
            {STATUS_FILTERS.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <SearchInput value={search} onChange={setSearch} placeholder="Name, admission or invoice no." label="Search invoices" className="sm:col-span-2 lg:col-span-1" />
      </Card>

      <Card className="overflow-hidden">
        <DataTable
          columns={columns}
          rows={list.data?.items}
          rowKey={(r) => r.id}
          loading={list.isLoading || list.isPlaceholderData}
          error={list.error}
          onRetry={() => void list.refetch()}
          onRowClick={(r) => navigate(`/fees/invoices/${r.id}`)}
          rowLabel={(r) => `Invoice ${r.number} for ${r.student.name}`}
          renderMobile={(r) => (
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium">{r.student.name}</p>
                <p className="truncate text-[12px] text-muted-foreground">
                  <span className="font-mono">{r.number}</span> · {r.student.classArm ?? 'No class'}
                </p>
                <div className="mt-1.5">
                  <InvoiceStatusBadge status={r.status} overdue={r.overdue} />
                </div>
              </div>
              <div className="text-right">
                <p className={cn('text-[14px] font-semibold tabular', r.overdue && r.balanceKobo > 0 && 'text-danger')}>{money(r.balanceKobo, currency)}</p>
                <p className="text-[11.5px] text-muted-foreground tabular">of {money(r.totalKobo, currency)}</p>
                <p className="text-[11.5px] text-muted-foreground">due {schoolDate(r.dueDate)}</p>
              </div>
            </div>
          )}
          empty={
            filtered
              ? { icon: Receipt, title: 'No invoices match', description: 'Try a different class, status or search.' }
              : {
                  icon: Receipt,
                  title: 'No invoices yet',
                  description: 'Set the fee schedule, then issue invoices.',
                  action: (
                    <Button variant="outline" onClick={onGoSchedule}>
                      Open fee schedule
                    </Button>
                  ),
                }
          }
        />
        {list.data && list.data.total > 0 && (
          <Pagination page={page} pageSize={PAGE_SIZE} total={list.data.total} onPageChange={(p) => onChange({ page: p > 1 ? String(p) : undefined })} noun="invoices" />
        )}
      </Card>
    </div>
  );
}
