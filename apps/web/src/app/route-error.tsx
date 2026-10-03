import { RefreshCw, TriangleAlert } from 'lucide-react';
import { useEffect } from 'react';
import { isRouteErrorResponse, useRouteError, type RouteObject } from 'react-router';
import { Button } from '@/components/ui/button';

const RELOAD_KEY = 'ais:stale-build-reload';

/** A page's code file is gone: the tab was opened before a deploy replaced it. */
export function isStaleBuildError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS/i.test(msg);
}

/**
 * Reloads to fetch the new version, at most once a minute so a real outage
 * can't cause a reload loop. Returns false when it already tried.
 */
export function reloadForNewVersion(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
    if (Date.now() - last < 60_000) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    // Storage blocked: reload anyway; the browser cache now has the new shell.
  }
  window.location.reload();
  return true;
}

/** Shown instead of a developer stack trace when a route fails. */
export function RouteError() {
  const error = useRouteError();
  const stale = isStaleBuildError(error);
  useEffect(() => {
    if (stale) reloadForNewVersion();
  }, [stale]);

  const notFound = isRouteErrorResponse(error) && error.status === 404;
  return (
    <div className="grid min-h-dvh place-items-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-soft">
        <span className="mx-auto grid size-12 place-items-center rounded-xl bg-warning-soft text-warning">
          {stale ? <RefreshCw className="size-5 animate-spin" /> : <TriangleAlert className="size-5" />}
        </span>
        <h1 className="mt-4 font-display text-[20px] font-semibold tracking-tight">
          {stale ? 'Updating to the latest version…' : notFound ? 'Page not found' : 'Something went wrong'}
        </h1>
        <p className="mt-2 text-[14px] text-muted-foreground">
          {stale
            ? 'AI School OS was just updated. Reloading the page.'
            : notFound
              ? 'This page doesn’t exist or has moved.'
              : 'An unexpected error stopped this page from loading. Reloading usually fixes it; if it doesn’t, the team has been notified.'}
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Button onClick={() => window.location.reload()}>
            <RefreshCw /> Reload
          </Button>
          <Button variant="outline" onClick={() => window.location.assign('/')}>
            Go to home
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Gives every top-level route the friendly error page. */
export const withRouteErrors = (routes: RouteObject[]): RouteObject[] => routes.map((r) => ({ errorElement: <RouteError />, ...r }));
