'use client';

import { useEffect, useState } from 'react';
import { t, type Lang } from '../../lib/i18n';
import { Pill } from '../ui/Pill';
import { Sheet } from '../ui/Sheet';
import { Ic } from './icons';
import { isOffline, OFFLINE_EVENT } from './offline';

// The saved-on-phone sheet for a navigation tried with no network (DES-002, EXE40), in the amber tone of
// "Couldn't send" (#s7): "No network here" and that nothing is lost. Mounted once by the (agent) layout.
// While the phone is offline it stops every tap on a link to another app page (a tab, a row, Back) and
// every form post (Sign out) before Next sees it, so the page stays; `showOffline()` opens it for the
// router calls (Record, Send now's refresh).

export function OfflineSheet({ lang }: { lang: Lang }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const show = () => setOpen(true);
    const onClick = (e: MouseEvent) => {
      if (!isOffline() || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target instanceof Element ? e.target.closest('a[href]') : null;
      if (!(a instanceof HTMLAnchorElement) || a.hasAttribute('download') || (a.target !== '' && a.target !== '_self')) return;
      if (a.origin !== window.location.origin) return; // tel:, mailto: and other sites go through
      e.preventDefault();
      e.stopPropagation();
      show();
    };
    const onSubmit = (e: Event) => {
      if (!isOffline()) return;
      e.preventDefault();
      e.stopPropagation();
      show();
    };
    window.addEventListener(OFFLINE_EVENT, show);
    window.addEventListener('click', onClick, true);
    window.addEventListener('submit', onSubmit, true);
    return () => {
      window.removeEventListener(OFFLINE_EVENT, show);
      window.removeEventListener('click', onClick, true);
      window.removeEventListener('submit', onSubmit, true);
    };
  }, []);

  return (
    <Sheet open={open} onClose={() => setOpen(false)} labelledBy="offline-h" tone="amber" testId="offline-sheet">
      <div className="sheet-ic" aria-hidden="true">
        <Ic name="wifiOff" />
      </div>
      <h2 id="offline-h">{t('rec.saved.offline', {}, lang)}</h2>
      <p className="center">{t('offline.body', {}, lang)}</p>
      <Pill variant="ghost" onClick={() => setOpen(false)}>
        {t('home.close', {}, lang)}
      </Pill>
    </Sheet>
  );
}
