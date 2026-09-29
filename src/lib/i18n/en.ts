// English strings (TP18). The shipped default. Keys are grouped by surface; later tickets add theirs
// (TKT-05 adds kn.ts with the same keys, TKT-10/11 grow both).

export const en = {
  'app.name': 'Udgam',

  'signIn.title': 'Sign in to {app}',
  'signIn.lede': 'Use the email and password your organisation gave you.',
  'signIn.email': 'Email',
  'signIn.password': 'Password',
  'signIn.submit': 'Sign in',
  'signIn.working': 'Signing in…',
  'signIn.error': 'Email or password is not right.',
  'signIn.unavailable': "Couldn't sign in right now. Try again.",
  'signOut': 'Sign out',

  'shell.field.title': 'Home',
  'shell.field.empty': 'No pickings recorded yet.',
  'shell.admin.title': 'Review',
  'shell.admin.empty': 'Nothing to review.',
  'shell.buyer.title': 'Batches',
  'shell.buyer.empty': 'No batches have been transferred to you yet.',
} as const;

export type MessageKey = keyof typeof en;
