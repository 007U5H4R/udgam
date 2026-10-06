'use client';

import { useActionState, useEffect, useState } from 'react';
import { GlassCard } from '../../../../components/ui/GlassCard';
import { Pill } from '../../../../components/ui/Pill';
import { Sheet } from '../../../../components/ui/Sheet';
import { t } from '../../../../lib/i18n';
import { assignAction, issueCodeAction, revokeAction, unassignAction, type ActionState, type IssueState } from './actions';
import s from './phones.module.css';

// The interactive part of /admin/phones: per agent, "Issue code" (the code is shown once, with its expiry,
// and is gone after a reload), each phone with "Revoke" behind a confirm sheet that says it is permanent
// and recorded, and the agent's plots with remove / add. Dates arrive formatted in IST from the server.

export type Option = { id: string; label: string };
export type PhoneView = { id: string; enrolled: string; revoked: string | null; lastCapture: string | null };
export type AgentView = { id: string; name: string; email: string; phones: PhoneView[]; plots: Option[]; options: Option[] };

const IDLE: ActionState = { status: 'idle' };

// CR-100: useActionState rethrows a rejected action to the nearest error boundary. An action that never
// answered (the network dropped, the server failed) shows this page's own "That did not work … Nothing
// was changed." line instead, and the control stays usable.
const failed = <S,>(action: (prev: S, form: FormData) => Promise<S>, onFail: (form: FormData) => S) =>
  async (prev: S, form: FormData): Promise<S> => {
    try {
      return await action(prev, form);
    } catch {
      return onFail(form);
    }
  };
const ERROR: ActionState = { status: 'error' };
const safeIssue = failed<IssueState>(issueCodeAction, (form) => ({ status: 'error', agentId: String(form.get('agentId') ?? '') }));
const safeRevoke = failed<ActionState>(revokeAction, () => ERROR);
const safeAssign = failed<ActionState>(assignAction, () => ERROR);
const safeUnassign = failed<ActionState>(unassignAction, () => ERROR);

function ActionError({ state }: { state: ActionState }) {
  return (
    <p className={s.error} role="alert">
      {state.status === 'error' ? t('phones.error.action') : ''}
    </p>
  );
}

