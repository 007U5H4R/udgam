'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { getDevice } from '../../client/device-key';
import type { HelpInfo } from '../../lib/db/queries/field-help';
import { t, type Lang, type MessageKey } from '../../lib/i18n';
import { Pill } from '../ui/Pill';
import pill from '../ui/Pill.module.css';
import { Sheet } from '../ui/Sheet';
import { VerdictChip } from '../ui/VerdictChip';
import { istDayMonth, telHref } from './format';
import { Ic } from './icons';

// The Help sheet (final/index.html #help-dialog, lines 685–692; TSK-11.6, TC-053, Design.md §5): what
// Verified, Needs a check and Not accepted mean; how to take the photos, and why they come from the
// camera and never the gallery (Design.md §17); "Call the office" as a tel: link from the organisation's
// office_phone (hidden when there is none); the language; and "This phone" (its ID and when it was set
// up, from the browser's own store matched against the agent's enrolled phones).
// DES-001: on a phone the sheet is taller than the screen, so Close is pinned below the scrolling
// content (always in view, with a fade while more sits below), and the language and "This phone" sit
// behind one "More" row, keeping the first screen to the photos, the verdicts and the office.

export type { HelpInfo };

function Row({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <p className="help-row">
      {icon}
      <span>{children}</span>
    </p>
  );
}

export function HelpSheet({ open, onClose, lang, info, onLanguage }: { open: boolean; onClose: () => void; lang: Lang; info: HelpInfo; onLanguage: () => void }) {
  const tr = (k: MessageKey, v: Record<string, string | number> = {}) => t(k, v, lang);
  const [deviceId, setDeviceId] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    if (!open) return;
    let live = true;
    getDevice()
      .then((d) => live && setDeviceId(d?.deviceId ?? null))
      .catch(() => live && setDeviceId(null));
    return () => {
      live = false;
    };
  }, [open]);
  const phone = deviceId ? info.phones.find((p) => p.id === deviceId) : undefined;
  const tel = info.officePhone ? telHref(info.officePhone) : null;
  const record = tr('home.record');
  const [before, after = ''] = tr('help.record', { record: '\u0000' }).split('\u0000');

  return (
    <Sheet
      open={open}
      onClose={onClose}
      labelledBy="help-h"
      testId="help-sheet"
      footer={
        <Pill variant="ghost" onClick={onClose}>
          {tr('home.close')}
        </Pill>
      }
    >
      <h2 id="help-h">{tr('help.title')}</h2>
      <Row icon={<Ic name="camera" />}>
        {before}
        <b>{record}</b>
        {after}
      </Row>
      <Row icon={<Ic name="seal" />}>{tr('help.photos')}</Row>
      <Row icon={<Ic name="camera" />}>{tr('help.gallery')}</Row>

      {/* What the three answers mean: the chip (word + mark) is the row's icon. Rendered only while the
          sheet is open, so these chips never sit, hidden, beside the page's own verdict chips. */}
      {open ? (
        <div data-testid="help-verdicts">
          <Row icon={<VerdictChip verdict="Verified" lang={lang} />}>{tr('help.verified')}</Row>
          <Row icon={<VerdictChip verdict="Needs Review" lang={lang} />}>{tr('help.check')}</Row>
          <Row icon={<VerdictChip verdict="Rejected" lang={lang} />}>{tr('help.rejected')}</Row>
        </div>
      ) : null}

      {/* DES-014: "Call the office" is a 56 px ghost pill (the number as its second line), not a small inline link. */}
      {info.officePhone ? (
        <div className="help-call">
          <Row icon={<Ic name="help" />}>{tr('help.call', { org: info.orgName })}</Row>
          {tel ? (
            <a className={[pill.pill, pill.ghost, 'call-pill'].join(' ')} href={tel} data-testid="call-office">
              <Ic name="phone" />
              <span className="call-txt">
                <span>{tr('help.callPill')}</span>
                <small>{tr('help.callLink', { phone: info.officePhone })}</small>
              </span>
            </a>
          ) : (
            <p className="help-row">
              <span data-testid="call-office">{info.officePhone}</span>
            </p>
          )}
        </div>
      ) : null}

      <details className="help-more" data-testid="help-more">
        <summary>
          <span>{tr('help.more')}</span>
          <Ic name="chevron" className="ic chev" />
        </summary>
        <div className="help-more-body">
          <Row icon={<Ic name="globe" />}>
            {tr('help.language')}{' '}
            <button className="textbtn" type="button" aria-haspopup="dialog" onClick={onLanguage}>
              {lang === 'kn' ? <span lang="en">{t('lang.en')}</span> : <span lang="kn">{t('lang.kn')}</span>}
            </button>
          </Row>

          <Row icon={<Ic name="seal" />}>
            <b>{tr('help.thisPhone')}</b>{' '}
            <span data-testid="this-phone">
              {deviceId === undefined
                ? tr('help.phoneLoading')
                : deviceId === null
                  ? tr('rec.noDevice')
                  : phone
                    ? tr('help.phoneSetUp', { id: deviceId, date: istDayMonth(phone.enrolledAt, lang) })
                    : tr('help.phoneId', { id: deviceId })}
            </span>
          </Row>
        </div>
      </details>
    </Sheet>
  );
}
