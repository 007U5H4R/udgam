// DES-002 (EXE40): no service worker, so a page the phone has not loaded cannot open offline, and a
// failed client navigation makes Next fall back to a full page load: the browser's own "No internet"
// page replaces the app. So, while the phone reports no network, the app never navigates: it stays on
// the screen it has and shows the saved-on-phone sheet (OfflineSheet) instead.

/** The window event that opens the offline sheet. */
export const OFFLINE_EVENT = 'udgam:offline';

/** The phone says it has no network (navigator.onLine is false). */
export const isOffline = (): boolean => typeof navigator !== 'undefined' && navigator.onLine === false;

/** Open the offline sheet (mounted once by the (agent) layout). */
export function showOffline(): void {
  window.dispatchEvent(new Event(OFFLINE_EVENT));
}

/** Navigate with `go` when the phone has a network; otherwise show the offline sheet. True when `go` ran. */
export function whenOnline(go: () => void): boolean {
  if (isOffline()) {
    showOffline();
    return false;
  }
  go();
  return true;
}
