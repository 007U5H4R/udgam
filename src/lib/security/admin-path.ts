// The admin pages and their document policy (TSK-19.5, TASK-20 fix rounds 1–2). No imports: the admin
// layout's client guard uses this as well as the proxy.

/**
 * The admin pages (`/admin`, `/admin/…`): the only ones whose policy allows map tiles (§16 "tile hosts
 * allow-listed on admin pages only"). Only the plot pages draw a map, but a CSP belongs to the document:
 * the admin Rail and "Add plot" are client navigations that keep the policy of whichever admin page was
 * loaded first, so every admin document must carry the tile host (TASK-20 fix round 1, candidate EXE;
 * §22 TSK-19.5 said "only /admin/plots*"). Field, buyer and public pages never get it.
 */
export function isAdminPath(pathname: string): boolean {
  return pathname === '/admin' || pathname.startsWith('/admin/');
}

/**
 * Whether an admin page is being shown inside a document that was loaded at a non-admin path, and so
 * runs under that page's policy (no tile host): true when `documentUrl` (the URL the current document
 * was loaded at, `performance.getEntriesByType('navigation')[0].name`) is not an admin path. Unknown or
 * unreadable → false, so a missing entry can never cause a reload loop (TASK-20 fix round 2, N1).
 */
export function needsAdminDocument(documentUrl: string | undefined): boolean {
  if (!documentUrl) return false;
  try {
    return !isAdminPath(new URL(documentUrl).pathname);
  } catch {
    return false;
  }
}
