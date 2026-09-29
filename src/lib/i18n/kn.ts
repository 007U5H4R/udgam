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
