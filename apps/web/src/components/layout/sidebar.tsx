import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useLocation } from 'react-router';
import { NAV_GROUPS, type NavItem, visibleNav } from '@/app/navigation';
import { useMe } from '@/lib/auth-store';
import { useUiStore } from '@/lib/ui-store';
import { cn } from '@/lib/utils';
import { SetupNavBadge } from '@/features/onboarding/ui';
import { usePortalHiddenNav } from '@/features/portal/api';
import { Tip } from '../ui/tooltip';
import { TenantSwitcher } from './tenant-switcher';

const PORTAL_NAV_SECTIONS = new Set(['attendance', 'results', 'calendar', 'downloads']);

function isActive(item: NavItem, pathname: string, search: string): boolean {
  const [path, query] = item.to.split('?');
  if (query) {
    if (pathname !== path) return false;
    const want = new URLSearchParams(query).get('agent');
    return new URLSearchParams(search).get('agent') === want;
  }
  if (path === '/') return pathname === '/';
  if (path === '/ai') return pathname === '/ai' && !new URLSearchParams(search).get('agent');
  if (path === '/settings') return pathname === '/settings';
  if (path === '/platform') return pathname === '/platform';
  // End of session (/academics/promotion) has its own item.
  if (path === '/academics') return pathname === '/academics';
  // My school's overview is /school/<studentId>; its sections have their own items.
  if (path === '/school') return pathname === '/school' || (/^\/school\/[^/]+$/.test(pathname) && !PORTAL_NAV_SECTIONS.has(pathname.split('/')[2]));
  if (pathname !== path && !pathname.startsWith(`${path}/`)) return false;
  // A more specific menu item wins (e.g. /lessons/vetting over /lessons).
  return !NAV_PATHS.some((p) => p.length > path.length && p.startsWith(`${path}/`) && (pathname === p || pathname.startsWith(`${p}/`)));
}

const NAV_PATHS = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.to.split('?')[0]!));

function NavLinkItem({ item, collapsed, onNavigate }: { item: NavItem; collapsed: boolean; onNavigate?: () => void }) {
  const { pathname, search } = useLocation();
  const active = isActive(item, pathname, search);
  const Icon = item.icon;
  const link = (
    <Link
      to={item.to}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group relative flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active ? 'bg-card text-foreground shadow-soft ring-1 ring-border' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        collapsed && 'justify-center px-0',
      )}
    >
      {active && !collapsed && (
        <span aria-hidden className="absolute -left-3 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-brand" />
      )}
      <Icon
        className={cn(
          'size-4 shrink-0 transition-colors',
          active ? 'text-brand' : 'text-muted-foreground/80 group-hover:text-foreground',
        )}
        aria-hidden
      />
      {!collapsed && (
        <>
          <span className="truncate">{item.label}</span>
          {item.badge === 'setup' && <SetupNavBadge />}
          {item.soon && (
            <span className="ml-auto rounded-full border border-border px-1.5 text-[10px] font-medium leading-4 text-muted-foreground/80">
              Soon
            </span>
          )}
        </>
      )}
      {collapsed && <span className="sr-only">{item.label}</span>}
    </Link>
  );
  return collapsed ? (
    <Tip label={item.soon ? `${item.label} · Soon` : item.label} side="right">
      {link}
    </Tip>
  ) : (
    link
  );
}

export function SidebarContent({ collapsed = false, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const me = useMe();
  const hidden = usePortalHiddenNav();
  const groups = useMemo(() => visibleNav(me, hidden), [me, hidden]);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={cn('shrink-0 p-3', collapsed && 'px-2')}>
        <TenantSwitcher collapsed={collapsed} />
      </div>
      <nav aria-label="Main" className="scrollbar-thin min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 pb-6">
        {groups.map((group, i) => (
          <div key={group.label ?? i} className={cn(i > 0 && 'mt-5')}>
            {group.label &&
              (collapsed ? (
                <div aria-hidden className="mx-auto mb-2 h-px w-6 bg-border" />
              ) : (
                <p className="mb-1.5 px-2.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/70">
                  {group.label}
                </p>
              ))}
            <ul className="space-y-0.5">
              {group.items.map((item) => (
                <li key={item.to}>
                  <NavLinkItem item={item} collapsed={collapsed} onNavigate={onNavigate} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </div>
  );
}

export function Sidebar() {
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggle = useUiStore((s) => s.toggleSidebar);
  return (
    <aside
      className={cn(
        'sticky top-0 z-30 hidden h-dvh print:hidden shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] lg:flex',
        collapsed ? 'w-[68px]' : 'w-[264px]',
      )}
    >
      <div className="min-h-0 flex-1">
        <SidebarContent collapsed={collapsed} />
      </div>
      <div className={cn('shrink-0 border-t border-sidebar-border p-3', collapsed && 'px-2')}>
        <button
          type="button"
          onClick={toggle}
          className={cn(
            'flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-[12.5px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            collapsed && 'justify-center px-0',
          )}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
        >
          {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          {!collapsed && 'Collapse'}
        </button>
      </div>
    </aside>
  );
}
