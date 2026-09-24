import type { TenantSummary } from '@aischool/shared';
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react';
import { useSwitchTenant } from '@/features/auth/session';
import { useMe } from '@/lib/auth-store';
import { cn, initialsFromName } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { BrandMark } from './brand';

export function SchoolLogo({ tenant, className }: { tenant: Pick<TenantSummary, 'name' | 'shortName' | 'logoUrl' | 'primaryColor'>; className?: string }) {
  if (tenant.logoUrl) {
    return <img src={tenant.logoUrl} alt="" className={cn('size-8 rounded-lg object-cover', className)} />;
  }
  const color = tenant.primaryColor ?? '#4f46e5';
  return (
    <span
      aria-hidden
      className={cn('grid size-8 shrink-0 place-items-center rounded-lg text-[11px] font-bold text-white shadow-soft', className)}
      style={{ background: `linear-gradient(135deg, ${color}, color-mix(in oklab, ${color} 60%, #0b1330))` }}
    >
      {initialsFromName(tenant.shortName || tenant.name)}
    </span>
  );
}

export function TenantSwitcher({ collapsed }: { collapsed?: boolean }) {
  const me = useMe();
  const switchTenant = useSwitchTenant();
  const tenant = me?.tenant;
  const memberships = me?.memberships ?? [];

  const trigger = tenant ? (
    <SchoolLogo tenant={tenant} />
  ) : (
    <BrandMark className="size-8" />
  );

  const title = tenant?.name ?? 'AI School OS';
  const subtitle = tenant ? tenant.slug : me?.user.platformRole ? 'Platform console' : 'No school selected';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          'group flex w-full items-center gap-2.5 rounded-xl p-1.5 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-muted',
          collapsed && 'justify-center',
        )}
        aria-label={`Current school: ${title}. Switch school`}
        disabled={memberships.length === 0}
      >
        {trigger}
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] font-semibold leading-tight">{title}</span>
              <span className="block truncate text-[11.5px] text-muted-foreground">{subtitle}</span>
            </span>
            {switchTenant.isPending ? (
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            ) : (
              memberships.length > 1 && <ChevronsUpDown className="size-4 text-muted-foreground" />
            )}
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Your schools</DropdownMenuLabel>
        {memberships.map((m) => {
          const active = m.id === tenant?.id;
          return (
            <DropdownMenuItem
              key={m.id}
              onSelect={() => {
                if (!active) switchTenant.mutate(m.id);
              }}
              className="gap-3"
            >
              <SchoolLogo tenant={m} className="size-7" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{m.name}</span>
                <span className="block truncate text-[11px] text-muted-foreground">{m.slug}</span>
              </span>
              {active && <Check className="!text-brand" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
