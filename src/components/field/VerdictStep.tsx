'use client';

import type { VerdictView } from '../../client/capture-client';
import { t, type Lang, type MessageKey } from '../../lib/i18n';
import { farmerLines, refusalCopy, type FarmerLine } from '../../lib/i18n/farmer-evidence';
import { EvidenceList } from '../ui/EvidenceList';
import { VerdictChip } from '../ui/VerdictChip';
import { VerdictScreen } from '../ui/VerdictScreen';
import { streamedResult } from './verdict-result';

// The verdict step (TSK-10.11): Verified (#s5), Needs a check (#s6) and Not accepted (the D5 template)
// on one VerdictScreen, with the farmer copy layer's evidence lines. "Couldn't send" (#s7) is
// SavedSheet (TKT-11).

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
        <EvidenceList tone="ok" label={tr('v.evidence.ok')} lines={farmerLines(streamedResult(result), lang, { plot: plotName })} />
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
          lines={farmerLines(streamedResult(result), lang, { plot: plotName })}
          small={tr('v.check.saved', { kg: kgText })}
        />
      </VerdictScreen>
    );
  }

  // Not accepted: a Rejected verdict, or a refusal at the boundary.
  let lines: FarmerLine[];
  if (result) lines = farmerLines(streamedResult(result), lang, { plot: plotName });
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
