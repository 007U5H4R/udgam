import type { MessageKey } from './en';

// Kannada strings (TP18, N5). English is the shipped default; Kannada is chosen on the first-run
// language sheet (TKT-05) and later from the switch (TKT-11).
//
// PENDING REVIEW: every entry below is marked `// REVIEW: native speaker` and must be checked by a
// native Kannada speaker before release (Design.md §20 assumption). Admin surfaces (`rail.*`,
// `phones.*`) are English only and fall back to en.ts.

/** Keys every farmer- and agent-facing language must carry (admin keys excluded). */
export const isFieldKey = (k: string): boolean => !k.startsWith('rail.') && !k.startsWith('phones.');

export const kn: Partial<Record<MessageKey, string>> = {
  'app.name': 'Udgam', // REVIEW: native speaker (brand name kept in Latin script)

  'signIn.title': '{app} ಗೆ ಸೈನ್ ಇನ್ ಮಾಡಿ', // REVIEW: native speaker
  'signIn.lede': 'ನಿಮ್ಮ ಸಂಸ್ಥೆ ನೀಡಿದ ಇಮೇಲ್ ಮತ್ತು ಪಾಸ್‌ವರ್ಡ್ ಬಳಸಿ.', // REVIEW: native speaker
  'signIn.email': 'ಇಮೇಲ್', // REVIEW: native speaker
  'signIn.password': 'ಪಾಸ್‌ವರ್ಡ್', // REVIEW: native speaker
  'signIn.submit': 'ಸೈನ್ ಇನ್', // REVIEW: native speaker
  'signIn.working': 'ಸೈನ್ ಇನ್ ಆಗುತ್ತಿದೆ…', // REVIEW: native speaker
  'signIn.error': 'ಇಮೇಲ್ ಅಥವಾ ಪಾಸ್‌ವರ್ಡ್ ಸರಿಯಿಲ್ಲ.', // REVIEW: native speaker
  'signIn.unavailable': 'ಈಗ ಸೈನ್ ಇನ್ ಮಾಡಲಾಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.', // REVIEW: native speaker
  'signOut':'ಸೈನ್ ಔಟ್', // REVIEW: native speaker

  'shell.field.title': 'ಮುಖಪುಟ', // REVIEW: native speaker
  'shell.field.empty': 'ಇನ್ನೂ ಯಾವುದೇ ಕೊಯ್ಲು ದಾಖಲಾಗಿಲ್ಲ.', // REVIEW: native speaker
  'shell.admin.title': 'ಪರಿಶೀಲನೆ', // REVIEW: native speaker
  'shell.admin.empty': 'ಪರಿಶೀಲಿಸಲು ಏನೂ ಇಲ್ಲ.', // REVIEW: native speaker
  'shell.buyer.title': 'ಬ್ಯಾಚ್‌ಗಳು', // REVIEW: native speaker
  'shell.buyer.empty': 'ಇನ್ನೂ ಯಾವುದೇ ಬ್ಯಾಚ್ ನಿಮಗೆ ವರ್ಗಾವಣೆಯಾಗಿಲ್ಲ.', // REVIEW: native speaker

  'capture.rejected.plot_not_assigned': 'ಈ ತೋಟ ನಿಮಗೆ ನಿಯೋಜಿಸಿಲ್ಲ. ಅದನ್ನು ನಿಮಗೆ ನಿಯೋಜಿಸಲು ಕಚೇರಿಗೆ ಕೇಳಿ, ನಂತರ ಕೊಯ್ಲನ್ನು ಮತ್ತೆ ದಾಖಲಿಸಿ.', // REVIEW: native speaker

  'enrol.title': 'ಈ {word} ಸಿದ್ಧಪಡಿಸಿ', // REVIEW: native speaker
  'enrol.titleWord': 'ಫೋನ್', // REVIEW: native speaker
  'enrol.lede': 'ಕಚೇರಿ ಈ ಫೋನ್‌ಗಾಗಿ ಒಂದು ಕೋಡ್ ನೀಡುತ್ತದೆ. ಅದು 24 ಗಂಟೆಗಳೊಳಗೆ ಒಮ್ಮೆ ಮಾತ್ರ ಕೆಲಸ ಮಾಡುತ್ತದೆ.', // REVIEW: native speaker
  'enrol.code': 'ಕಚೇರಿ ನೀಡಿದ 6 ಅಕ್ಷರಗಳ ಕೋಡ್ ನಮೂದಿಸಿ', // REVIEW: native speaker
  'enrol.submit': 'ಈ ಫೋನ್ ಸಿದ್ಧಪಡಿಸಿ', // REVIEW: native speaker
  'enrol.working': 'ಸಿದ್ಧಪಡಿಸಲಾಗುತ್ತಿದೆ…', // REVIEW: native speaker
  'enrol.error.invalid': 'ಆ ಕೋಡ್ ಸರಿಯಿಲ್ಲ. ಅಕ್ಷರಗಳನ್ನು ಪರಿಶೀಲಿಸಿ, ಅಥವಾ ಹೊಸ ಕೋಡ್‌ಗಾಗಿ ಕಚೇರಿಗೆ ಕೇಳಿ.', // REVIEW: native speaker
  'enrol.error.expired': 'ಆ ಕೋಡ್‌ನ ಅವಧಿ ಮುಗಿದಿದೆ. ಹೊಸ ಕೋಡ್‌ಗಾಗಿ ಕಚೇರಿಗೆ ಕೇಳಿ.', // REVIEW: native speaker
  'enrol.error.used': 'ಆ ಕೋಡ್ ಈಗಾಗಲೇ ಬಳಕೆಯಾಗಿದೆ. ಹೊಸ ಕೋಡ್‌ಗಾಗಿ ಕಚೇರಿಗೆ ಕೇಳಿ.', // REVIEW: native speaker
  'enrol.error.rate_limited': 'ಹಲವು ಬಾರಿ ಪ್ರಯತ್ನಿಸಲಾಗಿದೆ. ಒಂದು ಗಂಟೆ ಕಾಯಿರಿ, ಅಥವಾ ಹೊಸ ಕೋಡ್‌ಗಾಗಿ ಕಚೇರಿಗೆ ಕೇಳಿ.', // REVIEW: native speaker
  'enrol.error.network': 'ಕಚೇರಿಯನ್ನು ತಲುಪಲಾಗಲಿಲ್ಲ. ಸಿಗ್ನಲ್ ಪರಿಶೀಲಿಸಿ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ. ಏನೂ ಕಳೆದುಹೋಗಿಲ್ಲ.', // REVIEW: native speaker
  'enrol.error.other': 'ಈ ಫೋನ್ ಸಿದ್ಧಪಡಿಸಲಾಗಲಿಲ್ಲ. ಹೊಸ ಕೋಡ್‌ಗಾಗಿ ಕಚೇರಿಗೆ ಕೇಳಿ.', // REVIEW: native speaker
  'enrol.error.unsupported': 'ಈ ಬ್ರೌಸರ್ ಸುರಕ್ಷಿತ ಕೀ ಇಟ್ಟುಕೊಳ್ಳಲಾರದು. Udgam ಅನ್ನು Chrome ಅಥವಾ Safari ಯಲ್ಲಿ ತೆರೆಯಿರಿ.', // REVIEW: native speaker
  'enrol.error.saveFailed': 'ಫೋನ್ ಸರ್ವರ್‌ನಲ್ಲಿ ನೋಂದಣಿಯಾಗಿದೆ ಆದರೆ ಇಲ್ಲಿ ಉಳಿಸಲಾಗಿಲ್ಲ — ಹೊಸ ಕೋಡ್‌ಗಾಗಿ ಕಚೇರಿಗೆ ಕೇಳಿ.', // REVIEW: native speaker
  'enrol.done.title': 'ಈ ಫೋನ್ {word}', // REVIEW: native speaker
  'enrol.done.titleWord': 'ಸಿದ್ಧವಾಗಿದೆ', // REVIEW: native speaker
  'enrol.done.lede': 'ನೀವು ಇಲ್ಲಿ ದಾಖಲಿಸುವ ಕೊಯ್ಲುಗಳಿಗೆ ಈ ಫೋನ್‌ನ ಸ್ವಂತ ಕೀಯಿಂದ ಸಹಿ ಹಾಕಲಾಗುತ್ತದೆ.', // REVIEW: native speaker
  'enrol.done.next': 'ಮುಖಪುಟಕ್ಕೆ ಹೋಗಿ', // REVIEW: native speaker
};