function IssueCode({ agent }: { agent: AgentView }) {
  const [state, action, pending] = useActionState<IssueState, FormData>(safeIssue, { status: 'idle' });
  const mine = state.status !== 'idle' && state.agentId === agent.id;
  return (
    <div className={s.issue}>
      <form action={action}>
        <input type="hidden" name="agentId" value={agent.id} />
        <Pill variant="ghost" type="submit" className={s.smallPill} disabled={pending} aria-busy={pending || undefined}>
          {pending ? t('phones.issuing') : t('phones.issue')}
        </Pill>
      </form>
      <div aria-live="polite">
        {mine && state.status === 'issued' ? (
          <div className={s.code} data-testid={`code-${agent.id}`}>
            <p className={s.codeFor}>{t('phones.codeFor', { agent: agent.name })}</p>
            <p className={s.codeValue} data-testid="issued-code">
              {state.code}
            </p>
            <p className={s.codeNote}>{t('phones.codeNote', { date: state.expires })}</p>
          </div>
        ) : null}
        {mine && state.status === 'error' ? (
          <p className={s.error} role="alert">
            {t('phones.error.action')}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function RevokeSheet({ phone, onClose }: { phone: PhoneView; onClose: () => void }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(safeRevoke, IDLE);
  useEffect(() => {
    if (state.status === 'done') onClose();
  }, [state, onClose]);
  const heading = `revoke-h-${phone.id}`;
  return (
    <Sheet open onClose={onClose} labelledBy={heading} tone="amber" testId="revoke-sheet">
      <h2 id={heading}>{t('phones.revokeTitle', { device: phone.id })}</h2>
      <p className={s.sheetBody}>{t('phones.revokeBody')}</p>
      <form action={action} className={s.sheetActions}>
        <input type="hidden" name="deviceId" value={phone.id} />
        <Pill variant="amber" type="submit" disabled={pending} aria-busy={pending || undefined}>
          {t('phones.revokeConfirm')}
        </Pill>
        <Pill variant="ghost" onClick={onClose}>
          {t('phones.cancel')}
        </Pill>
      </form>
      <ActionError state={state} />
    </Sheet>
  );
}

function Phones({ agent }: { agent: AgentView }) {
  const [revoking, setRevoking] = useState<PhoneView | null>(null);
  return (
    // DES-108: named with the agent too, so two agents' sections are distinct landmarks (axe landmark-unique)
    <section aria-labelledby={`agent-h-${agent.id} phones-h-${agent.id}`}>
      <h3 id={`phones-h-${agent.id}`} className={s.secH}>
        {t('phones.agentPhones')}
      </h3>
      {agent.phones.length === 0 ? (
        <p className={s.muted}>{t('phones.noPhones')}</p>
      ) : (
        <ul className={s.rows}>
          {agent.phones.map((p) => (
            <li key={p.id} className={s.row} data-testid={`phone-${p.id}`}>
              <div className={s.rowMain}>
                <span className={s.rowId}>{p.id}</span>
                <span className={s.rowMeta}>
                  {t('phones.enrolled', { date: p.enrolled })} · {p.lastCapture ? t('phones.lastCapture', { date: p.lastCapture }) : t('phones.noCapture')}
                  {p.revoked ? ` · ${t('phones.revoked', { date: p.revoked })}` : ''}
                </span>
              </div>
              {p.revoked ? (
                <span className={`${s.chip} ${s.chipBad}`}>{t('phones.revokedChip')}</span>
              ) : (
                <>
                  <span className={`${s.chip} ${s.chipOk}`}>{t('phones.activeChip')}</span>
                  <button type="button" className={s.textbtn} onClick={() => setRevoking(p)} aria-haspopup="dialog" aria-label={`${t('phones.revoke')} ${p.id}`}>
                    {t('phones.revoke')}
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {revoking ? <RevokeSheet phone={revoking} onClose={() => setRevoking(null)} /> : null}
    </section>
  );
}

function Plots({ agent }: { agent: AgentView }) {
  const [assignState, assign, assigning] = useActionState<ActionState, FormData>(safeAssign, IDLE);
  const [removeState, remove, removing] = useActionState<ActionState, FormData>(safeUnassign, IDLE);
  const selectId = `add-plot-${agent.id}`;
  return (
    <section aria-labelledby={`agent-h-${agent.id} plots-h-${agent.id}`}>
      <h3 id={`plots-h-${agent.id}`} className={s.secH}>
        {t('phones.plots')}
      </h3>
      {agent.plots.length === 0 ? (
        <p className={s.muted}>{t('phones.noPlots')}</p>
      ) : (
        <ul className={s.rows}>
          {agent.plots.map((p) => (
            <li key={p.id} className={s.row} data-testid={`assigned-${agent.id}-${p.id}`}>
              <span className={s.rowMain}>{p.label}</span>
              <form action={remove}>
                <input type="hidden" name="agentId" value={agent.id} />
                <input type="hidden" name="plotId" value={p.id} />
                <button type="submit" className={s.textbtn} disabled={removing} aria-label={t('phones.removeLabel', { plot: p.id, agent: agent.name })}>
                  {t('phones.remove')}
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
      <ActionError state={removeState} />
      {agent.options.length > 0 ? (
        <form action={assign} className={s.add}>
          <input type="hidden" name="agentId" value={agent.id} />
          <label htmlFor={selectId} className={s.label}>
            {t('phones.addPlot')}
          </label>
          <div className={s.addRow}>
            <select id={selectId} name="plotId" className={s.select} required defaultValue="">
              <option value="" disabled>
                {t('phones.choosePlot')}
              </option>
              {agent.options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
            <Pill variant="ghost" type="submit" className={s.smallPill} disabled={assigning} aria-busy={assigning || undefined}>
              {t('phones.assign')}
            </Pill>
          </div>
          <ActionError state={assignState} />
        </form>
      ) : null}
    </section>
  );
}

export function PhonesClient({ agents }: { agents: AgentView[] }) {
  return (
    <div className={s.list}>
      {agents.map((a) => (
        <GlassCard as="article" key={a.id} className={s.agent} aria-labelledby={`agent-h-${a.id}`} data-testid={`agent-${a.id}`}>
          <div className={s.agentHead}>
            <div>
              <h2 id={`agent-h-${a.id}`} className={s.agentName}>
                {a.name}
              </h2>
              <p className={s.muted}>{a.email}</p>
            </div>
            <IssueCode agent={a} />
          </div>
          <Phones agent={a} />
          <Plots agent={a} />
        </GlassCard>
      ))}
    </div>
  );
}
