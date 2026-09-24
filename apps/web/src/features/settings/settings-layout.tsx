import type { Permission } from '@aischool/shared';
import type { ReactNode } from 'react';
import { Building, ScrollText, ShieldCheck, UserCog } from 'lucide-react';
import { Link, Outlet, useLocation } from 'react-router';
import { Page, PageHeader } from '@/components/layout/page-header';
import { hasPermission, useMe } from '@/lib/auth-store';
import { cn } from '@/lib/utils';

const LINKS: { to: string; label: string; icon: typeof Building; permission: Permission }[] = [
  { to: '/settings', label: 'School profile', icon: Building, permission: 'school.read' },
  { to: '/settings/users', label: 'Users', icon: UserCog, permission: 'users.read' },
  { to: '/settings/roles', label: 'Roles & permissions', icon: ShieldCheck, permission: 'roles.manage' },
  { to: '/settings/audit', label: 'Audit log', icon: ScrollText, permission: 'audit.read' },
];

export default function SettingsLayout() {
  const me = useMe();
  const { pathname } = useLocation();
  const links = LINKS.filter((l) => hasPermission(me, l.permission));
  return (
    <Page>
      <PageHeader title="Settings" description="Manage your school profile, people's access and the audit trail." />
      <nav aria-label="Settings" className="no-scrollbar -mx-4 mb-6 flex gap-1 overflow-x-auto border-b border-border px-4 sm:mx-0 sm:px-0">
        {links.map((l) => {
          const active = pathname === l.to;
          return (
            <Link
              key={l.to}
              to={l.to}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative flex shrink-0 items-center gap-2 px-3 pb-3 pt-1 text-[13.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <l.icon className={cn('size-4', active && 'text-brand')} />
              {l.label}
              {active && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand" />}
            </Link>
          );
        })}
      </nav>
      <Outlet />
    </Page>
  );
}

/** Section header used inside settings sub-pages. */
export function SectionHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h2 className="font-display text-lg font-semibold tracking-tight">{title}</h2>
        {description && <p className="mt-0.5 text-[13.5px] text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
    </div>
  );
}
