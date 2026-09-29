import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { OriginTable } from '../../../../components/ui/OriginTable';
import { ProofPanel } from '../../../../components/ui/ProofPanel';
import { Timeline, type TimelineStep } from '../../../../components/ui/Timeline';
import { certCopy, istDay, istRange, kg1, kgShort } from '../../../../lib/certificate/copy';
import { FEED_ELEMENT_ID, serializeFeedForEmbed } from '../../../../lib/certificate/embed';
import { buildCertificateView, type CertificateView } from '../../../../lib/certificate/view-model';
import { getDbReady } from '../../../../lib/db/client';
import { resolveFeed } from '../../../../lib/ledger/feed';
import c from './certificate.module.css';
import { OriginMap } from './OriginMap';
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

/** The journey's words, from the feed's payloads (verify.html "4 · journey"). */
function journeySteps(view: CertificateView): TimelineStep[] {
  const j = certCopy.journey;
  return view.journey.map((step, i): TimelineStep => {
    switch (step.kind) {
      case 'harvested':
        return { key: `h${i}`, step: j.harvested, when: istRange(step.from, step.to), where: j.farmsIn(step.farmCount, view.headline.district) };
      case 'checked':
        return { key: `c${i}`, step: j.checked, when: j.pickings(step.pickings), where: j.checkedWhere };
      case 'batched':
        return { key: `b${i}`, step: j.batched, when: istDay(step.at), where: j.by(step.org) };
      case 'transferred':
        return { key: `t${i}`, step: j.handed, when: istDay(step.at), where: j.to(step.org) };
    }
  });
}

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

        <div className={c.where}>
          <section className={c.block} aria-labelledby="map-h">
            <h2 id="map-h">{certCopy.map.heading}</h2>
            <OriginMap view={view} />
          </section>
          <section className={c.block} aria-labelledby="tl-h" id="journey">
            <h2 id="tl-h">{certCopy.journey.heading}</h2>
            <Timeline steps={journeySteps(view)} className={c.glass} />
          </section>
        </div>

        <section className={c.block} aria-labelledby="origin-h">
          <h2 id="origin-h">{certCopy.origin.heading}</h2>
          <OriginTable
            className={c.glass}
            columns={[
              { key: 'region', label: certCopy.origin.region },
              { key: 'variety', label: certCopy.origin.variety },
              { key: 'farms', label: certCopy.origin.farms },
              { key: 'window', label: certCopy.origin.window },
              { key: 'quantity', label: certCopy.origin.quantity, numeric: true },
            ]}
            rows={[
              {
                region: view.headline.region,
                variety: view.headline.crop,
                farms: String(view.headline.farmCount),
                window: window ?? '',
                quantity: certCopy.origin.kgCherry(kg1(view.headline.quantityKg)),
              },
            ]}
          />
        </section>

        <footer className={c.siteFoot}>{certCopy.footer(view.batchId)}</footer>
      </main>

      <script type="application/json" id={FEED_ELEMENT_ID} dangerouslySetInnerHTML={{ __html: serializeFeedForEmbed(feed) }} />
    </div>
  );
}
