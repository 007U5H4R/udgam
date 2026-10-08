'use client';

import type { ReactNode } from 'react';
import { certCopy } from '../../lib/certificate/copy';
import { CertIcon, CertMark, type CertMarkKind } from './CertIcon';
import { useProofState, type ProofUiState } from './proof-state';
import s from './EntryList.module.css';

// The certificate's harvest entries (verify.html "6 · harvest entries"): number, date, farm, kilograms and
// a verdict chip per picking, with up to three evidence lines and "See all checks" for the rest, and an
// office decision's reason as text. The chip follows the visitor's own proof check (proof-state.ts):
// "Checking" while it runs; the recorded verdict (word + mark) once the proof is verified; "Not
// confirmed" after a mismatch, and "Does not match" on the picking whose record failed. No green renders
// before the proof is verified, and none after a mismatch.

export type EntryRow = {
  n: number;
  eventId: string;
  date: string;
  farm: string;
  kg: string;
  /** The recorded verdict: its farmer-facing word (D5) and mark. */
  verdict: { word: string; mark: 'ok' | 'check' | 'bad' };
  evidence: string[];
  override?: { word: string; reason: string };
  /** Ledger seqs of the picking's records (a mismatch naming one flags the entry). */
  seqs: number[];
};

const SHOWN = 3;

function chipFor(state: ProofUiState, row: EntryRow): { kind: CertMarkKind; word: string; cls: string; flag: boolean } {
  if (state.status === 'verified') return { kind: row.verdict.mark, word: row.verdict.word, cls: s[row.verdict.mark]!, flag: false };
  if (state.status === 'mismatch') {
    const seq = state.failure.seq;
    if (seq !== undefined && row.seqs.includes(seq)) return { kind: 'bad', word: certCopy.entries.doesNotMatch, cls: s.bad!, flag: true };
    return { kind: 'wait', word: certCopy.entries.notConfirmed, cls: s.plain!, flag: false };
  }
  if (state.status === 'unavailable') return { kind: 'wait', word: certCopy.entries.notConfirmed, cls: s.plain!, flag: false };
  return { kind: 'wait', word: certCopy.entries.checking, cls: s.plain!, flag: false };
}

function Chip({ c }: { c: ReturnType<typeof chipFor> }) {
  return (
    <span className={`${s.vchip} ${c.cls} vchip`} data-chip={c.kind}>
      <CertMark kind={c.kind} className={s.mk} />
      {c.word}
    </span>
  );
}

function Evidence({ row }: { row: EntryRow }): ReactNode {
  const first = row.evidence.slice(0, SHOWN);
  const rest = row.evidence.slice(SHOWN);
  return (
    <>
      {row.override ? (
        <p className={s.ov} data-testid="override-reason">
          <b>{certCopy.entries.override(row.override.word)}</b> · {certCopy.entries.reason}: <bdi>{row.override.reason}</bdi>
        </p>
      ) : null}
      <ul className={s.ev} data-testid="evidence">
        {first.map((e, i) => (
          <li key={i}>{e}</li>
        ))}
      </ul>
      {rest.length > 0 ? (
        <details className={s.more}>
          {/* DES-205: a chevron, not colour alone, marks the disclosure; DES-218: its words follow its state */}
          <summary>
            <span className={s.whenClosed}>{certCopy.entries.seeAll(rest.length)}</span>
            <span className={s.whenOpen}>{certCopy.entries.hideChecks}</span>
            <CertIcon name="chevron" className={s.chev} />
          </summary>
          <ul className={s.ev}>
            {rest.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </>
  );
}

export function EntryList({ rows, totalKg }: { rows: EntryRow[]; totalKg: string }) {
  const state = useProofState();
  const e = certCopy.entries;
  return (
    <>
      <ol className={`${s.list} e-list`} aria-label={e.listLabel(rows.length)}>
        {rows.map((row) => {
          const c = chipFor(state, row);
          return (
            <li key={row.eventId} className={c.flag ? s.flag : undefined} data-event={row.eventId} data-flag={c.flag || undefined}>
              <span className={s.n}>{row.n}</span>
              <span className={s.d}>{row.date}</span>
              <span className={s.kg}>{e.kg(row.kg)}</span>
              <span className={s.f}>{certCopy.map.farm(row.farm)}</span>
              <span className={s.v}>
                <Chip c={c} />
              </span>
              <div className={s.e}>
                <Evidence row={row} />
              </div>
            </li>
          );
        })}
      </ol>
      <p className={s.total}>
        <span>{e.total}</span>
        <span>{e.kg(totalKg)}</span>
      </p>
      <div className={`${s.tableCard} e-table-wrap`}>
        <table className={`${s.table} e-table`}>
          <thead>
            <tr>
              <th scope="col">{e.number}</th>
              <th scope="col">{e.date}</th>
              <th scope="col">{e.farm}</th>
              <th scope="col" className={s.num}>
                {e.cherry}
              </th>
              <th scope="col" className={s.num}>
                {e.check}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.flatMap((row) => {
              const c = chipFor(state, row);
              const flag = c.flag ? ` ${s.flag}` : '';
              return [
                <tr key={row.eventId} className={`${s.head}${flag}`} data-event={row.eventId} data-flag={c.flag || undefined}>
                  <td>{row.n}</td>
                  <td>{row.date}</td>
                  <td>{certCopy.map.farm(row.farm)}</td>
                  <td className={s.num}>{e.kg(row.kg)}</td>
                  <td className={s.num}>
                    <Chip c={c} />
                  </td>
                </tr>,
                <tr key={`${row.eventId}-ev`} className={`${s.evRow}${flag}`}>
                  <td />
                  <td colSpan={4}>
                    <Evidence row={row} />
                  </td>
                </tr>,
              ];
            })}
          </tbody>
          <tfoot>
            <tr>
              <td />
              <td>{e.total}</td>
              <td />
              <td className={s.num}>{e.kg(totalKg)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}
