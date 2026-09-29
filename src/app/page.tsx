import { redirect } from 'next/navigation';
import { HOME } from '../lib/auth/session';
import { currentUser } from './_auth/require';

// `/` sends a signed-in user to their role's home and everyone else to sign in (technical-plan §3.2).
export const dynamic = 'force-dynamic';

export default async function Root(): Promise<never> {
  const user = await currentUser();
  redirect(user ? HOME[user.role] : '/sign-in');
}
