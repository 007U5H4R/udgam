// The office page title (DES-110, WCAG 2.4.2): "<Screen> <ID> · Udgam", one pattern for admin, buyer and
// processor. A detail's ID comes from its URL, so it is trimmed and capped: an unknown or odd segment still
// gives a readable tab (the page itself answers 404).
const MAX_ID = 40;

export function pageTitle(screen: string, id?: string): string {
  const raw = (id ?? '').trim();
  const shown = raw.length > MAX_ID ? `${raw.slice(0, MAX_ID)}…` : raw;
  return shown ? `${screen} ${shown} · Udgam` : `${screen} · Udgam`;
}
