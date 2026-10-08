import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { preload } from 'react-dom';
import { AttestationLine } from '../../../../components/ui/AttestationLine';
import { BatchQr } from '../../../../components/ui/BatchQr';
import { CertIcon } from '../../../../components/ui/CertIcon';
import { EntryList, type EntryRow } from '../../../../components/ui/EntryList';
import { OriginTable } from '../../../../components/ui/OriginTable';
import { ProofPanel } from '../../../../components/ui/ProofPanel';
import { Timeline, type TimelineStep } from '../../../../components/ui/Timeline';
import { certCopy, istDay, istRange, istToday, kgShort, publicEvidence } from '../../../../lib/certificate/copy';
import { kg1 } from '../../../../lib/format';
import { FEED_ELEMENT_ID, serializeFeedForEmbed } from '../../../../lib/certificate/embed';
import { resolveDevState } from '../../../../lib/certificate/dev-state';
import { tamperedFeed, tamperFromSearchParams } from '../../../../lib/certificate/test-mode';
import { buildCertificateView, type CertificateView, type EntryVerdict } from '../../../../lib/certificate/view-model';
import { env } from '../../../../lib/config/env';
import { getDbReady } from '../../../../lib/db/client';
import { resolveFeed } from '../../../../lib/ledger/feed';
import { LEDGER_KEY_URL } from '../../../../lib/ledger/proof';
import { publishedKeys } from '../../../../lib/ledger/keys';
import c from './certificate.module.css';
import { certificateMetadata, GENERIC_METADATA } from './link-preview';
import { OriginMap } from './OriginMap';
import { PrintButton } from './PrintButton';
import { SiteHeader } from './SiteHeader';
import './certificate-state.css';
import './print.css';

// /verify/[batchId]?h= — the public certificate (technical-plan §8.4, TP16, TKT-16). Server-rendered from
// the proof feed alone: resolveFeed (the same function GET /api/verify uses, so an unknown batch, a
// missing `h` and a wrong `h` are the same 404 here too, TP8) and every displayed fact from
// buildCertificateView(feed). The feed is embedded as a JSON data block for the visitor's browser to
// verify (no second fetch, S4). Dynamic: every page carries its own CSP nonce (src/proxy.ts).

export const dynamic = 'force-dynamic';

/** DES-207: past this many entries the headline carries a link down to the files and the limits. */
const LONG_BATCH = 10;

type SearchParams = Record<string, string | string[] | undefined>;
type Props = { params: Promise<{ batchId: string }>; searchParams: Promise<SearchParams> };

/** The first value of a query parameter (`?h=a&h=b` reads `a`, as URLSearchParams.get does in the API route). */
const first = (v: string | string[] | undefined): string | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

/**
 * The batch's genuine feed, or null (unknown batch, missing h, wrong h: TP8). React's request cache lets
 * generateMetadata and the page share one feed build (and one on-demand checkpoint) per request.
 */
const genuineFeed = cache(async (batchId: string, h: string | null) => resolveFeed(await getDbReady(), batchId, h));

// TSK-17.5 (TC-072, EVAL-090): the link-preview metadata — title, description, canonical, OG and Twitter
// tags with the batch's og image (DES-202), absolute from PUBLIC_BASE_URL — from the genuine feed's view model (TP16).
// Public per batch, not for search: noindex, nofollow (§8.4). A link that resolves to no batch gets the
// same generic metadata whatever the reason, so the not-found answers stay identical (TP8).
export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { batchId } = await params;
  const feed = await genuineFeed(batchId, first((await searchParams).h));
  return feed ? certificateMetadata(buildCertificateView(feed), env.PUBLIC_BASE_URL) : GENERIC_METADATA;
}

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
        return step.toProcessorWithoutStep
          ? { key: `t${i}`, step: j.handedProcessor, when: istDay(step.at), where: j.to(step.org), flag: j.noStep }
          : { key: `t${i}`, step: j.handed, when: istDay(step.at), where: j.to(step.org) };
      case 'processed':
        return {
          key: `p${i}`,
          step: j.processed[step.process] ?? j.processedFallback,
          when: istDay(step.at),
          where: j.at(step.processor, step.inputKg, step.outputKg, step.ratio),
          ...(step.status === 'flag' ? { flag: j.flagged(step.band[0], step.band[1], j.processWords[step.process] ?? step.process, step.placeholder) } : {}),
        };
    }
  });
}

/** Farmer-facing verdict words (D5) and their marks: the system states stay Verified | Needs Review | Rejected. */
const VERDICT: Record<EntryVerdict, EntryRow['verdict']> = {
  Verified: { word: 'Verified', mark: 'ok' },
  'Needs Review': { word: 'Needs a check', mark: 'check' },
  Rejected: { word: 'Not accepted', mark: 'bad' },
};

function entryRows(view: CertificateView): EntryRow[] {
  return view.entries.map((e) => ({
    n: e.n,
    eventId: e.eventId,
    date: istDay(e.capturedAt),
    farm: e.producerId,
    kg: kg1(e.kg),
    verdict: VERDICT[e.verdict],
    evidence: e.evidence.map(publicEvidence),
    ...(e.override ? { override: { word: VERDICT[e.override.verdict].word, reason: e.override.reason } } : {}),
    seqs: e.seqs,
  }));
}

