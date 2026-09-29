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

  'fe.plot.default': 'ತೋಟ', // REVIEW: native speaker
  'fe.location.inside': 'ನೀವು {plot} ಒಳಗೆ {m} ಇದ್ದಿರಿ', // REVIEW: native speaker
  'fe.location.edge': 'ನೀವು {plot} ಹೊರಗೆ {m} ಇದ್ದಿರಿ, GPS ಅನುಮತಿಯ ಒಳಗೆ.', // REVIEW: native speaker
  'fe.location.outside': 'ನಿಮ್ಮ ಫೋನ್ {plot} ಹೊರಗೆ {m} ಇತ್ತು.', // REVIEW: native speaker
  'fe.gps.weak': 'GPS ಸಿಗ್ನಲ್ ದುರ್ಬಲವಾಗಿತ್ತು ({m}).', // REVIEW: native speaker
  'fe.photoGps.none': 'ಫೋಟೋದಲ್ಲಿ ಸ್ಥಳ ಉಳಿಸಿಲ್ಲ.', // REVIEW: native speaker
  'fe.photoGps.far': 'ಫೋಟೋವನ್ನು ಫೋನ್ ಇದ್ದ ಜಾಗದಿಂದ {m} ದೂರದಲ್ಲಿ ತೆಗೆಯಲಾಗಿದೆ.', // REVIEW: native speaker
  'fe.photoTime.none': 'ಫೋಟೋದಲ್ಲಿ ಸಮಯ ಉಳಿಸಿಲ್ಲ.', // REVIEW: native speaker
  'fe.photoTime.far': 'ಫೋಟೋವನ್ನು ಈ ಕೊಯ್ಲಿನ {d} ಮೊದಲು ಅಥವಾ ನಂತರ ತೆಗೆಯಲಾಗಿದೆ.', // REVIEW: native speaker
  'fe.photoTime.clock': 'ಈ ಫೋನಿನ ಗಡಿಯಾರ {d} ತಪ್ಪಾಗಿದೆ.', // REVIEW: native speaker
  'fe.move.far': 'ಈ ಕೊಯ್ಲು ನಿಮ್ಮ ಹಿಂದಿನದರಿಂದ {m} ದೂರ, ಕೇವಲ {min} ನಿಮಿಷ ನಂತರ.', // REVIEW: native speaker
  'fe.move.clock': 'ನಿಮ್ಮ ಹಿಂದಿನ ಕೊಯ್ಲಿನ ನಂತರ ಫೋನಿನ ಸಮಯ ಮುಂದೆ ಹೋಗಿಲ್ಲ.', // REVIEW: native speaker
  'fe.photos.new': '{n} ಹೊಸ ಫೋಟೋಗಳು', // REVIEW: native speaker
  'fe.photos.newToday': '{n} ಹೊಸ ಫೋಟೋಗಳು, ಇಂದು ತೆಗೆದವು', // REVIEW: native speaker
  'fe.photos.new1': '1 ಹೊಸ ಫೋಟೋ', // REVIEW: native speaker
  'fe.photos.new1Today': '1 ಹೊಸ ಫೋಟೋ, ಇಂದು ತೆಗೆದದ್ದು', // REVIEW: native speaker
  'fe.photos.used': '{n} ರಲ್ಲಿ {k} ಫೋಟೋಗಳು ಮೊದಲೇ ಬಳಕೆಯಾಗಿವೆ.', // REVIEW: native speaker
  'fe.seal.ok': 'ಈ ಫೋನಿನಿಂದ ಮುದ್ರೆ ಹಾಕಲಾಗಿದೆ', // REVIEW: native speaker
  'fe.seal.bad': 'ಈ ಫೋನಿನ ಮುದ್ರೆ ಕೊಯ್ಲಿಗೆ ಹೊಂದಿಕೆಯಾಗಲಿಲ್ಲ.', // REVIEW: native speaker
  'fe.seal.revoked': 'ಕಚೇರಿ {date} ರಂದು ಈ ಫೋನನ್ನು ಕೊಯ್ಲುಗಳಿಗೆ ನಿಲ್ಲಿಸಿದೆ.', // REVIEW: native speaker
  'fe.seal.unknown': 'ಈ ಫೋನ್ ಕೊಯ್ಲುಗಳಿಗೆ ಸಿದ್ಧವಾಗಿಲ್ಲ.', // REVIEW: native speaker
  'fe.chain.order': 'ಈ ಫೋನಿನ ಕೊಯ್ಲುಗಳು ಕ್ರಮ ತಪ್ಪಿ ಬಂದಿವೆ.', // REVIEW: native speaker
  'fe.chain.newPhone': 'ಇದು ಹೊಸ ಫೋನಿನ ಮೊದಲ ಕೊಯ್ಲು.', // REVIEW: native speaker
  'fe.forest.none': 'ಅರಣ್ಯ ನಕ್ಷೆ: {year} ರಿಂದ ಯಾವುದೇ ಮರ ಕಡಿದಿಲ್ಲ', // REVIEW: native speaker
  'fe.forest.loss': 'ಅರಣ್ಯ ನಕ್ಷೆ: {year} ರಿಂದ ತೋಟದ {pct} ತೆರವಾಗಿದೆ.', // REVIEW: native speaker
  'fe.forest.down': 'ಅರಣ್ಯ ನಕ್ಷೆ ಉತ್ತರಿಸಲಿಲ್ಲ. ಕಚೇರಿ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸುತ್ತದೆ.', // REVIEW: native speaker
  'fe.canopy.ok': 'ಉಪಗ್ರಹ: ವರ್ಷವಿಡೀ ತೋಟದಲ್ಲಿ ಮರಗಳು', // REVIEW: native speaker
  'fe.canopy.none': 'ಉಪಗ್ರಹಕ್ಕೆ ವರ್ಷವಿಡೀ ತೋಟದಲ್ಲಿ ಮರಗಳು ಕಾಣುತ್ತಿಲ್ಲ.', // REVIEW: native speaker
  'fe.canopy.few': 'ಈ ತೋಟದ ಸ್ಪಷ್ಟ ಉಪಗ್ರಹ ಚಿತ್ರಗಳು ಇನ್ನೂ ಸಾಕಷ್ಟಿಲ್ಲ.', // REVIEW: native speaker
  'fe.sat.ok': 'ಉಪಗ್ರಹ: ಈ ತಿಂಗಳು ಹಸಿರು ಮರಗಳು', // REVIEW: native speaker
  'fe.sat.cloud': 'ಈ ತಿಂಗಳ ಉಪಗ್ರಹ ಚಿತ್ರ ಮೋಡದಿಂದ ಕೂಡಿತ್ತು.', // REVIEW: native speaker
  'fe.sat.down': 'ಉಪಗ್ರಹ ಉತ್ತರಿಸಲಿಲ್ಲ. ಕಚೇರಿ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸುತ್ತದೆ.', // REVIEW: native speaker
  'fe.sat.low': 'ಈ ತಿಂಗಳು ಉಪಗ್ರಹಕ್ಕೆ ತೋಟದಲ್ಲಿ ಕಡಿಮೆ ಹಸಿರು ಕಾಣುತ್ತಿದೆ (NDVI {ndvi}).', // REVIEW: native speaker
  'fe.yield.high': 'ಈ ಹಂಗಾಮಿನ ಒಟ್ಟು ಕೊಯ್ಲು ಈ ತೋಟದ ಸಾಮಾನ್ಯ ಇಳುವರಿಯ {x} ಆಗಿದೆ.', // REVIEW: native speaker
  'fe.yield.none': 'ಈ ಬೆಳೆಯ ಸಾಮಾನ್ಯ ಇಳುವರಿ ಇನ್ನೂ ದಾಖಲಾಗಿಲ್ಲ.', // REVIEW: native speaker
  'fe.threw': 'ಒಂದು ಪರಿಶೀಲನೆ ನಡೆಯಲಿಲ್ಲ. ಕಚೇರಿ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸುತ್ತದೆ.', // REVIEW: native speaker
  'fe.office': 'ಕಚೇರಿ ಇದನ್ನು ನೋಡುತ್ತದೆ. ನೀವು ಏನೂ ಮಾಡಬೇಕಿಲ್ಲ.', // REVIEW: native speaker
  'fe.todo.photos': 'ಇಂದಿನ ಕೊಯ್ಲಿನ ಹೊಸ ಫೋಟೋಗಳನ್ನು ತೆಗೆದು ಮತ್ತೆ ದಾಖಲಿಸಿ.', // REVIEW: native speaker
  'fe.todo.seal': 'ಈ ಫೋನನ್ನು ಮತ್ತೆ ಸಿದ್ಧಪಡಿಸಲು ಕಚೇರಿಗೆ ಕೇಳಿ.', // REVIEW: native speaker
  'fe.todo.location': '{plot} ಒಳಗೆ ನಿಂತು ಕೊಯ್ಲನ್ನು ಮತ್ತೆ ದಾಖಲಿಸಿ. ನೀವು ಒಳಗೇ ಇದ್ದರೆ, ಕಚೇರಿಗೆ ತಿಳಿಸಿ.', // REVIEW: native speaker
  'fe.todo.office': 'ಕಚೇರಿಯೊಂದಿಗೆ ಮಾತನಾಡಿ. ಅವರು ಇದನ್ನು ಮತ್ತೆ ನೋಡಬಹುದು.', // REVIEW: native speaker

  'capture.nothingLost': 'ಏನೂ ಕಳೆದುಹೋಗಿಲ್ಲ: ಈ ಕೊಯ್ಲು ಈ ಫೋನಿನಲ್ಲಿ ಉಳಿಸಲಾಗಿದೆ.', // REVIEW: native speaker
  'refusal.plot_not_assigned.happened': 'ಈ ತೋಟ ನಿಮಗೆ ನಿಯೋಜಿಸಿಲ್ಲ.', // REVIEW: native speaker
  'refusal.plot_not_assigned.todo': 'ಅದನ್ನು ನಿಮಗೆ ನಿಯೋಜಿಸಲು ಕಚೇರಿಗೆ ಕೇಳಿ, ನಂತರ ಕೊಯ್ಲನ್ನು ಮತ್ತೆ ದಾಖಲಿಸಿ.', // REVIEW: native speaker
  'refusal.device_revoked.happened': 'ಕಚೇರಿ ಈ ಫೋನನ್ನು ಕೊಯ್ಲುಗಳಿಗೆ ನಿಲ್ಲಿಸಿದೆ.', // REVIEW: native speaker
  'refusal.device_revoked.todo': 'ಈ ಫೋನನ್ನು ಮತ್ತೆ ಸಿದ್ಧಪಡಿಸಲು ಕಚೇರಿಯಿಂದ ಹೊಸ ಕೋಡ್ ಕೇಳಿ.', // REVIEW: native speaker
  'refusal.unknown_device.happened': 'ಈ ಫೋನ್ ಕೊಯ್ಲುಗಳಿಗೆ ಸಿದ್ಧವಾಗಿಲ್ಲ.', // REVIEW: native speaker
  'refusal.unknown_device.todo': 'ಈ ಫೋನನ್ನು ಸಿದ್ಧಪಡಿಸಲು ಕಚೇರಿಯಿಂದ ಕೋಡ್ ಕೇಳಿ.', // REVIEW: native speaker
  'refusal.device_not_owned.happened': 'ಈ ಫೋನ್ ಬೇರೆಯವರಿಗಾಗಿ ಸಿದ್ಧಪಡಿಸಲಾಗಿದೆ.', // REVIEW: native speaker
  'refusal.device_not_owned.todo': 'ನಿಮ್ಮ ಸ್ವಂತ ಖಾತೆಯಿಂದ ಸೈನ್ ಇನ್ ಮಾಡಿ, ಅಥವಾ ಈ ಫೋನನ್ನು ನಿಮಗಾಗಿ ಸಿದ್ಧಪಡಿಸಲು ಕಚೇರಿಗೆ ಕೇಳಿ.', // REVIEW: native speaker
  'refusal.bad_signature.happened': 'ಈ ಫೋನಿನ ಮುದ್ರೆ ಕೊಯ್ಲಿಗೆ ಹೊಂದಿಕೆಯಾಗಲಿಲ್ಲ.', // REVIEW: native speaker
  'refusal.bad_signature.todo': 'ಈ ಫೋನನ್ನು ಮತ್ತೆ ಸಿದ್ಧಪಡಿಸಲು ಕಚೇರಿಗೆ ಕೇಳಿ.', // REVIEW: native speaker
  'refusal.media_hash_mismatch.happened': 'ಕಚೇರಿಗೆ ತಲುಪುವ ದಾರಿಯಲ್ಲಿ ಒಂದು ಫೋಟೋ ಬದಲಾಗಿದೆ.', // REVIEW: native speaker
  'refusal.media_hash_mismatch.todo': 'ಹೊಸ ಫೋಟೋಗಳೊಂದಿಗೆ ಕೊಯ್ಲನ್ನು ಮತ್ತೆ ದಾಖಲಿಸಿ.', // REVIEW: native speaker
  'refusal.media_count.happened': 'ಕೊಯ್ಲಿನಲ್ಲಿ ಫೋಟೋಗಳು ಹೆಚ್ಚು ಅಥವಾ ಕಡಿಮೆ ಇದ್ದವು.', // REVIEW: native speaker
  'refusal.media_count.todo': '1 ರಿಂದ 3 ಫೋಟೋಗಳೊಂದಿಗೆ ಕೊಯ್ಲನ್ನು ಮತ್ತೆ ದಾಖಲಿಸಿ.', // REVIEW: native speaker
  'refusal.media_too_large.happened': 'ಒಂದು ಫೋಟೋ ಕಳುಹಿಸಲು ತುಂಬಾ ದೊಡ್ಡದಾಗಿದೆ.', // REVIEW: native speaker
  'refusal.media_too_large.todo': 'ಫೋಟೋವನ್ನು ಮತ್ತೆ ತೆಗೆದು, ಕೊಯ್ಲನ್ನು ಮತ್ತೆ ದಾಖಲಿಸಿ.', // REVIEW: native speaker
  'refusal.media_type.happened': 'ಒಂದು ಫೋಟೋ ಕಚೇರಿ ಓದಬಹುದಾದ ಕ್ಯಾಮೆರಾ ಚಿತ್ರವಲ್ಲ.', // REVIEW: native speaker
  'refusal.media_type.todo': 'ಕ್ಯಾಮೆರಾ ತೆರೆಯಿರಿ ಬಳಸಿ ಫೋಟೋ ತೆಗೆದು, ಕೊಯ್ಲನ್ನು ಮತ್ತೆ ದಾಖಲಿಸಿ.', // REVIEW: native speaker
  'refusal.length_required.happened': 'ಕೊಯ್ಲನ್ನು ಒಂದೇ ಬಾರಿ ಕಳುಹಿಸಲಾಗಲಿಲ್ಲ.', // REVIEW: native speaker
  'refusal.length_required.todo': 'ಕೊಯ್ಲನ್ನು ಮತ್ತೆ ದಾಖಲಿಸಿ.', // REVIEW: native speaker
  'refusal.body_too_large.happened': 'ಫೋಟೋಗಳು ಒಟ್ಟಿಗೆ ಕಳುಹಿಸಲು ತುಂಬಾ ದೊಡ್ಡದಾಗಿವೆ.', // REVIEW: native speaker
  'refusal.body_too_large.todo': 'ಕಡಿಮೆ ಫೋಟೋಗಳೊಂದಿಗೆ ಕೊಯ್ಲನ್ನು ಮತ್ತೆ ದಾಖಲಿಸಿ.', // REVIEW: native speaker
  'refusal.bad_schema.happened': 'ಕೊಯ್ಲು ಕಚೇರಿಗೆ ಅಪೂರ್ಣವಾಗಿ ತಲುಪಿದೆ.', // REVIEW: native speaker
  'refusal.bad_schema.todo': 'ಕೊಯ್ಲನ್ನು ಮತ್ತೆ ದಾಖಲಿಸಿ. ಮತ್ತೆ ಹೀಗಾದರೆ, ಕಚೇರಿಗೆ ತಿಳಿಸಿ.', // REVIEW: native speaker
  'refusal.non_canonical.happened': 'ಕೊಯ್ಲು ಕಚೇರಿಗೆ ಅಪೂರ್ಣವಾಗಿ ತಲುಪಿದೆ.', // REVIEW: native speaker
  'refusal.non_canonical.todo': 'ಕೊಯ್ಲನ್ನು ಮತ್ತೆ ದಾಖಲಿಸಿ. ಮತ್ತೆ ಹೀಗಾದರೆ, ಕಚೇರಿಗೆ ತಿಳಿಸಿ.', // REVIEW: native speaker
  'refusal.bad_form.happened': 'ಕೊಯ್ಲು ಕಚೇರಿಗೆ ಅಪೂರ್ಣವಾಗಿ ತಲುಪಿದೆ.', // REVIEW: native speaker
  'refusal.bad_form.todo': 'ಕೊಯ್ಲನ್ನು ಮತ್ತೆ ದಾಖಲಿಸಿ. ಮತ್ತೆ ಹೀಗಾದರೆ, ಕಚೇರಿಗೆ ತಿಳಿಸಿ.', // REVIEW: native speaker
  'refusal.rate_limited.happened': 'ಸ್ವಲ್ಪ ಸಮಯದಲ್ಲಿ ಈ ಫೋನಿನಿಂದ ಹಲವು ಕೊಯ್ಲುಗಳನ್ನು ಕಳುಹಿಸಲಾಗಿದೆ.', // REVIEW: native speaker
  'refusal.rate_limited.todo': '{min} ನಿಮಿಷ ಕಾಯಿರಿ, ನಂತರ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.', // REVIEW: native speaker
  'refusal.rate_limited.todo1': '1 ನಿಮಿಷ ಕಾಯಿರಿ, ನಂತರ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.', // REVIEW: native speaker
  'refusal.unauthenticated.happened': 'ನೀವು ಸೈನ್ ಔಟ್ ಆಗಿದ್ದೀರಿ.', // REVIEW: native speaker
  'refusal.unauthenticated.todo': 'ಮತ್ತೆ ಸೈನ್ ಇನ್ ಮಾಡಿ, ನಂತರ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.', // REVIEW: native speaker
  'refusal.other.happened': 'ಕಚೇರಿ ಈ ಕೊಯ್ಲನ್ನು ಸ್ವೀಕರಿಸಲಾಗಲಿಲ್ಲ.', // REVIEW: native speaker
  'refusal.other.todo': 'ಕೊಯ್ಲನ್ನು ಮತ್ತೆ ದಾಖಲಿಸಿ. ಮತ್ತೆ ಹೀಗಾದರೆ, ಕಚೇರಿಗೆ ತಿಳಿಸಿ.', // REVIEW: native speaker

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

  // Batches, custody and the buyer list (TKT-14)
  'crop.arabica': 'ಅರೇಬಿಕಾ', // REVIEW: native speaker
  'crop.robusta': 'ರೋಬಸ್ಟಾ', // REVIEW: native speaker
  'batches.eyebrow': '{org} · ಬ್ಯಾಚ್‌ಗಳು', // REVIEW: native speaker
  'batches.title': 'ಬ್ಯಾಚ್‌ಗಳು', // REVIEW: native speaker
  'batches.sub': 'ಮಾರಾಟಕ್ಕಾಗಿ ಗುಂಪು ಮಾಡಿದ ಒಂದೇ ಬೆಳೆಯ ಪರಿಶೀಲಿತ ಕೊಯ್ಲುಗಳು. ಬ್ಯಾಚ್ ರಚಿಸಿದಾಗ ಸಹಿ ಹಾಕಲಾಗುತ್ತದೆ ಮತ್ತು ವರ್ಗಾಯಿಸಿದ ನಂತರ ಲಾಕ್ ಆಗುತ್ತದೆ.', // REVIEW: native speaker
  'batches.new': 'ಹೊಸ ಬ್ಯಾಚ್', // REVIEW: native speaker
  'batches.list.label': 'ಈ ಸಂಸ್ಥೆಯ ಬ್ಯಾಚ್‌ಗಳು', // REVIEW: native speaker
  'batches.row.open': 'ತೆರೆದಿದೆ', // REVIEW: native speaker
  'batches.row.transferred': 'ವರ್ಗಾಯಿಸಲಾಗಿದೆ', // REVIEW: native speaker
  'batches.row.facts': '{crop} · {pickings} · ಅಂಕ {score}', // REVIEW: native speaker
  'batches.pickings.one': '1 ಕೊಯ್ಲು', // REVIEW: native speaker
  'batches.pickings.many': '{n} ಕೊಯ್ಲುಗಳು', // REVIEW: native speaker
  'batches.plots.one': '1 ತೋಟ', // REVIEW: native speaker
  'batches.plots.many': '{n} ತೋಟಗಳು', // REVIEW: native speaker
  'batches.kg': '{kg} ಕೆಜಿ', // REVIEW: native speaker
  'batches.loading': 'ಬ್ಯಾಚ್‌ಗಳನ್ನು ತೆರೆಯಲಾಗುತ್ತಿದೆ…', // REVIEW: native speaker
  'batches.empty.title': 'ಇನ್ನೂ ಯಾವುದೇ ಬ್ಯಾಚ್ ಇಲ್ಲ.', // REVIEW: native speaker
  'batches.empty.body': 'ಪರಿಶೀಲಿತ ಕೊಯ್ಲುಗಳಿಂದ ಒಂದನ್ನು ರಚಿಸಿ.', // REVIEW: native speaker
  'batches.error.title': 'ಬ್ಯಾಚ್‌ಗಳನ್ನು ತೆರೆಯಲಾಗಲಿಲ್ಲ.', // REVIEW: native speaker
  'batches.error.body': 'ಏನೂ ಬದಲಾಗಿಲ್ಲ. ಸ್ವಲ್ಪ ಸಮಯದ ನಂತರ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.', // REVIEW: native speaker
  'batches.error.retry': 'ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ', // REVIEW: native speaker
  'batches.pick': 'ಕೊಯ್ಲುಗಳನ್ನು ನೋಡಲು ಮತ್ತು ವರ್ಗಾಯಿಸಲು ಒಂದು ಬ್ಯಾಚ್ ಆರಿಸಿ.', // REVIEW: native speaker
  'batches.back': 'ಬ್ಯಾಚ್‌ಗಳಿಗೆ ಹಿಂತಿರುಗಿ', // REVIEW: native speaker
  'batches.detail.eyebrow': '{org} · ಬ್ಯಾಚ್', // REVIEW: native speaker
  'batches.detail.created': '{when} ರಂದು ರಚಿಸಲಾಗಿದೆ', // REVIEW: native speaker
  'batches.detail.score': '100 ರಲ್ಲಿ {score} ಅಂಕ', // REVIEW: native speaker
  'batches.detail.facts': '{kg} ಕೆಜಿ {crop} ಹಣ್ಣು · {pickings}', // REVIEW: native speaker
  'batches.detail.members': 'ಈ ಬ್ಯಾಚ್‌ನ ಕೊಯ್ಲುಗಳು', // REVIEW: native speaker
  'batches.detail.member': '{plot} · {producer}', // REVIEW: native speaker
  'batches.detail.memberFacts': '{when} · ಅಂಕ {score}', // REVIEW: native speaker
  'batches.detail.certificate': 'ಪ್ರಮಾಣಪತ್ರ ತೆರೆಯಿರಿ', // REVIEW: native speaker
  'batches.detail.certificateNote': 'ಈ ಲಿಂಕ್ ಇರುವ ಯಾರಾದರೂ ಬ್ಯಾಚನ್ನು ಲೆಡ್ಜರ್‌ನೊಂದಿಗೆ ಪರಿಶೀಲಿಸಬಹುದು.', // REVIEW: native speaker
  'batches.transfer.title': 'ಸ್ವಾಧೀನ ವರ್ಗಾಯಿಸಿ', // REVIEW: native speaker
  'batches.transfer.buyer': 'ಖರೀದಿದಾರ', // REVIEW: native speaker
  'batches.transfer.choose': 'ಖರೀದಿದಾರನನ್ನು ಆರಿಸಿ', // REVIEW: native speaker
  'batches.transfer.note': 'ಇದಕ್ಕೆ ಸಹಿ ಹಾಕಿ ಶಾಶ್ವತವಾಗಿ ದಾಖಲಿಸಲಾಗುತ್ತದೆ. ಸರ್ವರ್ ನಿಮ್ಮ ಖಾತೆಯ ಪರವಾಗಿ ಸಹಿ ಹಾಕುತ್ತದೆ, ಮತ್ತು ಬ್ಯಾಚ್ ಲಾಕ್ ಆಗುತ್ತದೆ.', // REVIEW: native speaker
  'batches.transfer.submit': 'ಸಹಿ ಹಾಕಿ ವರ್ಗಾಯಿಸಿ', // REVIEW: native speaker
  'batches.transfer.working': 'ಸಹಿ ಹಾಕಲಾಗುತ್ತಿದೆ…', // REVIEW: native speaker
  'batches.transfer.noBuyers': 'ಇನ್ನೂ ಯಾವುದೇ ಖರೀದಿದಾರ ಸಂಸ್ಥೆ ಸಿದ್ಧವಾಗಿಲ್ಲ.', // REVIEW: native speaker
  'batches.transfer.error.not_open': 'ಈ ಬ್ಯಾಚ್ ಈಗಾಗಲೇ ವರ್ಗಾಯಿಸಲಾಗಿದೆ. ಬೇರೆ ಏನೂ ದಾಖಲಾಗಿಲ್ಲ.', // REVIEW: native speaker
  'batches.transfer.error.not_buyer': 'ಪಟ್ಟಿಯಿಂದ ಒಬ್ಬ ಖರೀದಿದಾರನನ್ನು ಆರಿಸಿ.', // REVIEW: native speaker
  'batches.custody.title': 'ಸ್ವಾಧೀನ', // REVIEW: native speaker
  'batches.custody.link': '{from} → {to}', // REVIEW: native speaker
  'batches.custody.when': '{when} ರಂದು ವರ್ಗಾಯಿಸಲಾಗಿದೆ · ನಿರ್ವಾಹಕರ ಪರವಾಗಿ ಸಹಿ', // REVIEW: native speaker
  'batches.custody.locked': 'ಲಾಕ್ ಆಗಿದೆ: ಈ ಬ್ಯಾಚ್ ಇನ್ನು ಬದಲಾಗುವುದಿಲ್ಲ.', // REVIEW: native speaker
  'batches.builder.eyebrow': '{org} · ಹೊಸ ಬ್ಯಾಚ್', // REVIEW: native speaker
  'batches.builder.title': 'ಹೊಸ ಬ್ಯಾಚ್', // REVIEW: native speaker
  'batches.builder.sub': 'ಒಂದೇ ಬೆಳೆಯ ಪರಿಶೀಲಿತ ಕೊಯ್ಲುಗಳನ್ನು ಆರಿಸಿ. ರಚಿಸಿದ ನಂತರ ಬ್ಯಾಚನ್ನು ಬದಲಾಯಿಸಲಾಗುವುದಿಲ್ಲ.', // REVIEW: native speaker
  'batches.builder.label': 'ಯಾವುದೇ ಬ್ಯಾಚ್‌ನಲ್ಲಿ ಇಲ್ಲದ ಪರಿಶೀಲಿತ ಕೊಯ್ಲುಗಳು', // REVIEW: native speaker
  'batches.builder.row': '{plot} · {producer}', // REVIEW: native speaker
  'batches.builder.rowFacts': '{crop} · {when} · ಅಂಕ {score}', // REVIEW: native speaker
  'batches.builder.otherCrop': 'ಬೇರೆ ಬೆಳೆ: ಒಂದು ಬ್ಯಾಚ್‌ನಲ್ಲಿ ಒಂದೇ ಬೆಳೆ ಇರುತ್ತದೆ.', // REVIEW: native speaker
  'batches.builder.none': 'ಕೊಯ್ಲುಗಳನ್ನು ಆರಿಸಿ', // REVIEW: native speaker
  'batches.builder.create.one': 'ಬ್ಯಾಚ್ ರಚಿಸಿ · 1 ಕೊಯ್ಲು · {kg} ಕೆಜಿ', // REVIEW: native speaker
  'batches.builder.create.many': 'ಬ್ಯಾಚ್ ರಚಿಸಿ · {n} ಕೊಯ್ಲುಗಳು · {kg} ಕೆಜಿ', // REVIEW: native speaker
  'batches.builder.working': 'ಬ್ಯಾಚ್ ರಚಿಸಲಾಗುತ್ತಿದೆ…', // REVIEW: native speaker
  'batches.builder.note': 'ಬ್ಯಾಚ್ ರಚಿಸಿದಾಗ ಅದರ ಕೊಯ್ಲುಗಳಿಗೆ ಸಹಿ ಹಾಕಿ ಶಾಶ್ವತವಾಗಿ ದಾಖಲಿಸಲಾಗುತ್ತದೆ.', // REVIEW: native speaker
  'batches.builder.empty.title': 'ಬ್ಯಾಚ್ ಮಾಡಲು ಪರಿಶೀಲಿತ ಕೊಯ್ಲುಗಳಿಲ್ಲ.', // REVIEW: native speaker
  'batches.builder.empty.body': 'ಕೊಯ್ಲುಗಳು ಪರಿಶೀಲಿತವಾಗಿ ಯಾವುದೇ ಬ್ಯಾಚ್‌ನಲ್ಲಿ ಇಲ್ಲದಿದ್ದಾಗ ಇಲ್ಲಿ ಕಾಣಿಸುತ್ತವೆ.', // REVIEW: native speaker
  'batches.builder.error.empty': 'ಕನಿಷ್ಠ ಒಂದು ಕೊಯ್ಲನ್ನು ಆರಿಸಿ.', // REVIEW: native speaker
  'batches.builder.error.not_eligible': 'ಇವುಗಳಲ್ಲಿ ಒಂದು ಕೊಯ್ಲು ಇನ್ನು ಬ್ಯಾಚ್‌ಗೆ ಸೇರಲಾರದು. ಏನೂ ಉಳಿಸಲಾಗಿಲ್ಲ; ಪಟ್ಟಿ ಈಗ ನವೀಕರಿಸಲಾಗಿದೆ.', // REVIEW: native speaker
  'batches.builder.error.mixed_crop': 'ಒಂದು ಬ್ಯಾಚ್‌ನಲ್ಲಿ ಒಂದೇ ಬೆಳೆ ಇರುತ್ತದೆ. ಒಂದೇ ಬೆಳೆಯ ಕೊಯ್ಲುಗಳನ್ನು ಆರಿಸಿ.', // REVIEW: native speaker
  'buyer.eyebrow': '{org}', // REVIEW: native speaker
  'buyer.sub': 'ನಿಮಗೆ ವರ್ಗಾಯಿಸಿದ ಬ್ಯಾಚ್‌ಗಳು. ಪ್ರತಿಯೊಂದಕ್ಕೂ ಯಾರಾದರೂ ಪರಿಶೀಲಿಸಬಹುದಾದ ಪ್ರಮಾಣಪತ್ರವಿದೆ.', // REVIEW: native speaker
  'buyer.list.label': 'ನಿಮಗೆ ವರ್ಗಾಯಿಸಿದ ಬ್ಯಾಚ್‌ಗಳು', // REVIEW: native speaker
  'buyer.row.facts': '{crop} · {plots} · ಅಂಕ {score}', // REVIEW: native speaker
  'buyer.row.from': '{org} ಇಂದ · {when}', // REVIEW: native speaker
  'buyer.detail.producers': 'ತೋಟಗಳು ಮತ್ತು ಉತ್ಪಾದಕರು', // REVIEW: native speaker
  'buyer.detail.producer': '{plot} · ಉತ್ಪಾದಕ {producer}', // REVIEW: native speaker
  'buyer.pick': 'ತೋಟಗಳು, ಸ್ವಾಧೀನ ಮತ್ತು ಪ್ರಮಾಣಪತ್ರ ನೋಡಲು ಒಂದು ಬ್ಯಾಚ್ ಆರಿಸಿ.', // REVIEW: native speaker
  'buyer.empty.body': 'ಒಂದು ಸಂಸ್ಥೆ ನಿಮಗೆ ಬ್ಯಾಚ್ ವರ್ಗಾಯಿಸಿದಾಗ, ಅದು ಅದರ ಪ್ರಮಾಣಪತ್ರದೊಂದಿಗೆ ಇಲ್ಲಿ ಕಾಣಿಸುತ್ತದೆ.', // REVIEW: native speaker
  'buyer.detail.eyebrow': '{org} · ಬ್ಯಾಚ್', // REVIEW: native speaker
  'buyer.detail.from': '{org} ಇಂದ · {when} ರಂದು ವರ್ಗಾಯಿಸಲಾಗಿದೆ', // REVIEW: native speaker
};
