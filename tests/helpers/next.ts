// Test-only: read what a server component, layout or action did through Next's control-flow errors
// (redirect() and notFound() throw errors whose `digest` names the outcome).

export type Outcome<T> = { rendered: T } | { redirect: string } | { notFound: true } | { threw: unknown };

export async function outcome<T>(fn: () => Promise<T> | T): Promise<Outcome<T>> {
  try {
    return { rendered: await fn() };
  } catch (err) {
    const digest = (err as { digest?: unknown } | null)?.digest;
    if (typeof digest === 'string') {
      // NEXT_REDIRECT;<type>;<url>;<status>;
      if (digest.startsWith('NEXT_REDIRECT;')) return { redirect: digest.split(';')[2]! };
      if (digest === 'NEXT_HTTP_ERROR_FALLBACK;404') return { notFound: true };
    }
    return { threw: err };
  }
}
