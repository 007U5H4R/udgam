'use client';

import type { VerdictView } from '../../client/capture-client';
import { t, type Lang, type MessageKey } from '../../lib/i18n';
import { farmerLines, refusalCopy, type FarmerLine } from '../../lib/i18n/farmer-evidence';
import type { VerifyResult } from '../../lib/verification/types';
import { EvidenceList } from '../ui/EvidenceList';
import { Pill } from '../ui/Pill';
import { Sheet } from '../ui/Sheet';
import { VerdictChip } from '../ui/VerdictChip';
import { VerdictScreen } from '../ui/VerdictScreen';
import { Ic } from './icons';

// The verdict step (TSK-10.11): Verified (#s5), Needs a check (#s6) and Not accepted (the D5 template)
// on one VerdictScreen, with the farmer copy layer's evidence lines; and the "saved on this phone"
// state when the send could not finish (the amber sheet of #s7; TKT-11 grows it into the full retry).

/** The streamed verdict as the copy layer reads it (the stream carries status and evidence per check). */
function asResult(v: VerdictView): VerifyResult {
  return {
    verdict: v.verdict,
    score: v.score,
    checks: v.checks.map((c) => ({ ...c, score: 0, weight: 1, hardFail: false })),
    unavailableProviders: [],
    capReasons: [],
    config: { version: '', hash: '' },
  };
}

function Kg({ kg }: { kg: string }) {
  return <b>{kg}</b>;
}

/** "Your 42.5 kg from Plot 1 is recorded." with the kg in bold. */
function Sub({ k, kg, plot, lang }: { k: MessageKey; kg: string; plot: string; lang: Lang }) {
  const [before, after = ''] = t(k, { plot, kg: '\u0000' }, lang).split('\u0000');
  return (
    <>
      {before}
      <Kg kg={kg} />
      {after}
    </>
  );
}

export function VerdictStep({
  result,
  refusal,
  lang,
  plotName,
  kg,
  motion,
  onDone,
}: {
  result?: VerdictView;
  /** A refusal at the boundary (4xx): Not accepted with what happened and what to do. */
  refusal?: { reason: string };
  lang: Lang;
  plotName: string;
  kg: number;
  motion: boolean;
  onDone: () => void;
}) {
  const tr = (k: MessageKey, v: Record<string, string | number> = {}) => t(k, v, lang);
  const kgText = tr('v.kg', { kg });
  const done = tr('v.done');

  if (result?.verdict === 'Verified') {
    return (
      <VerdictScreen
        tone="ok"
        motion={motion}
        heading={<span className="lit">{tr('verdict.verified')}</span>}
        sub={<Sub k="v.sub" kg={kgText} plot={plotName} lang={lang} />}
        doneLabel={done}
        onDone={onDone}
      >
        <EvidenceList tone="ok" label={tr('v.evidence.ok')} lines={farmerLines(asResult(result), lang, { plot: plotName })} />
      </VerdictScreen>
    );
  }

  if (result?.verdict === 'Needs Review') {
    return (
      <VerdictScreen
        tone="check"
        motion={false}
        status={<VerdictChip verdict="Needs Review" lang={lang} />}
        heading={tr('v.check.title')}
        doneLabel={done}
        onDone={onDone}
      >
        <EvidenceList
          tone="amber"
          label={tr('v.evidence.check')}
          lines={farmerLines(asResult(result), lang, { plot: plotName })}
          small={tr('v.check.saved', { kg: kgText })}
        />
      </VerdictScreen>
    );
  }

  // Not accepted: a Rejected verdict, or a refusal at the boundary.
  let lines: FarmerLine[];
  if (result) lines = farmerLines(asResult(result), lang, { plot: plotName });
  else {
    const c = refusalCopy(refusal?.reason ?? 'other', lang);
    lines = [
      { icon: 'seal', text: c.happened },
      { icon: 'check', text: c.todo, next: true },
    ];
  }
  return (
    <VerdictScreen
      tone="bad"
      motion={false}
      heading={<span className="bad-word">{tr('verdict.rejected')}</span>}
      sub={<Sub k="v.subBad" kg={kgText} plot={plotName} lang={lang} />}
      doneLabel={done}
      onDone={onDone}
    >
      <EvidenceList tone="bad" label={tr('v.evidence.bad')} lines={lines} />
    </VerdictScreen>
  );
}

/**
 * Could not send (#s7): the amber sheet over the weight screen says what happened and that nothing is
 * lost, with Try again (the identical saved copy) and Try later.
 */
export function SavedStep({
  cause,
  reason,
  retryAfterSec,
  lang,
  photos,
  kg,
  onRetry,
  onLater,
}: {
  cause: 'offline' | 'server';
  reason?: string;
  retryAfterSec?: number;
  lang: Lang;
  photos: number;
  kg: number;
  onRetry: () => void;
  onLater: () => void;
}) {
  const tr = (k: MessageKey, v: Record<string, string | number> = {}) => t(k, v, lang);
  const refusal = reason && reason !== 'no_fix' ? refusalCopy(reason, lang, { retryAfterSec }) : null;
  const title = refusal ? refusal.happened : reason === 'no_fix' ? tr('rec.noFix') : tr(cause === 'offline' ? 'rec.saved.offline' : 'rec.saved.server');
  const body =
    reason === 'no_fix'
      ? null
      : tr('rec.saved.body', { photos: photos === 1 ? tr('rec.photos1') : tr('rec.photosN', { n: photos }), kg: tr('v.kg', { kg }) });
  return (
    <main className="screen" aria-labelledby="saved-h">
      <h1 className="vh">{title}</h1>
      <Sheet open onClose={onLater} labelledBy="saved-h2" tone="amber" testId="saved-sheet">
        <h2 id="saved-h2">{title}</h2>
        {refusal ? <p>{refusal.todo}</p> : null}
        {body ? <p>{body}</p> : null}
        <Pill variant="amber" icon={<Ic name="retry" />} onClick={onRetry}>
          {tr('rec.saved.retry')}
        </Pill>
        <button className="textbtn" type="button" onClick={onLater}>
          <Ic name="clock" />
          {tr('rec.saved.later')}
        </button>
      </Sheet>
    </main>
  );
}
