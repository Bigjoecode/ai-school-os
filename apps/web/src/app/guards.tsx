import type { Permission } from '@aischool/shared';
import { Lock } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, Navigate, useLocation } from 'react-router';
import { Page } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { hasPermission, useAuthStore, useIsSuperAdmin } from '@/lib/auth-store';

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