export default async function CertificatePage({ params, searchParams }: Props) {
  const { batchId } = await params;
  const sp = await searchParams;
  const genuine = await genuineFeed(batchId, first(sp.h));
  if (!genuine) notFound();
  // Test-only (E2E=1, never in a deployment): embed a forged copy so e2e can watch the browser catch it.
  const tamper = tamperFromSearchParams(sp, env);
  const feed = tamper ? await tamperedFeed(genuine, (await publishedKeys()).keys, tamper) : genuine;
  // S4: the browser starts fetching the ledger key with the page, not after hydration (ProofPanel reuses it).
  preload(LEDGER_KEY_URL, { as: 'fetch', crossOrigin: 'anonymous' });
  const view = buildCertificateView(feed);
  const harvestRange = view.harvestWindow ? istRange(view.harvestWindow.from, view.harvestWindow.to) : null;

  return (
    <div className={c.page}>
      <SiteHeader />

      <main className={c.wrap}>
        <div className={c.hero}>
          <div className={c.proofCol}>
            <ProofPanel entryCount={view.entryCount} batchId={view.batchId} forced={resolveDevState(sp, env)} />
          </div>
          <section className={c.intro} aria-labelledby="h1">
            <p className={c.eyebrow}>{certCopy.eyebrow(view.batchId)}</p>
            <h1 className={c.h1} id="h1">
              {certCopy.headline(kgShort(view.headline.quantityKg), view.headline.crop, view.headline.farmCount, view.headline.district)}
            </h1>
            <p className={c.meta}>{certCopy.meta(view.headline.region, harvestRange)}</p>
            {/* DES-207: a long batch puts the files and the limits thousands of pixels down; one link reaches them */}
            {view.entries.length > LONG_BATCH ? (
              <p className={c.skip} data-screen-only>
                <a href="#dl-block">{certCopy.files.skip}</a>
              </p>
            ) : null}
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
                window: harvestRange ?? '',
                quantity: certCopy.origin.kgCherry(kg1(view.headline.quantityKg)),
              },
            ]}
          />
        </section>

        <section className={c.block} aria-labelledby="entries-h">
          <h2 id="entries-h">
            {certCopy.entries.heading} <span className={c.muted}>({view.entries.length})</span>
          </h2>
          <div className={c.glass}>
            <EntryList rows={entryRows(view)} totalKg={kg1(view.headline.quantityKg)} />
          </div>
        </section>

        <div className={c.bottomGrid}>
          {view.organic ? (
            <section className={c.block} aria-labelledby="org-h">
              <h2 id="org-h">{certCopy.organic.heading}</h2>
              <div className={`${c.glass} ${c.organic}`}>
                <CertIcon name="seal" className={c.ic} />
                <div className={c.organicText}>
                  <AttestationLine issuer={view.organic.issuer} validFrom={view.organic.validFrom} validTo={view.organic.validTo} today={istToday(new Date())} />
                  <p className={c.muted}>
                    {view.organic.allPlots ? null : `${certCopy.organic.partOf(view.organic.plotIds.map((id) => certCopy.map.farm(view.plots.find((p) => p.plotId === id)?.producerId ?? id)).join(', '))} `}
                    {certCopy.organic.notChecked}
                  </p>
                </div>
              </div>
            </section>
          ) : (
            // DES-214: "none on record" is said, so it cannot be mistaken for "not shown"
            <section className={c.block} aria-labelledby="org-h">
              <h2 id="org-h">{certCopy.organic.heading}</h2>
              <div className={`${c.glass} ${c.organic}`} data-testid="organic-none">
                <CertIcon name="seal" className={c.ic} />
                <p className={c.organicText}>{certCopy.organic.none}</p>
              </div>
            </section>
          )}
          <section className={c.block} id="dl-block" aria-labelledby="dl-h">
            <h2 id="dl-h">{certCopy.files.heading}</h2>
            {/* DES-215: shown only in mismatch (certificate.module.css), beside files that come from the unconfirmed page */}
            <p className={c.filesNote} data-testid="files-unconfirmed">
              {certCopy.files.unconfirmed}
            </p>
            <div className={c.downloads}>
              <a className={c.pill} id="geojson" href={`/api/verify/${encodeURIComponent(view.batchId)}/geojson?h=${view.shortHash}`} download={`udgam-${view.batchId}-eudr.geojson`}>
                <CertIcon name="download" className={c.ic} />
                {certCopy.files.geojson}
              </a>
              <PrintButton label={certCopy.files.print} />
            </div>
          </section>
        </div>

        {/* DES-203 (EXE40): on paper, the QR code and URL that lead back to this live check (print.css shows it). */}
        <div className={c.printOnly} data-print-only data-testid="print-qr">
          <BatchQr batchId={view.batchId} shortHash={genuine.shortHash} />
        </div>

        <section className={`${c.block} ${c.limits}`} id="limits" aria-labelledby="limits-h">
          <h2 id="limits-h">{certCopy.limits.heading}</h2>
          <p data-limit="trust">{certCopy.limits.trust}</p>
          <p data-limit="gps">{certCopy.limits.gps}</p>
          <p data-limit="photos">{certCopy.limits.photos}</p>
          <p data-limit="salami">{certCopy.limits.salami}</p>
          <p data-limit="clearing">{certCopy.limits.clearing}</p>
          <p data-limit="declared">{certCopy.limits.declared}</p>
        </section>

        <footer className={c.siteFoot}>{certCopy.footer(view.batchId)}</footer>
      </main>

      <script type="application/json" id={FEED_ELEMENT_ID} dangerouslySetInnerHTML={{ __html: serializeFeedForEmbed(feed) }} />
    </div>
  );
}
