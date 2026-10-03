import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { Providers } from './app/providers';
import { detectWebsiteHost } from './features/website/public/host';
import { reloadForNewVersion } from './app/route-error';
import { initTheme } from './lib/theme';
import './index.css';

initTheme();

// After a deploy, a tab opened earlier may ask for code files that were replaced: reload once to get the new version.
window.addEventListener('vite:preloadError', (event) => {
  if (reloadForNewVersion()) event.preventDefault();
});

const root = createRoot(document.getElementById('root')!);

// A school's own website domain renders its public site at the root; anything else is the portal.
void detectWebsiteHost().then(async (slug) => {
  if (slug) {
    const { createSiteRouter } = await import('./app/site-router');
    root.render(
      <StrictMode>
        <Providers publicOnly>
          <RouterProvider router={createSiteRouter(slug)} />
        </Providers>
      </StrictMode>,
    );
    return;
  }
  const { router } = await import('./app/router');
  root.render(
    <StrictMode>
      <Providers>
        <RouterProvider router={router} />
      </Providers>
    </StrictMode>,
  );
});
