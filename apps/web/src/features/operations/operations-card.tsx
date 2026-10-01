import type { OperationsOverview } from '@aischool/shared';
import type { LucideIcon } from 'lucide-react';
import { ArrowUpRight, BedDouble, Bus, ConciergeBell, Library, Package } from 'lucide-react';
import { Link } from 'react-router';
import { Card } from '@/components/ui/card';
import { hasPermission, useAuthStore } from '@/lib/auth-store';
import { cn } from '@/lib/utils';
import { useOperationsOverview } from './api';

interface Tile {
  key: string;
  to: string;
  label: string;
  icon: LucideIcon;
  value: string;
  sub: string;
  alert: boolean;
}

function tiles(o: OperationsOverview): Tile[] {
  const out: Tile[] = [];
  if (o.library)
    out.push({
      key: 'library',
      to: o.library.overdue ? '/library?tab=loans&status=OVERDUE' : '/library',
      label: 'Library',
      icon: Library,
      value: `${o.library.onLoan} on loan`,
      sub: o.library.overdue ? `${o.library.overdue} overdue` : 'None overdue',
      alert: o.library.overdue > 0,
    });
  if (o.inventory)
    out.push({
      key: 'inventory',
      to: o.inventory.lowStock ? '/inventory?low=1' : '/inventory',
      label: 'Stores',
      icon: Package,
      value: o.inventory.lowStock ? `${o.inventory.lowStock} low` : 'Stocked',
      sub: o.inventory.lowStock ? 'Below reorder level' : 'Nothing running low',
      alert: o.inventory.lowStock > 0,
    });
  if (o.transport)
    out.push({
      key: 'transport',
      to: '/transport',
      label: 'Transport',
      icon: Bus,
      value: `${o.transport.riders} riders`,
      sub: o.transport.overCapacity ? `${o.transport.overCapacity} route${o.transport.overCapacity === 1 ? '' : 's'} over capacity` : 'All within capacity',
      alert: o.transport.overCapacity > 0,
    });
  if (o.hostel)
    out.push({
      key: 'hostel',
      to: o.hostel.away ? '/hostel?tab=exeats' : '/hostel',
      label: 'Hostel',
      icon: BedDouble,
      value: `${o.hostel.boarders} boarders`,
      sub: o.hostel.overdue ? `${o.hostel.overdue} late back from exeat` : o.hostel.away ? `${o.hostel.away} away on exeat` : 'All in residence',
      alert: o.hostel.overdue > 0,
    });
  if (o.reception)
    out.push({
      key: 'reception',
      to: o.reception.followUpsDue ? '/reception?tab=enquiries' : '/reception',
      label: 'Front desk',
      icon: ConciergeBell,
      value: `${o.reception.onSite} on site`,
      sub: o.reception.followUpsDue ? `${o.reception.followUpsDue} enquir${o.reception.followUpsDue === 1 ? 'y' : 'ies'} to follow up` : 'No follow-ups due',
      alert: o.reception.followUpsDue > 0,
    });
  return out;
}

const READ = ['library.read', 'inventory.read', 'transport.read', 'hostel.read', 'reception.read'] as const;

/** A quiet strip on the dashboard: one tile per operations module this user can see. */
export function OperationsCard() {
  const any = useAuthStore((s) => READ.some((p) => hasPermission(s.me, p)));
  const q = useOperationsOverview(any);
  if (!any || !q.data) return null;
  const list = tiles(q.data);
  if (!list.length) return null;
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 pb-1 pt-4">
        <p className="font-display text-[15px] font-semibold tracking-tight">Operations</p>
        <span className="text-[12px] text-muted-foreground">Right now</span>
      </div>
      <ul className={cn('grid gap-2 p-3 sm:grid-cols-2 [&>*]:min-w-0', list.length >= 3 && 'lg:grid-cols-3', list.length === 4 && 'xl:grid-cols-4', list.length >= 5 && 'xl:grid-cols-5')}>
        {list.map((t) => (
          <li key={t.key}>
            <Link
              to={t.to}
              className="group flex items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 transition-colors hover:border-border hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className={cn('grid size-9 shrink-0 place-items-center rounded-lg', t.alert ? 'bg-warning-soft text-warning' : 'bg-muted text-muted-foreground')}>
                <t.icon className="size-4" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1 text-[12px] text-muted-foreground">
                  {t.label}
                  <ArrowUpRight className="size-3 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
                </span>
                <span className="block truncate text-[14px] font-semibold tabular">{t.value}</span>
                <span className={cn('block truncate text-[11.5px]', t.alert ? 'font-medium text-warning' : 'text-muted-foreground')}>{t.sub}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
