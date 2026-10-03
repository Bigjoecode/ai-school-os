import type { Permission, PlatformArea } from '@aischool/shared';
import { Lock, ShieldOff } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, Navigate, useLocation } from 'react-router';
import { Page } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, NotInPlanState } from '@/components/ui/empty-state';
import { canOpenArea, hasFeature, hasPermission, useAuthStore, useIsSuperAdmin } from '@/lib/auth-store';

export function RequireAuth({ children }: { children: ReactNode }) {
  const status = useAuthStore((s) => s.status);
  const location = useLocation();
  if (status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  }
  return <>{children}</>;
}

export function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const status = useAuthStore((s) => s.status);
  if (status === 'authenticated') return <Navigate to="/" replace />;
  return <>{children}</>;
}

function NoAccess() {
  return (
    <Page>
      <EmptyState
        icon={Lock}
        title="You don't have access to this page"
        description="Ask a school admin to add the right permission to one of your roles."
        action={
          <Button asChild variant="outline">
            <Link to="/">Back to overview</Link>
          </Button>
        }
      />
    </Page>
  );
}

/** Allowed when the user has the permission (or any one of a list). */
export function RequirePermission({ permission, children }: { permission: Permission | Permission[]; children: ReactNode }) {
  const allowed = useAuthStore((s) => (Array.isArray(permission) ? permission : [permission]).some((p) => hasPermission(s.me, p)));
  return allowed ? <>{children}</> : <NoAccess />;
}

export function RequireSuperAdmin({ children }: { children: ReactNode }) {
  const allowed = useIsSuperAdmin();
  return allowed ? <>{children}</> : <NoAccess />;
}

/** A module the school's plan must include; otherwise a friendly "Not in your plan" page. */
export function RequireFeature({ feature, children }: { feature: string; children: ReactNode }) {
  const allowed = useAuthStore((s) => hasFeature(s.me, feature));
  if (allowed) return <>{children}</>;
  return (
    <Page>
      <Card>
        <NotInPlanState feature={feature} />
      </Card>
    </Page>
  );
}

function ConsoleNoAccess() {
  return (
    <Page>
      <Card>
        <EmptyState
          icon={ShieldOff}
          title="This part of the console isn’t for your role"
          description="Your platform role doesn’t include this area. Ask a super admin if you need it."
          action={
            <Button asChild variant="outline" size="sm">
              <Link to="/platform">Back to the console</Link>
            </Button>
          }
        />
      </Card>
    </Page>
  );
}

/** Platform staff only; with `area`, only the roles PLATFORM_AREAS lists for it; with `superAdmin`, only the super admin. */
export function RequirePlatform({ area, superAdmin, children }: { area?: PlatformArea; superAdmin?: boolean; children: ReactNode }) {
  const role = useAuthStore((s) => s.me?.user.platformRole ?? null);
  const allowed = useAuthStore((s) => (superAdmin ? s.me?.user.platformRole === 'SUPER_ADMIN' : area ? canOpenArea(s.me, area) : !!s.me?.user.platformRole));
  if (!role) return <NoAccess />;
  return allowed ? <>{children}</> : <ConsoleNoAccess />;
}
