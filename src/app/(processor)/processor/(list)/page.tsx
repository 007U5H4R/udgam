import type { Metadata } from 'next';
import { getDbReady } from '../../../../lib/db/client';
import { log } from '../../../../lib/log';
import { COPY } from '../../../../lib/processing/copy';
import { listProcessorBatches, processorHeader, type ProcessorBatch } from '../../../../lib/processing/read';
import { requireSession } from '../../../_auth/require';
import { forcedState, PickABatch, ProcessorScreen } from '../ProcessorScreen';

// /processor — the batches handed to this processor (TKT-26, TSK-26.5, contract.html screen 6 list): each
// with where it came from and its status (ready for a step · within range · flagged · handed on). At
// ≥ 1100 px the detail column asks to choose a batch; below that the list stands alone.
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: COPY.metaList };

type Props = { searchParams?: Promise<Record<string, string | string[] | undefined>> };

export default async function ProcessorListPage(props: Props = {}) {
  const me = await requireSession('processor');
  const forced = forcedState((await props.searchParams)?.state);

  let batches: ProcessorBatch[] | null = null; // null: failed to load
  let names: { orgName: string | null; userName: string | null } = { orgName: null, userName: null };
  if (forced !== 'loading' && forced !== 'error') {
    try {
      const db = await getDbReady();
      [batches, names] = await Promise.all([listProcessorBatches(db, me.orgId), processorHeader(db, me.orgId, me.userId)]);
    } catch (err) {
      log.error({ errClass: err instanceof Error ? err.constructor.name : typeof err }, 'processor.list_load_failed');
    }
  }
  const state = forced ?? (batches === null ? 'error' : batches.length === 0 ? 'empty' : 'working');
  return <ProcessorScreen state={state} batches={state === 'working' ? (batches ?? []) : []} orgName={names.orgName} userName={names.userName} detail={<PickABatch />} />;
}
