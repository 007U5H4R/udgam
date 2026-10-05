import { signOut } from '../../app/(public)/sign-in/actions';
import { t } from '../../lib/i18n';
import { Pill } from './Pill';

// Sign out (DES-105, EXE40): one control for every office screen. The rail foot carries it on tablet and
// desktop (Rail.tsx); on phones, where the rail is a tab bar, RailShell puts this ghost pill at the end of
// the screen; the buyer (no rail) has it at the foot of its list column.
export function SignOutPill({ className }: { className?: string }) {
  return (
    <form action={signOut} className={className}>
      <Pill variant="ghost" type="submit">
        {t('signOut')}
      </Pill>
    </form>
  );
}
