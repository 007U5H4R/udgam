import { signOut } from '../../app/(public)/sign-in/actions';
import { t } from '../../lib/i18n';
import { Pill } from './Pill';
import styles from './SignOut.module.css';

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

/**
 * The end of a detail that is the whole screen. Buyer (no rail): shown below 1100 px, where the list
 * column's Sign out is hidden. `rail` (the admin review and processor details, DES-117): shown only on
 * phones (< 700 px), where the open detail hides the tab bar and RailShell's pill so its sticky bar sits at
 * the bottom edge; from 700 px the rail foot carries Sign out.
 */
export function DetailSignOut({ rail = false }: { rail?: boolean }) {
  return <SignOutPill className={rail ? styles.railDetailEnd : styles.detailEnd} />;
}
