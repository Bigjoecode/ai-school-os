import { withRouteErrors } from './route-error';
import { lazy, Suspense } from 'react';
import { createBrowserRouter } from 'react-router';

const PublicSiteApp = lazy(() => import('@/features/website/public/site-app'));
const LegalPage = lazy(() => import('@/features/legal/legal-page'));

/** Host mode: the whole app is one school's public website, served at the root. */
export function createSiteRouter(slug: string) {
  return createBrowserRouter(withRouteErrors([
    // The platform's privacy notice and other legal pages, linked from the site footer.
    {
      path: '/legal/:doc?',
      element: (
        <Suspense fallback={<div className="min-h-dvh bg-white" />}>
          <LegalPage />
        </Suspense>
      ),
    },
    {
      path: '*',
      element: (
        <Suspense fallback={<div className="min-h-dvh bg-white" />}>
          <PublicSiteApp slug={slug} basePath="" />
        </Suspense>
      ),
    },
  ]));
}
