import { lazy, Suspense } from 'react';
import { createBrowserRouter } from 'react-router';

const PublicSiteApp = lazy(() => import('@/features/website/public/site-app'));

/** Host mode: the whole app is one school's public website, served at the root. */
export function createSiteRouter(slug: string) {
  return createBrowserRouter([
    {
      path: '*',
      element: (
        <Suspense fallback={<div className="min-h-dvh bg-white" />}>
          <PublicSiteApp slug={slug} basePath="" />
        </Suspense>
      ),
    },
  ]);
}
