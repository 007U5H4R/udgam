import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getDbReady } from '../../../../../lib/db/client';
import { log } from '../../../../../lib/log';
import { errFields } from '../../../../_log/err-fields';
import { getProcessorBatch, listBuyers, listProcessorBatches, processorHeader, type ProcessorBatch } from '../../../../../lib/processing/read';
import { requireSession } from '../../../../_auth/require';
import { BatchDetail } from '../../BatchDetail';
import { forcedState, ProcessorScreen } from '../../ProcessorScreen';
import { pageTitle } from '../../../../../lib/page-title';

// /processor/batches/[batchId] — record a processing step, then hand on (TKT-26, TSK-26.5, contract.html
// screen 6). A batch this processor was never handed is a 404, exactly like an unknown one (EVAL-080).
export const dynamic = 'force-dynamic';
// DES-110: "<Screen> <ID> · Udgam", so two tabs or history entries can be told apart.
export async function generateMetadata({ params }: { params: Promise<{ batchId: string }> }): Promise<Metadata> {
  return { title: pageTitle('Batch', (await params).batchId) };
}

type Props = { params: Promise<{ batchId: string }>; searchParams?: Promise<Record<string, string | string[] | undefined>> };

export default async function ProcessorBatchPage(props: Props) {
  const me = await requireSession('processor');
  const { batchId } = await props.params;
  const forced = forcedState((await props.searchParams)?.state);

  let batches: ProcessorBatch[] | null = null;
  let batch: ProcessorBatch | null = null;
  let buyers: { id: string; name: string }[] = [];
  let names: { orgName: string | null; userName: string | null } = { orgName: null, userName: null };
  let failed = false;
  if (forced !== 'loading' && forced !== 'error') {
    try {
      const db = await getDbReady();
      [batches, batch, buyers, names] = await Promise.all([listProcessorBatches(db, me.orgId), getProcessorBatch(db, me.orgId, batchId), listBuyers(db), processorHeader(db, me.orgId, me.userId)]);
    } catch (err) {
      failed = true;
      log.error(errFields(err), 'processor.detail_load_failed');
    }
    if (!failed && !batch) notFound();
  }
  const state = forced ?? (failed || batches === null ? 'error' : 'working');
  return (
    <ProcessorScreen
      state={state}
      batches={state === 'working' ? (batches ?? []) : []}
      orgName={names.orgName}
      userName={names.userName}
      current={batchId}
      detail={batch ? <BatchDetail b={batch} orgName={names.orgName ?? ''} buyers={buyers} /> : null}
    />
  );
}
