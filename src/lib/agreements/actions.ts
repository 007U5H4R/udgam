import type { Db } from '../db/client';
import { log } from '../log';
import { ChainError } from './chain';
import { FIELD_MESSAGES } from './format';
import { checkGrade, checkNewAgreement, type NewAgreementFields } from './form';
import { listFpoOrgs } from './read';
import { AgreementError, createAgreement, fundAgreement, gradeBatch, refundAgreement, type ServiceOptions } from './service';
import { settleBatch } from './settle';

// The agreement actions' logic (technical-plan TSK-25.7), called by the guarded Server Actions in
// src/app/(buyer)/buyer/agreements/actions.ts and src/app/(admin)/admin/agreements/actions.ts. Those
// wrappers call requireSession first and pass the session's org and user here: nothing org-scoped ever
// comes from the form. No next/* import (lib rule): the wrappers turn `notFound` into a 404 and `ok`
// into a redirect. Refusals become the screens' states (Design.md §28.6): field checks keep every value
// as typed; an action that did not go through says nothing moved.

export type Actor = { orgId: string; userId: string };

/** Why an action did not go through: the ledger did not answer, or turned the request away first. */
export type Failure = 'no_answer' | 'turned_away';

export type ActionState = {
  /** Field checks (same rules and words as the browser). */
  fieldErrors?: Partial<Record<string, string>>;
  /** Values as typed, so the form keeps them. */
  values?: Record<string, string>;
  failure?: Failure;
};

export type ActionOutcome = { ok: true; agreementId: string } | { ok: false; notFound: true } | { ok: false; notFound?: false; state: ActionState };

const text = (v: FormDataEntryValue | null): string => (typeof v === 'string' ? v.slice(0, 200) : '');

function failureOf(e: unknown, action: string): ActionOutcome {
  if (e instanceof AgreementError) {
    if (e.code === 'not_found') return { ok: false, notFound: true };
    // A stale screen (already funded, deadline moved past, no grade yet…): nothing moved; the page reloads.
    log.info({ action, code: e.code }, 'agreements.action_refused');
    return { ok: false, state: { failure: e.code === 'bad_signature' ? 'turned_away' : 'no_answer' } };
  }
  if (e instanceof ChainError) {
    log.warn({ action, kind: e.kind, reason: e.reason }, 'agreements.chain_failed');
    return { ok: false, state: { failure: e.kind } };
  }
  throw e;
}

export async function createFromForm(db: Db, me: Actor, form: FormData, o: ServiceOptions = {}): Promise<ActionOutcome> {
  const fields: NewAgreementFields = {
    fpo: text(form.get('fpo')),
    crop: text(form.get('crop')),
    kg: text(form.get('kg')),
    minGrade: text(form.get('minGrade')),
    amount: text(form.get('amount')),
    deadline: text(form.get('deadline')),
  };
  const fpos = (await listFpoOrgs(db)).map((f) => f.id);
  const check = checkNewAgreement(fields, fpos, (o.now ?? (() => new Date()))());
  if (!check.ok) return { ok: false, state: { fieldErrors: check.errors, values: fields } };
  try {
    const { agreementId } = await createAgreement(db, { buyerOrg: me.orgId, userId: me.userId, values: check.values }, o);
    return { ok: true, agreementId };
  } catch (e) {
    if (e instanceof AgreementError && e.code === 'not_fpo') return { ok: false, state: { fieldErrors: { fpo: FIELD_MESSAGES.fpoNeeded }, values: fields } };
    const out = failureOf(e, 'create');
    return 'state' in out ? { ...out, state: { ...out.state, values: fields } } : out;
  }
}

export async function fundFromForm(db: Db, me: Actor, form: FormData, o: ServiceOptions = {}): Promise<ActionOutcome> {
  const agreementId = text(form.get('agreementId'));
  try {
    await fundAgreement(db, { buyerOrg: me.orgId, userId: me.userId, agreementId }, o);
    return { ok: true, agreementId };
  } catch (e) {
    return failureOf(e, 'fund');
  }
}

export async function refundFromForm(db: Db, me: Actor, form: FormData, o: ServiceOptions = {}): Promise<ActionOutcome> {
  const agreementId = text(form.get('agreementId'));
  try {
    await refundAgreement(db, { buyerOrg: me.orgId, userId: me.userId, agreementId }, o);
    return { ok: true, agreementId };
  } catch (e) {
    return failureOf(e, 'refund');
  }
}

export async function gradeFromForm(db: Db, me: Actor, form: FormData, o: ServiceOptions = {}): Promise<ActionOutcome> {
  const agreementId = text(form.get('agreementId'));
  const batchId = text(form.get('batchId'));
  const raw = text(form.get('grade'));
  const check = checkGrade(raw);
  if (!check.ok) return { ok: false, state: { fieldErrors: check.errors, values: { grade: raw } } };
  try {
    await gradeBatch(db, { buyerOrg: me.orgId, userId: me.userId, agreementId, batchId, grade: check.values }, o);
    return { ok: true, agreementId };
  } catch (e) {
    const out = failureOf(e, 'grade');
    return 'state' in out ? { ...out, state: { ...out.state, values: { grade: raw } } } : out;
  }
}

export async function settleFromForm(db: Db, me: Actor, form: FormData, o: ServiceOptions = {}): Promise<ActionOutcome> {
  const agreementId = text(form.get('agreementId'));
  const batchId = text(form.get('batchId'));
  try {
    await settleBatch(db, { fpoOrg: me.orgId, userId: me.userId, agreementId, batchId }, o);
    return { ok: true, agreementId };
  } catch (e) {
    return failureOf(e, 'settle');
  }
}
