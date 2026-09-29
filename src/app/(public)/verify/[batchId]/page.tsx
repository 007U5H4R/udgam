import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ProofPanel } from '../../../../components/ui/ProofPanel';
import { certCopy, istRange, kgShort } from '../../../../lib/certificate/copy';
import { FEED_ELEMENT_ID, serializeFeedForEmbed } from '../../../../lib/certificate/embed';
import { buildCertificateView } from '../../../../lib/certificate/view-model';
import { getDbReady } from '../../../../lib/db/client';
import { resolveFeed } from '../../../../lib/ledger/feed';
import c from './certificate.module.css';
import { SiteHeader } from './SiteHeader';
import './certificate-state.css';

// /verify/[batchId]?h= — the public certificate (technical-plan §8.4, TP16, TKT-16). Server-rendered from
// the proof feed alone: resolveFeed (the same function GET /api/verify uses, so an unknown batch, a
// missing `h` and a wrong `h` are the same 404 here too, TP8) and every displayed fact from
// buildCertificateView(feed). The feed is embedded as a JSON data block for the visitor's browser to
// verify (no second fetch, S4). Dynamic: every page carries its own CSP nonce (src/proxy.ts).

export const dynamic = 'force-dynamic';

type SearchParams = Record<string, string | string[] | undefined>;
type Props = { params: Promise<{ batchId: string }>; searchParams: Promise<SearchParams> };

/** The first value of a query parameter (`?h=a&h=b` reads `a`, as URLSearchParams.get does in the API route). */
const first = (v: string | string[] | undefined): string | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

// Public per batch, not for search (§8.4). Static, so the not-found answers stream identically (TP8);
// TKT-17 turns this into generateMetadata with the link-preview (OG/Twitter) tags.
export const metadata: Metadata = { title: 'Certificate · Udgam', robots: { index: false, follow: false } };

export default async function CertificatePage({ params, searchParams }: Props) {
  const { batchId } = await params;
  const sp = await searchParams;
  const feed = await resolveFeed(await getDbReady(), batchId, first(sp.h));
  if (!feed) notFound();
  const view = buildCertificateView(feed);
  const window = view.harvestWindow ? istRange(view.harvestWindow.from, view.harvestWindow.to) : null;

  return (
    <div className={c.page}>
      <SiteHeader />

      <main className={c.wrap}>
        <div className={c.hero}>
          <div className={c.proofCol}>
            <ProofPanel entryCount={view.entryCount} batchId={view.batchId} />
          </div>
          <section className={c.intro} aria-labelledby="h1">
            <p className={c.eyebrow}>{certCopy.eyebrow(view.batchId)}</p>
            <h1 className={c.h1} id="h1">
              {certCopy.headline(kgShort(view.headline.quantityKg), view.headline.crop, view.headline.farmCount, view.headline.district)}
            </h1>
            <p className={c.meta}>{certCopy.meta(view.headline.region, window)}</p>
          </section>
        </div>
        <footer className={c.siteFoot}>{certCopy.footer(view.batchId)}</footer>
      </main>

      <script type="application/json" id={FEED_ELEMENT_ID} dangerouslySetInnerHTML={{ __html: serializeFeedForEmbed(feed) }} />
    </div>
  );
}
