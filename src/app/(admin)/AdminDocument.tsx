'use client';

import { useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { needsAdminDocument } from '../../lib/security/admin-path';

// The admin pages run only in a document loaded as an admin page (TASK-20 fix round 2, review N1). A CSP
// belongs to the document, and only admin documents allow the map-tile host. Sign-in already loads the
// admin in full; this catches any other way in by client navigation (a Link or a redirect from a public,
// field or buyer page): the page is not rendered in the wrong document, it is reloaded as its own.

const noSubscribe = () => () => undefined;

/** The URL the current document was loaded at (history.pushState never changes it). */
function documentUrl(): string | undefined {
  const [nav] = performance.getEntriesByType('navigation');
  return nav?.name;
}

const needsReload = () => needsAdminDocument(documentUrl());

export function AdminDocument({ children }: { children: ReactNode }) {
  // The server render (and hydration of a full admin load) is always fine; only a client-side mount
  // inside another page's document is not.
  const reload = useSyncExternalStore(noSubscribe, needsReload, () => false);
  useEffect(() => {
    if (reload) window.location.reload();
  }, [reload]);
  return reload ? null : children;
}
