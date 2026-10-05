import type { MessageKey } from './en';

// Kannada strings (TP18, N5). English is the shipped default; Kannada is chosen on the first-run
// language sheet (TKT-05) and later from the switch (TKT-11).
//
// PENDING REVIEW: every entry below is marked `// REVIEW: native speaker` and must be checked by a
// native Kannada speaker before release (Design.md §20 assumption). That includes all of the capture
// app's copy added by TKT-10 and TKT-11 (Home, the record flow, verdicts and farmer evidence lines,
// refusals, the saved-on-phone sheet and rows, Pickings and a picking's detail, Help, and the language
// sheet); none of it has been reviewed yet. Admin surfaces (`rail.*`, `phones.*`) are English only and
// fall back to en.ts.

/** Keys every farmer- and agent-facing language must carry (admin keys excluded). M-002 `agreements.*` carries drafts, like `buyer.*`. */
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

  'verdict.verified': 'ಪರಿಶೀಲಿತ', // REVIEW: native speaker
  'verdict.needsReview': 'ಪರಿಶೀಲನೆ ಬೇಕು', // REVIEW: native speaker
  'verdict.rejected': 'ಸ್ವೀಕರಿಸಿಲ್ಲ', // REVIEW: native speaker
  'tabs.label': 'ಮುಖ್ಯ', // REVIEW: native speaker
  'tabs.home': 'ಮುಖಪುಟ', // REVIEW: native speaker
  'tabs.pickings': 'ಕೊಯ್ಲುಗಳು', // REVIEW: native speaker
  'tabs.help': 'ಸಹಾಯ', // REVIEW: native speaker
  'home.record': 'ಇಂದಿನ ಕೊಯ್ಲು ದಾಖಲಿಸಿ', // REVIEW: native speaker
  'home.recent': 'ನಿಮ್ಮ ಇತ್ತೀಚಿನ ಕೊಯ್ಲುಗಳು', // REVIEW: native speaker
  'home.kg': '{kg} ಕೆಜಿ', // REVIEW: native speaker

  'home.greet.morning': 'ಶುಭೋದಯ', // REVIEW: native speaker
  'home.greet.afternoon': 'ಶುಭ ಮಧ್ಯಾಹ್ನ', // REVIEW: native speaker
  'home.greet.evening': 'ಶುಭ ಸಂಜೆ', // REVIEW: native speaker
  'home.plotName': 'ತೋಟ {n}', // REVIEW: native speaker
  'home.inside': 'ನೀವು {plot} ಒಳಗೆ ಇದ್ದೀರಿ', // REVIEW: native speaker
  'home.outside': 'ನೀವು {plot} ಇಂದ {m} ದೂರದಲ್ಲಿದ್ದೀರಿ', // REVIEW: native speaker
  'home.finding': 'ನಿಮ್ಮ ಸ್ಥಳ ಹುಡುಕಲಾಗುತ್ತಿದೆ…', // REVIEW: native speaker
  'home.denied': 'ಸ್ಥಳ ಆಫ್ ಆಗಿದೆ', // REVIEW: native speaker
  'home.deniedHelp': 'ಬ್ರೌಸರ್ ಸೆಟ್ಟಿಂಗ್‌ಗಳಲ್ಲಿ Udgam ಗೆ ಸ್ಥಳ ಅನುಮತಿಸಿ, ನಂತರ ಹಿಂತಿರುಗಿ.', // REVIEW: native speaker
  'home.facts': '{ha} ಹೆ · {crop} · ಕೊನೆಯ ಕೊಯ್ಲು {date}', // REVIEW: native speaker
  'home.factsNew': '{ha} ಹೆ · {crop} · ಇನ್ನೂ ಕೊಯ್ಲು ಆಗಿಲ್ಲ', // REVIEW: native speaker
  'home.changePlot': 'ತೋಟ ಬದಲಿಸಿ', // REVIEW: native speaker
  'home.choosePlot': 'ಒಂದು ತೋಟ ಆರಿಸಿ', // REVIEW: native speaker
  'home.close': 'ಮುಚ್ಚಿ', // REVIEW: native speaker
  'home.you': 'ನೀವು', // REVIEW: native speaker
  'home.mapLabel': '{plot} ನ ನಕ್ಷೆ. ಬಿಳಿ ಚುಕ್ಕೆ ನೀವು ಇರುವ ಜಾಗ ತೋರಿಸುತ್ತದೆ.', // REVIEW: native speaker
  'home.mapLabelNoFix': '{plot} ನ ನಕ್ಷೆ.', // REVIEW: native speaker
  'home.empty': 'ಇನ್ನೂ ಯಾವುದೇ ಕೊಯ್ಲು ದಾಖಲಾಗಿಲ್ಲ', // REVIEW: native speaker
  'home.noPlots.title': 'ಇನ್ನೂ ನಿಮಗೆ ಯಾವುದೇ ತೋಟ ನಿಯೋಜಿಸಿಲ್ಲ', // REVIEW: native speaker
  'home.noPlots.body': 'ನಿಮ್ಮ ತೋಟಗಳನ್ನು ನಿಯೋಜಿಸಲು ಕಚೇರಿಗೆ ಕೇಳಿ. ನಿಯೋಜಿಸಿದ ನಂತರ ಅವು ಇಲ್ಲಿ ಕಾಣಿಸುತ್ತವೆ.', // REVIEW: native speaker
  'home.error.title': 'ನಿಮ್ಮ ದಾಖಲೆಗಳನ್ನು ತೆರೆಯಲಾಗಲಿಲ್ಲ.', // REVIEW: native speaker
  'home.error.body': 'ಉಳಿಸಿದ ಕೊಯ್ಲುಗಳು ಈ ಫೋನಿನಲ್ಲಿ ಸುರಕ್ಷಿತವಾಗಿವೆ.', // REVIEW: native speaker
  'home.error.retry': 'ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ', // REVIEW: native speaker
  'home.loading': 'ನಿಮ್ಮ ತೋಟ ತೆರೆಯಲಾಗುತ್ತಿದೆ…', // REVIEW: native speaker
  'home.setUp': 'ಈ ಫೋನ್ ಸಿದ್ಧಪಡಿಸಿ', // REVIEW: native speaker
  'lang.label': 'ಭಾಷೆ', // REVIEW: native speaker
  'home.greeting': '{greet} · ', // REVIEW: native speaker
  'home.plotChoice': '{plot} · {farmer}', // REVIEW: native speaker
  'lang.kn': 'ಕನ್ನಡ', // REVIEW: native speaker
  'lang.en': 'English', // REVIEW: native speaker
  'rec.back': 'ಹಿಂದೆ', // REVIEW: native speaker
  'rec.photos.eyebrow': '{plot} · ಇಂದು', // REVIEW: native speaker
  'rec.photos.title': '{count} ವರೆಗೆ ತೆಗೆಯಿರಿ', // REVIEW: native speaker
  'rec.photos.count': '3 ಫೋಟೋಗಳು', // REVIEW: native speaker
  'rec.photos.lede': 'ಒಂದು ಫೋಟೋ ಸಾಕು.', // REVIEW: native speaker
  'rec.photos.more': ' ಕಚೇರಿ ಪರಿಶೀಲಿಸಬೇಕಾದರೆ ಹೆಚ್ಚು ಫೋಟೋಗಳು ಸಹಾಯ ಮಾಡುತ್ತವೆ.', // REVIEW: native speaker
  'rec.photos.yours': 'ನಿಮ್ಮ ಫೋಟೋಗಳು', // REVIEW: native speaker
  'rec.photos.counter': '3 ರಲ್ಲಿ {n}', // REVIEW: native speaker
  'rec.photos.slots': 'ಫೋಟೋ ಸ್ಥಳಗಳು', // REVIEW: native speaker
  'rec.slot.branch': 'ಕೊಂಬೆ', // REVIEW: native speaker
  'rec.slot.scale': 'ತಕ್ಕಡಿಯ ಮೇಲಿನ ಬುಟ್ಟಿ', // REVIEW: native speaker
  'rec.slot.pile': 'ದಿನದ ರಾಶಿ', // REVIEW: native speaker
  'rec.slot.added': 'ಸೇರಿಸಲಾಗಿದೆ', // REVIEW: native speaker
  'rec.slot.next': 'ಮುಂದಿನದು', // REVIEW: native speaker
  'rec.slot.example': 'ಉದಾಹರಣೆ', // REVIEW: native speaker
  'rec.camera': 'ಕ್ಯಾಮೆರಾ ತೆರೆಯಿರಿ', // REVIEW: native speaker
  'rec.continue1': '1 ಫೋಟೋದೊಂದಿಗೆ ಮುಂದುವರಿಸಿ', // REVIEW: native speaker
  'rec.continueN': '{n} ಫೋಟೋಗಳೊಂದಿಗೆ ಮುಂದುವರಿಸಿ', // REVIEW: native speaker
  'rec.needOne': 'ಕನಿಷ್ಠ 1 ಫೋಟೋ ಬೇಕು.', // REVIEW: native speaker
  'rec.review.eyebrow': '3 ರಲ್ಲಿ ಫೋಟೋ {n} · {slot}', // REVIEW: native speaker
  'rec.review.alt': 'ನಿಮ್ಮ ಫೋಟೋ: {slot}', // REVIEW: native speaker
  'rec.review.title': 'ಫೋಟೋ {clear} ಇದೆಯೇ?', // REVIEW: native speaker
  'rec.review.clear': 'ಸ್ಪಷ್ಟವಾಗಿ', // REVIEW: native speaker
  'rec.review.check': 'ಪರಿಶೀಲಿಸಿ:', // REVIEW: native speaker
  'rec.review.focus': 'ಅದು ಸ್ಪಷ್ಟವಾಗಿದೆ', // REVIEW: native speaker
  'rec.review.seen': 'ಕಾಫಿ ಹಣ್ಣುಗಳು ಕಾಣುತ್ತಿವೆ', // REVIEW: native speaker
  'rec.review.dark': 'ಅದು ತುಂಬಾ ಕತ್ತಲಾಗಿಲ್ಲ', // REVIEW: native speaker
  'rec.review.use': 'ಈ ಫೋಟೋ ಬಳಸಿ', // REVIEW: native speaker
  'rec.review.again': 'ಮತ್ತೆ ತೆಗೆಯಿರಿ', // REVIEW: native speaker
  'rec.review.type': 'ಈ ಫೋಟೋ ಕಚೇರಿ ಓದಬಹುದಾದ ಕ್ಯಾಮೆರಾ ಚಿತ್ರವಲ್ಲ. ಕ್ಯಾಮೆರಾ ತೆರೆಯಿರಿ ಬಳಸಿ ಮತ್ತೆ ತೆಗೆಯಿರಿ.', // REVIEW: native speaker
  'rec.review.size': 'ಈ ಫೋಟೋ ಕಳುಹಿಸಲು ತುಂಬಾ ದೊಡ್ಡದಾಗಿದೆ. ಮತ್ತೆ ತೆಗೆಯಿರಿ.', // REVIEW: native speaker
  'rec.review.read': 'ಈ ಫೋಟೋವನ್ನು ಓದಲಾಗಲಿಲ್ಲ. ಮತ್ತೆ ತೆಗೆಯಿರಿ.', // REVIEW: native speaker
  'gps.finding': 'ನಿಮ್ಮ ಸ್ಥಳ ಹುಡುಕಲಾಗುತ್ತಿದೆ…', // REVIEW: native speaker
  'gps.weak': 'ಉತ್ತಮ ಸ್ಥಳಕ್ಕಾಗಿ ತೆರೆದ ಆಕಾಶದ ಕೆಳಗೆ ಬನ್ನಿ. ನೀವು ಈಗಲೂ ದಾಖಲಿಸಬಹುದು.', // REVIEW: native speaker
  'gps.denied': 'ಸ್ಥಳ ಆಫ್ ಆಗಿದೆ. ಅನುಮತಿಸಲು:', // REVIEW: native speaker
  'gps.step1': 'ವೆಬ್ ವಿಳಾಸದ ಪಕ್ಕದ ಬೀಗದ ಚಿಹ್ನೆ ಒತ್ತಿ.', // REVIEW: native speaker
  'gps.step2': 'ಸ್ಥಳಕ್ಕೆ ಅನುಮತಿಸಿ ಆರಿಸಿ, ನಂತರ ಈ ಪುಟಕ್ಕೆ ಹಿಂತಿರುಗಿ.', // REVIEW: native speaker
  'rec.kg.eyebrow1': '{plot} · 1 ಫೋಟೋ', // REVIEW: native speaker
  'rec.kg.eyebrowN': '{plot} · {n} ಫೋಟೋಗಳು', // REVIEW: native speaker
  'rec.kg.title': 'ಎಷ್ಟು ಕಿಲೋ?', // REVIEW: native speaker
  'rec.kg.unit': 'ಕೆಜಿ', // REVIEW: native speaker
  'rec.kg.hint': 'ನಿಮ್ಮ ಇತ್ತೀಚಿನ ಕೊಯ್ಲುಗಳು: {min}–{max} ಕೆಜಿ', // REVIEW: native speaker
  'rec.kg.keys': 'ಸಂಖ್ಯೆ ಕೀಲಿಗಳು', // REVIEW: native speaker
  'rec.kg.decimal': 'ದಶಮಾಂಶ ಬಿಂದು', // REVIEW: native speaker
  'rec.kg.delete': 'ಅಳಿಸಿ', // REVIEW: native speaker
  'rec.kg.send': '{kg} ಕೆಜಿ ಕಳುಹಿಸಿ', // REVIEW: native speaker
  'rec.kg.type': 'ತೂಕ ನಮೂದಿಸಿ', // REVIEW: native speaker
  'rec.chk.title': 'ನಿಮ್ಮ ಕೊಯ್ಲನ್ನು ಪರಿಶೀಲಿಸಲಾಗುತ್ತಿದೆ', // REVIEW: native speaker
  'rec.chk.sub1': '{kg} ಕೆಜಿ · {plot} · 1 ಫೋಟೋ', // REVIEW: native speaker
  'rec.chk.subN': '{kg} ಕೆಜಿ · {plot} · {n} ಫೋಟೋಗಳು', // REVIEW: native speaker
  'rec.chk.bar': 'ಮುಗಿದ ಪರಿಶೀಲನೆಗಳು', // REVIEW: native speaker
  'rec.chk.progress': '6 ರಲ್ಲಿ {k} ಪರಿಶೀಲನೆಗಳು ಮುಗಿದಿವೆ', // REVIEW: native speaker
  'rec.chk.done': 'ಮುಗಿದಿದೆ', // REVIEW: native speaker
  'rec.chk.now': 'ಪರಿಶೀಲಿಸಲಾಗುತ್ತಿದೆ', // REVIEW: native speaker
  'rec.chk.wait': 'ಕಾಯಲಾಗುತ್ತಿದೆ', // REVIEW: native speaker
  'rec.chk.caption': 'ಇದಕ್ಕೆ ಸಾಮಾನ್ಯವಾಗಿ 30 ಸೆಕೆಂಡುಗಳಿಗಿಂತ ಕಡಿಮೆ ಸಮಯ ಬೇಕು.', // REVIEW: native speaker
  'rec.chk.announce': '{name}: ಮುಗಿದಿದೆ.', // REVIEW: native speaker
  'rec.chk.ready': 'ಎಲ್ಲಾ 6 ಪರಿಶೀಲನೆಗಳು ಮುಗಿದಿವೆ. ನಿಮ್ಮ ಫಲಿತಾಂಶ ಸಿದ್ಧವಾಗಿದೆ.', // REVIEW: native speaker
  'rec.chk.see': 'ಫಲಿತಾಂಶ ನೋಡಿ', // REVIEW: native speaker
  'grp.seal': 'ನಿಮ್ಮ ಫೋನಿನ ಮುದ್ರೆ', // REVIEW: native speaker
  'grp.inside': '{plot} ಒಳಗೆ', // REVIEW: native speaker
  'grp.photos': 'ಫೋಟೋಗಳು ಹೊಸದು', // REVIEW: native speaker
  'grp.forest': '{plot} ಗಾಗಿ ಅರಣ್ಯ ನಕ್ಷೆ', // REVIEW: native speaker
  'grp.satellite': 'ಈ ತಿಂಗಳ ಉಪಗ್ರಹ ನೋಟ', // REVIEW: native speaker
  'grp.harvest': 'ಈ ತೋಟದ ಇಳುವರಿ ಗಾತ್ರ', // REVIEW: native speaker
  'v.sub': '{plot} ಇಂದ ನಿಮ್ಮ {kg} ದಾಖಲಾಗಿದೆ.', // REVIEW: native speaker
  'v.subBad': '{plot} ಇಂದ ನಿಮ್ಮ {kg} ಸ್ವೀಕರಿಸಲಾಗಲಿಲ್ಲ.', // REVIEW: native speaker
  'v.kg': '{kg} ಕೆಜಿ', // REVIEW: native speaker
  'v.evidence.ok': 'ಏನನ್ನು ಪರಿಶೀಲಿಸಲಾಯಿತು', // REVIEW: native speaker
  'v.evidence.check': 'ಏಕೆ, ಮತ್ತು ಮುಂದೇನು', // REVIEW: native speaker
  'v.evidence.bad': 'ಏಕೆ, ಮತ್ತು ಏನು ಮಾಡಬೇಕು', // REVIEW: native speaker
  'v.check.title': 'ಕಚೇರಿ ಇದನ್ನು ಪರಿಶೀಲಿಸುತ್ತದೆ', // REVIEW: native speaker
  'v.check.saved': 'ನಿಮ್ಮ {kg} ಮತ್ತು ಫೋಟೋಗಳು ಉಳಿಸಲಾಗಿವೆ.', // REVIEW: native speaker
  'v.done': 'ಮುಗಿಯಿತು', // REVIEW: native speaker
  'rec.saved.offline': 'ಇಲ್ಲಿ ನೆಟ್‌ವರ್ಕ್ ಇಲ್ಲ', // REVIEW: native speaker
  'rec.saved.server': 'ಕಳುಹಿಸಲಾಗಲಿಲ್ಲ', // REVIEW: native speaker
  'rec.saved.body': 'ಏನೂ ಕಳೆದುಹೋಗಿಲ್ಲ: {photos} ಮತ್ತು {kg} ಈ ಫೋನಿನಲ್ಲಿ ಉಳಿಸಲಾಗಿದೆ.', // REVIEW: native speaker
  'rec.saved.retry': 'ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ', // REVIEW: native speaker
  'rec.saved.later': 'ನಂತರ ಪ್ರಯತ್ನಿಸಿ', // REVIEW: native speaker
  'rec.saved.waitSec1': '1 ಸೆಕೆಂಡಿನ ನಂತರ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಬಹುದು.', // REVIEW: native speaker
  'rec.saved.waitSec': '{sec} ಸೆಕೆಂಡುಗಳ ನಂತರ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಬಹುದು.', // REVIEW: native speaker
  'rec.saved.wait1': '1 ನಿಮಿಷದ ನಂತರ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಬಹುದು.', // REVIEW: native speaker
  'rec.saved.waitMin': '{min} ನಿಮಿಷಗಳ ನಂತರ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಬಹುದು.', // REVIEW: native speaker
  'rec.photos1': '1 ಫೋಟೋ', // REVIEW: native speaker
  'rec.photosN': '{n} ಫೋಟೋಗಳು', // REVIEW: native speaker
  'rec.noDevice': 'ಈ ಫೋನ್ ಇನ್ನೂ ಕೊಯ್ಲುಗಳಿಗೆ ಸಿದ್ಧವಾಗಿಲ್ಲ.', // REVIEW: native speaker
  'pend.label': 'ಈ ಫೋನಿನಲ್ಲಿ ಉಳಿಸಲಾಗಿದೆ, ಇನ್ನೂ ಕಳುಹಿಸಿಲ್ಲ', // REVIEW: native speaker
  'pend.saved': 'ಈ ಫೋನಿನಲ್ಲಿ ಉಳಿಸಲಾಗಿದೆ', // REVIEW: native speaker
  'pend.send': 'ಈಗ ಕಳುಹಿಸಿ', // REVIEW: native speaker
  'pend.sending': 'ಕಳುಹಿಸಲಾಗುತ್ತಿದೆ…', // REVIEW: native speaker
  'pend.kept': 'ಏನೂ ಕಳೆದುಹೋಗಿಲ್ಲ: ನಿಮ್ಮ ಕೊಯ್ಲುಗಳು ಇನ್ನೂ ಈ ಫೋನಿನಲ್ಲಿ ಉಳಿಸಲಾಗಿವೆ.', // REVIEW: native speaker
  'pend.unreadable': 'ಉಳಿಸಿದ ಈ ಕೊಯ್ಲನ್ನು ಕಳುಹಿಸಲಾಗುವುದಿಲ್ಲ. ಈ ಫೋನನ್ನು ಕಚೇರಿಗೆ ತೋರಿಸಿ.', // REVIEW: native speaker
  'pk.title': 'ನಿಮ್ಮ ಕೊಯ್ಲುಗಳು', // REVIEW: native speaker
  'pk.loading': 'ನಿಮ್ಮ ಕೊಯ್ಲುಗಳನ್ನು ತೆರೆಯಲಾಗುತ್ತಿದೆ…', // REVIEW: native speaker
  'pk.emptyBody': 'ನೀವು ಕಳುಹಿಸಿದ ಕೊಯ್ಲುಗಳು ಕಚೇರಿ ಕಂಡದ್ದರೊಂದಿಗೆ ಇಲ್ಲಿ ಕಾಣುತ್ತವೆ.', // REVIEW: native speaker
  'pk.count': '{n} ಕೊಯ್ಲುಗಳು · {plots}', // REVIEW: native speaker
  'pk.count1': '1 ಕೊಯ್ಲು · {plots}', // REVIEW: native speaker
  'pk.noKg': 'ತೂಕ ಇಲ್ಲ', // REVIEW: native speaker
  'pk.why.check': '{reason} ಕಚೇರಿ ಇದನ್ನು ಪರಿಶೀಲಿಸುತ್ತಿದೆ.', // REVIEW: native speaker
  'pk.whatCanIDo': 'ನಾನು ಏನು ಮಾಡಬಹುದು?', // REVIEW: native speaker
  'dt.back': 'ಕೊಯ್ಲುಗಳಿಗೆ ಹಿಂತಿರುಗಿ', // REVIEW: native speaker
  'dt.title': '{kg} · {plot}', // REVIEW: native speaker
  'dt.received': 'ಕಚೇರಿ ಸ್ವೀಕರಿಸಿದ ಸಮಯ', // REVIEW: native speaker
  'dt.photo': 'ಫೋಟೋ {n}', // REVIEW: native speaker
  'dt.seeAll': 'ಎಲ್ಲಾ ಪರಿಶೀಲನೆಗಳನ್ನು ನೋಡಿ', // REVIEW: native speaker
  'dt.state.ok': 'ಸರಿಯಾಗಿದೆ', // REVIEW: native speaker
  'dt.state.flag': 'ಒಮ್ಮೆ ನೋಡಬೇಕು', // REVIEW: native speaker
  'dt.state.fail': 'ಸರಿಯಾಗಿಲ್ಲ', // REVIEW: native speaker
  'dt.state.unavailable': 'ನಡೆಸಲಾಗಲಿಲ್ಲ', // REVIEW: native speaker
  'dt.state.none': 'ನಡೆಸಿಲ್ಲ', // REVIEW: native speaker
  'help.title': 'ಸಹಾಯ', // REVIEW: native speaker
  'help.record': 'ನಿಮ್ಮ ತೋಟದ ಒಳಗೆ ನಿಂತು, {record} ಒತ್ತಿ. ಒಂದು ಫೋಟೋ ಸಾಕು.', // REVIEW: native speaker
  'help.photos': 'ಹಗಲು ಬೆಳಕಿನಲ್ಲಿ ಫೋಟೋ ತೆಗೆಯಿರಿ, ಫೋನನ್ನು ಅಲುಗಾಡಿಸದೆ ಹಿಡಿಯಿರಿ, ಹಣ್ಣುಗಳು ಕಾಣುವಂತೆ.', // REVIEW: native speaker
  'help.gallery': 'ಫೋಟೋಗಳು ಕ್ಯಾಮೆರಾದಿಂದಲೇ ಬರುತ್ತವೆ, ಗ್ಯಾಲರಿಯಿಂದ ಎಂದಿಗೂ ಅಲ್ಲ: ತೆಗೆದಾಗಲೇ ಈ ಫೋನ್ ಪ್ರತಿ ಫೋಟೋಗೆ ಮುದ್ರೆ ಹಾಕುತ್ತದೆ, ಅದು ಹೊಸದೆಂದು ಕಚೇರಿಗೆ ತಿಳಿಯುತ್ತದೆ.', // REVIEW: native speaker
  'help.verified': 'ಕಚೇರಿಗೆ ಬೇಕಾದುದು ಸಿಕ್ಕಿದೆ. ಏನೂ ಮಾಡಬೇಕಿಲ್ಲ.', // REVIEW: native speaker
  'help.check': 'ಕಚೇರಿ ಈ ಕೊಯ್ಲನ್ನು ನೋಡುತ್ತದೆ. ನೀವು ಏನೂ ಮಾಡಬೇಕಿಲ್ಲ.', // REVIEW: native speaker
  'help.rejected': 'ಕೊಯ್ಲನ್ನು ಸ್ವೀಕರಿಸಲಾಗಲಿಲ್ಲ. ಏಕೆ ಮತ್ತು ಏನು ಮಾಡಬೇಕು ಎಂದು ಪರದೆ ಹೇಳುತ್ತದೆ.', // REVIEW: native speaker
  'help.call': 'ಕೊಯ್ಲಿನ ಬಗ್ಗೆ ಪ್ರಶ್ನೆಗಳಿವೆಯೇ? {org} ಕಚೇರಿಗೆ ಕರೆ ಮಾಡಿ:', // REVIEW: native speaker
  'help.callLink': '{phone}', // REVIEW: native speaker
  'help.language': 'ಭಾಷೆ:', // REVIEW: native speaker
  'help.thisPhone': 'ಈ ಫೋನ್:', // REVIEW: native speaker
  'help.phoneLoading': 'ಹುಡುಕಲಾಗುತ್ತಿದೆ…', // REVIEW: native speaker
  'help.phoneSetUp': '{id}, {date} ರಂದು ಸಿದ್ಧಪಡಿಸಲಾಗಿದೆ', // REVIEW: native speaker
  'help.phoneId': '{id}', // REVIEW: native speaker
  'lang.kannada': 'Kannada', // REVIEW: native speaker (the language sheet names English words in English)
  'lang.sheet.kn': 'ಭಾಷೆ', // REVIEW: native speaker
  'lang.sheet.en': 'Language', // REVIEW: native speaker (the language sheet names English words in English)
  'attest.certifiedBy': 'ಪ್ರಮಾಣೀಕರಿಸಿದವರು', // REVIEW: native speaker
  'rec.noFix': 'ನಿಮ್ಮ ಸ್ಥಳ ಇನ್ನೂ ಸಿಗಲಿಲ್ಲ. ಸ್ವಲ್ಪ ಕಾಯಿರಿ, ನಂತರ ಮತ್ತೆ ಕಳುಹಿಸಿ.', // REVIEW: native speaker
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
  'fe.move.far': 'ಈ ಕೊಯ್ಲು ನಿಮ್ಮ ಹಿಂದಿನದರಿಂದ {m} ದೂರ, ಕೇವಲ {min}\u00a0ನಿಮಿಷ ನಂತರ.', // REVIEW: native speaker
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
  'fe.demo': ' (ಡೆಮೊ\u00a0ಡೇಟಾ)', // REVIEW: native speaker (EXE12 "(demo data)" label; starts with a space)
  'fe.office': 'ಕಚೇರಿ ಇದನ್ನು ನೋಡುತ್ತದೆ. ಉತ್ತರವನ್ನು ನೀವು ಕೊಯ್ಲುಗಳು ಪುಟದಲ್ಲಿ ನೋಡುತ್ತೀರಿ. ನೀವು ಏನೂ ಮಾಡಬೇಕಿಲ್ಲ.', // REVIEW: native speaker (EXE24 OD-5 draft)
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
  'refusal.device_not_owned.todo': 'ನಿಮ್ಮ ಸ್ವಂತ ಖಾತೆಯಿಂದ ಸೈನ್ ಇನ್ ಮಾಡಿ, ನಂತರ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ. ಅಥವಾ ಈ ಫೋನನ್ನು ನಿಮಗಾಗಿ ಸಿದ್ಧಪಡಿಸಲು ಕಚೇರಿಗೆ ಕೇಳಿ.', // REVIEW: native speaker
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
  'refusal.length_required.todo': 'ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ. ಮತ್ತೆ ಹೀಗಾದರೆ, ಕಚೇರಿಗೆ ತಿಳಿಸಿ.', // REVIEW: native speaker
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
  'refusal.forbidden.happened': 'ಕೊಯ್ಲುಗಳನ್ನು ಕಳುಹಿಸಲಾಗದ ಖಾತೆಯಿಂದ ನೀವು ಸೈನ್ ಇನ್ ಆಗಿದ್ದೀರಿ.', // REVIEW: native speaker
  'refusal.forbidden.todo': 'ನಿಮ್ಮ ಕ್ಷೇತ್ರ ಖಾತೆಯಿಂದ ಸೈನ್ ಇನ್ ಮಾಡಿ, ನಂತರ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.', // REVIEW: native speaker
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
  'batches.transfer.buyer': 'ಯಾರಿಗೆ ಒಪ್ಪಿಸಬೇಕು', // REVIEW: native speaker (M-002 T4: "Hand to")
  'batches.transfer.choose': 'ಖರೀದಿದಾರ ಅಥವಾ ಸಂಸ್ಕರಣಕಾರರನ್ನು ಆರಿಸಿ', // REVIEW: native speaker
  'batches.transfer.hint': 'ಸಂಸ್ಕರಣಕಾರರು ಸಂಸ್ಕರಣೆಯ ಹಂತವನ್ನು ದಾಖಲಿಸಿ, ನಂತರ ಬ್ಯಾಚ್ ಅನ್ನು ಖರೀದಿದಾರರಿಗೆ ಒಪ್ಪಿಸುತ್ತಾರೆ.', // REVIEW: native speaker
  'batches.transfer.group.buyers': 'ಖರೀದಿದಾರರು', // REVIEW: native speaker
  'batches.transfer.group.processors': 'ಸಂಸ್ಕರಣಕಾರರು', // REVIEW: native speaker
  'batches.transfer.note': 'ಇದಕ್ಕೆ ಸಹಿ ಹಾಕಿ ಶಾಶ್ವತವಾಗಿ ದಾಖಲಿಸಲಾಗುತ್ತದೆ. ಸರ್ವರ್ ನಿಮ್ಮ ಖಾತೆಯ ಪರವಾಗಿ ಸಹಿ ಹಾಕುತ್ತದೆ, ಮತ್ತು ಬ್ಯಾಚ್ ಲಾಕ್ ಆಗುತ್ತದೆ.', // REVIEW: native speaker
  'batches.transfer.submit': 'ಸಹಿ ಹಾಕಿ ವರ್ಗಾಯಿಸಿ', // REVIEW: native speaker
  'batches.transfer.working': 'ಸಹಿ ಹಾಕಲಾಗುತ್ತಿದೆ…', // REVIEW: native speaker
  'batches.transfer.noBuyers': 'ಇನ್ನೂ ಯಾವುದೇ ಖರೀದಿದಾರ ಅಥವಾ ಸಂಸ್ಕರಣಕಾರ ಸಂಸ್ಥೆ ಸಿದ್ಧವಾಗಿಲ್ಲ.', // REVIEW: native speaker
  'batches.transfer.error.not_open': 'ಈ ಬ್ಯಾಚ್ ಈಗಾಗಲೇ ವರ್ಗಾಯಿಸಲಾಗಿದೆ. ಬೇರೆ ಏನೂ ದಾಖಲಾಗಿಲ್ಲ.', // REVIEW: native speaker
  'batches.transfer.error.not_buyer': 'ಪಟ್ಟಿಯಿಂದ ಖರೀದಿದಾರ ಅಥವಾ ಸಂಸ್ಕರಣಕಾರರನ್ನು ಆರಿಸಿ.', // REVIEW: native speaker
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
  // M-002 contract farming (TKT-25): the buyer and FPO-admin agreement screens, drafts like `buyer.*`.
  'agreements.link.buyer': 'ಎಫ್‌ಪಿಒಗಳೊಂದಿಗಿನ ಒಪ್ಪಂದಗಳು', // REVIEW: native speaker
  'agreements.link.admin': 'ಖರೀದಿದಾರರೊಂದಿಗಿನ ಒಪ್ಪಂದಗಳು', // REVIEW: native speaker
  'agreements.toBatches': 'ಬ್ಯಾಚ್‌ಗಳು', // REVIEW: native speaker
  'agreements.back': 'ಒಪ್ಪಂದಗಳಿಗೆ ಹಿಂತಿರುಗಿ', // REVIEW: native speaker
  'agreements.eyebrow': '{org} · ಒಪ್ಪಂದಗಳು', // REVIEW: native speaker
  'agreements.detailEyebrow': 'ಒಪ್ಪಂದ · {other}', // REVIEW: native speaker
  'agreements.details': 'ವಿವರಗಳು', // REVIEW: native speaker
  'agreements.row.id': '{id} · {other}', // REVIEW: native speaker
  'agreements.kg': '{kg} ಕೆಜಿ', // REVIEW: native speaker
  'agreements.mock': 'ಅಣಕು INR · ನಿಜವಾದ ಹಣವಲ್ಲ', // REVIEW: native speaker
  'agreements.retry': 'ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ', // REVIEW: native speaker
  'agreements.and': 'ಮತ್ತು', // REVIEW: native speaker
  'agreements.nothingChanged': 'ಏನೂ ಬದಲಾಗಿಲ್ಲ.', // REVIEW: native speaker
  'agreements.crop.arabica': 'ಅರೇಬಿಕಾ ಹಣ್ಣು', // REVIEW: native speaker
  'agreements.crop.robusta': 'ರೋಬಸ್ಟಾ ಹಣ್ಣು', // REVIEW: native speaker
  'agreements.empty.title': 'ಇನ್ನೂ ಯಾವುದೇ ಒಪ್ಪಂದಗಳಿಲ್ಲ.', // REVIEW: native speaker
  'agreements.buyer.title': 'ಒಪ್ಪಂದಗಳು', // REVIEW: native speaker
  'agreements.buyer.sub': 'ಹಣವನ್ನು ಎಸ್ಕ್ರೋದಲ್ಲಿ ಇಡಲಾಗುತ್ತದೆ ಮತ್ತು ಮೂರೂ ಷರತ್ತುಗಳು ಪೂರೈಸಿದಾಗ ಮಾತ್ರ ಎಫ್‌ಪಿಒಗೆ ಪಾವತಿಸಲಾಗುತ್ತದೆ. ಮೊತ್ತಗಳು ಅಣಕು INR.', // REVIEW: native speaker
  'agreements.buyer.loading': 'ನಿಮ್ಮ ಒಪ್ಪಂದಗಳನ್ನು ತೆರೆಯಲಾಗುತ್ತಿದೆ…', // REVIEW: native speaker
  'agreements.buyer.errTitle': 'ನಿಮ್ಮ ಒಪ್ಪಂದಗಳನ್ನು ತೆರೆಯಲಾಗಲಿಲ್ಲ.', // REVIEW: native speaker
  'agreements.buyer.emptyBody': 'ಎಫ್‌ಪಿಒ ಜೊತೆ ಒಂದನ್ನು ರಚಿಸಿ: ನಿಮಗೆ ಬೇಕಾದ ಪ್ರಮಾಣ, ನೀವು ಒಪ್ಪುವ ಕನಿಷ್ಠ ದರ್ಜೆ ಮತ್ತು ನೀವು ಪಾವತಿಸುವ ಮೊತ್ತ.', // REVIEW: native speaker
  'agreements.buyer.listLabel': 'ನಿಮ್ಮ ಒಪ್ಪಂದಗಳು', // REVIEW: native speaker
  'agreements.buyer.pick': 'ನಿಯಮಗಳು, ಫಲಿತಾಂಶ ಮತ್ತು ಮೂರು ಷರತ್ತುಗಳನ್ನು ನೋಡಲು ಒಂದು ಒಪ್ಪಂದ ಆರಿಸಿ.', // REVIEW: native speaker
  'agreements.fpo.title': 'ಖರೀದಿದಾರರೊಂದಿಗಿನ ಒಪ್ಪಂದಗಳು', // REVIEW: native speaker
  'agreements.fpo.sub': 'ನಿಮಗಾಗಿ ಎಸ್ಕ್ರೋದಲ್ಲಿ ಇಟ್ಟ ಪಾವತಿಗಳು. ಪ್ರತಿಯೊಂದೂ ಅದರ ಮೂರು ಷರತ್ತುಗಳು ಪೂರೈಸಿದಾಗ ಪಾವತಿಯಾಗುತ್ತದೆ.', // REVIEW: native speaker
  'agreements.fpo.loading': 'ಒಪ್ಪಂದಗಳನ್ನು ತೆರೆಯಲಾಗುತ್ತಿದೆ…', // REVIEW: native speaker
  'agreements.fpo.errTitle': 'ಒಪ್ಪಂದಗಳನ್ನು ತೆರೆಯಲಾಗಲಿಲ್ಲ.', // REVIEW: native speaker
  'agreements.fpo.emptyBody': 'ಖರೀದಿದಾರರು ನಿಮ್ಮ ಎಫ್‌ಪಿಒ ಜೊತೆ ಒಪ್ಪಂದ ರಚಿಸಿದಾಗ ಅದು ಇಲ್ಲಿ ಕಾಣಿಸುತ್ತದೆ.', // REVIEW: native speaker
  'agreements.fpo.pick': 'ಇತ್ಯರ್ಥದ ಷರತ್ತುಗಳನ್ನು ನೋಡಲು ಒಂದು ಒಪ್ಪಂದ ಆರಿಸಿ.', // REVIEW: native speaker
  'agreements.notFound.title': 'ನಿಮ್ಮ ಖಾತೆಗೆ ಅಂತಹ ಒಪ್ಪಂದವಿಲ್ಲ.', // REVIEW: native speaker
  'agreements.notFound.titleId': 'ನಿಮ್ಮ ಖಾತೆಗೆ {id} ಒಪ್ಪಂದವಿಲ್ಲ.', // REVIEW: native speaker
  'agreements.notFound.body': 'ಸಂಖ್ಯೆಯನ್ನು ಪರಿಶೀಲಿಸಿ, ಅಥವಾ ನಿಮ್ಮ ಒಪ್ಪಂದಗಳಿಗೆ ಹಿಂತಿರುಗಿ.', // REVIEW: native speaker
  'agreements.status.released': 'ಪಾವತಿ ಬಿಡುಗಡೆಯಾಗಿದೆ', // REVIEW: native speaker
  'agreements.status.notReleased': 'ಬಿಡುಗಡೆಯಾಗಿಲ್ಲ', // REVIEW: native speaker
  'agreements.status.releasedOn': 'ಪಾವತಿ ಬಿಡುಗಡೆಯಾಗಿದೆ · {date}', // REVIEW: native speaker
  'agreements.status.refunded': 'ಹಣ ಹಿಂತಿರುಗಿಸಲಾಗಿದೆ', // REVIEW: native speaker
  'agreements.status.notFunded': 'ಇನ್ನೂ ಹಣ ಹಾಕಿಲ್ಲ', // REVIEW: native speaker
  'agreements.status.buyerNotFunded': 'ಖರೀದಿದಾರರು ಇನ್ನೂ ಹಣ ಹಾಕಿಲ್ಲ', // REVIEW: native speaker
  'agreements.status.deadlineTakeBack': 'ಗಡುವು ಮುಗಿದಿದೆ · ನೀವು ಹಣವನ್ನು ಹಿಂಪಡೆಯಬಹುದು', // REVIEW: native speaker
  'agreements.status.deadlineNotSettled': 'ಗಡುವು ಮುಗಿದಿದೆ · ಇತ್ಯರ್ಥವಾಗಿಲ್ಲ', // REVIEW: native speaker
  'agreements.status.needsGrade': 'ತಲುಪಿದೆ · ನಿಮ್ಮ ದರ್ಜೆ ಬೇಕು', // REVIEW: native speaker
  'agreements.status.needsGradeShort': 'ನಿಮ್ಮ ದರ್ಜೆ ಬೇಕು', // REVIEW: native speaker
  'agreements.status.notReleasedYet': 'ಇನ್ನೂ ಬಿಡುಗಡೆಯಾಗಿಲ್ಲ', // REVIEW: native speaker
  'agreements.status.notReleasedYetCount': 'ಇನ್ನೂ ಬಿಡುಗಡೆಯಾಗಿಲ್ಲ · {count}', // REVIEW: native speaker
  'agreements.status.notReleasedCount': 'ಬಿಡುಗಡೆಯಾಗಿಲ್ಲ · {count}', // REVIEW: native speaker
  'agreements.status.waitingDelivery': 'ಹಣ ಹಾಕಲಾಗಿದೆ · ವಿತರಣೆಗಾಗಿ ಕಾಯುತ್ತಿದೆ', // REVIEW: native speaker
  'agreements.status.ready': 'ಇತ್ಯರ್ಥಕ್ಕೆ ಸಿದ್ಧ', // REVIEW: native speaker
  'agreements.status.waitingBuyerGrade': 'ತಲುಪಿದೆ · ಖರೀದಿದಾರರ ದರ್ಜೆಗಾಗಿ ಕಾಯುತ್ತಿದೆ', // REVIEW: native speaker
  'agreements.status.waitingBuyerGradeShort': 'ಖರೀದಿದಾರರ ದರ್ಜೆಗಾಗಿ ಕಾಯುತ್ತಿದೆ', // REVIEW: native speaker
  'agreements.status.waitingGrade': 'ದರ್ಜೆಗಾಗಿ ಕಾಯುತ್ತಿದೆ', // REVIEW: native speaker
  'agreements.notMetCount.one': '1 ಷರತ್ತು ಪೂರೈಸಿಲ್ಲ', // REVIEW: native speaker
  'agreements.notMetCount.many': '{n} ಷರತ್ತುಗಳು ಪೂರೈಸಿಲ್ಲ', // REVIEW: native speaker
  'agreements.row.facts': '{crop} · {amount} · {when}', // REVIEW: native speaker
  'agreements.row.cropArabica': 'ಅರೇಬಿಕಾ', // REVIEW: native speaker
  'agreements.row.cropRobusta': 'ರೋಬಸ್ಟಾ', // REVIEW: native speaker
  'agreements.row.by': '{date} ರೊಳಗೆ', // REVIEW: native speaker
  'agreements.row.takenBack': '{date} ರಂದು ಹಿಂಪಡೆಯಲಾಗಿದೆ', // REVIEW: native speaker
  'agreements.changed.title': 'ಈ ಒಪ್ಪಂದ ಬದಲಾಗಿದೆ.', // REVIEW: native speaker
  'agreements.changed.body': 'ಏನೂ ಸರಿಯಲಿಲ್ಲ. ಅದರ ಈಗಿನ ಸ್ಥಿತಿ ನೋಡಲು ಪುಟವನ್ನು ಮತ್ತೆ ತೆರೆಯಿರಿ.', // REVIEW: native speaker
  'agreements.meta.created': '{when} ರಂದು ರಚಿಸಲಾಗಿದೆ · ನೀವು ಹಣ ಹಾಕುವವರೆಗೆ ಏನನ್ನೂ ಇಡಲಾಗುವುದಿಲ್ಲ', // REVIEW: native speaker
  'agreements.meta.funded': '{when} ರಂದು ಹಣ ಹಾಕಲಾಗಿದೆ · {amount} (ಅಣಕು INR) ಎಸ್ಕ್ರೋದಲ್ಲಿದೆ', // REVIEW: native speaker
  'agreements.meta.endedNothing': '{funded} ರಂದು ಹಣ ಹಾಕಲಾಗಿದೆ · {deadline} ರಂದು ಮುಗಿದಿದೆ · ಇದರಡಿ ಏನೂ ತಲುಪಿಲ್ಲ', // REVIEW: native speaker
  'agreements.meta.endedNotSettled': '{funded} ರಂದು ಹಣ ಹಾಕಲಾಗಿದೆ · {deadline} ರಂದು ಮುಗಿದಿದೆ · ಇತ್ಯರ್ಥವಾಗಿಲ್ಲ', // REVIEW: native speaker
  'agreements.meta.delivered': '{when} ರಂದು ರಚಿಸಲಾಗಿದೆ · ಬ್ಯಾಚ್ {batch} {delivered} ರಂದು ತಲುಪಿದೆ', // REVIEW: native speaker
  'agreements.meta.createdOnly': '{when} ರಂದು ರಚಿಸಲಾಗಿದೆ', // REVIEW: native speaker
  'agreements.meta.adminCreated': '{when} ರಂದು ರಚಿಸಲಾಗಿದೆ · ಗಡುವು {deadline}', // REVIEW: native speaker
  'agreements.meta.adminFunded': '{funded} ರಂದು ಹಣ ಹಾಕಲಾಗಿದೆ · ಗಡುವು {deadline}', // REVIEW: native speaker
  'agreements.meta.adminDelivered': '{funded} ರಂದು ಹಣ ಹಾಕಲಾಗಿದೆ · ಬ್ಯಾಚ್ {batch} {delivered} ರಂದು ತಲುಪಿದೆ · ಗಡುವು {deadline}', // REVIEW: native speaker
  'agreements.terms.title': 'ನಿಯಮಗಳು', // REVIEW: native speaker
  'agreements.terms.crop': 'ಬೆಳೆ', // REVIEW: native speaker
  'agreements.terms.kg': 'ಒಪ್ಪಿದ ಪ್ರಮಾಣ', // REVIEW: native speaker
  'agreements.terms.minGrade': 'ಕನಿಷ್ಠ ದರ್ಜೆ', // REVIEW: native speaker
  'agreements.terms.minGradeValue': '100 ರಲ್ಲಿ {grade}', // REVIEW: native speaker
  'agreements.terms.amount': 'ಮೊತ್ತ', // REVIEW: native speaker
  'agreements.terms.deadline': 'ಗಡುವು', // REVIEW: native speaker
  'agreements.terms.with': 'ಯಾರೊಂದಿಗೆ', // REVIEW: native speaker
  'agreements.cond.title': 'ಇತ್ಯರ್ಥದ ಷರತ್ತುಗಳು', // REVIEW: native speaker
  'agreements.cond.before': 'ಇತ್ಯರ್ಥದ ಮೊದಲು: ', // REVIEW: native speaker
  'agreements.cond.sum': '3 ರಲ್ಲಿ {met} ಪೂರೈಸಿದೆ', // REVIEW: native speaker
  'agreements.cond.checked': '{at} ರಂದು ಪರಿಶೀಲಿಸಲಾಗಿದೆ', // REVIEW: native speaker
  'agreements.cond.met': 'ಪೂರೈಸಿದೆ', // REVIEW: native speaker
  'agreements.cond.notMet': 'ಪೂರೈಸಿಲ್ಲ', // REVIEW: native speaker
  'agreements.cond.name.qty': 'ತಲುಪಿದ ಪ್ರಮಾಣ', // REVIEW: native speaker
  'agreements.cond.name.grade': 'ಗುಣಮಟ್ಟದ ದರ್ಜೆ', // REVIEW: native speaker
  'agreements.cond.name.verified': 'ಪರಿಶೀಲಿತ ಕೊಯ್ಲುಗಳು', // REVIEW: native speaker
  'agreements.cond.qty': 'ತಲುಪಿದೆ · ಕನಿಷ್ಠ {agreed} ಕೆಜಿ ಒಪ್ಪಲಾಗಿದೆ', // REVIEW: native speaker
  'agreements.cond.short': '({short} ಕೆಜಿ ಕಡಿಮೆ)', // REVIEW: native speaker
  'agreements.cond.graded': 'ದರ್ಜೆ', // REVIEW: native speaker
  'agreements.cond.min': '· ಕನಿಷ್ಠ {min}', // REVIEW: native speaker
  'agreements.cond.notGraded': 'ಇನ್ನೂ ದರ್ಜೆ ನೀಡಿಲ್ಲ · ಕನಿಷ್ಠ {min}', // REVIEW: native speaker
  'agreements.cond.verified': 'ಕೊಯ್ಲುಗಳು ಪರಿಶೀಲಿತ · ಎಲ್ಲವೂ ಪರಿಶೀಲಿತವಾಗಿರಬೇಕು', // REVIEW: native speaker
  'agreements.trust': 'ತಲುಪಿದ ಕೆಜಿ ಮತ್ತು “ಪ್ರತಿ ಕೊಯ್ಲು ಪರಿಶೀಲಿತ” ಎಂಬುದನ್ನು ಉದ್ಗಮ್ ಸರ್ವರ್ ಹೇಳುತ್ತದೆ; ಇತ್ಯರ್ಥ ಮಾಡಲು ಅನುಮತಿ ಇರುವ ಏಕೈಕ ಖಾತೆ ಅದು. ದರ್ಜೆಗೆ ಖರೀದಿದಾರರ ಖಾತೆಯ ಪರವಾಗಿ ಸರ್ವರ್ ಸಹಿ ಹಾಕುತ್ತದೆ. ಲೆಕ್ಕವನ್ನು ಕಾಂಟ್ರ್ಯಾಕ್ಟ್ ಮಾಡುತ್ತದೆ.', // REVIEW: native speaker
  'agreements.released.body': '{when} ರಂದು ಎಸ್ಕ್ರೋದಿಂದ {fpo} ಗೆ ಪಾವತಿಸಲಾಗಿದೆ. ಮೂರೂ ಷರತ್ತುಗಳು ಪೂರೈಸಿದವು.', // REVIEW: native speaker
  'agreements.ledgerLine': 'ಲೆಡ್ಜರ್: Anvil (ಸ್ಥಳೀಯ ಪರೀಕ್ಷಾ ಚೈನ್) · ಬ್ಲಾಕ್ {block} · tx', // REVIEW: native speaker
  'agreements.notRel.one': '1 ಷರತ್ತು ಪೂರೈಸಿಲ್ಲ:', // REVIEW: native speaker
  'agreements.notRel.many': '{n} ಷರತ್ತುಗಳು ಪೂರೈಸಿಲ್ಲ:', // REVIEW: native speaker
  'agreements.notMet.qty': 'ತಲುಪಿದ ಪ್ರಮಾಣ ({agreed} ಕೆಜಿಯಲ್ಲಿ {kg} ಕೆಜಿ)', // REVIEW: native speaker
  'agreements.notMet.grade': 'ಗುಣಮಟ್ಟದ ದರ್ಜೆ ({grade}, ಕನಿಷ್ಠ {min})', // REVIEW: native speaker
  'agreements.notMet.verified': 'ಪರಿಶೀಲಿತ ಕೊಯ್ಲುಗಳು ({of} ರಲ್ಲಿ {n})', // REVIEW: native speaker
  'agreements.notRel.whereBuyer': 'ನಿಮ್ಮ {amount} (ಅಣಕು INR) ಎಸ್ಕ್ರೋದಲ್ಲೇ ಉಳಿಯುತ್ತದೆ.', // REVIEW: native speaker
  'agreements.notRel.whereFpo': '{amount} (ಅಣಕು INR) ಎಸ್ಕ್ರೋದಲ್ಲೇ ಉಳಿಯುತ್ತದೆ.', // REVIEW: native speaker
  'agreements.notRel.later': 'ಈ ಒಪ್ಪಂದದಡಿ ನಂತರದ ವಿತರಣೆ {deadline} ರವರೆಗೆ ಇದನ್ನು ಇತ್ಯರ್ಥಗೊಳಿಸಬಹುದು.', // REVIEW: native speaker
  'agreements.refunded.line': '{when} ರಂದು {amount} (ಅಣಕು INR) ಎಸ್ಕ್ರೋದಿಂದ ನಿಮ್ಮ ಬಾಕಿಗೆ ಹಿಂತಿರುಗಿತು. ಒಪ್ಪಂದ ಮುಕ್ತಾಯವಾಗಿದೆ.', // REVIEW: native speaker
  'agreements.new.pill': 'ಹೊಸ ಒಪ್ಪಂದ', // REVIEW: native speaker
  'agreements.new.title': 'ಹೊಸ ಒಪ್ಪಂದ', // REVIEW: native speaker
  'agreements.new.meta': 'ಮೂರೂ ಷರತ್ತುಗಳು ಪೂರೈಸಿದಾಗ ಮಾತ್ರ ಎಫ್‌ಪಿಒಗೆ ಎಸ್ಕ್ರೋದಿಂದ ಪಾವತಿಸಲಾಗುತ್ತದೆ.', // REVIEW: native speaker
  'agreements.new.with': 'ಯಾರೊಂದಿಗೆ', // REVIEW: native speaker
  'agreements.new.kg': 'ಒಪ್ಪಿದ ಪ್ರಮಾಣ (ಕೆಜಿ)', // REVIEW: native speaker
  'agreements.new.kgHint': 'ಪಾವತಿಗೆ ಕನಿಷ್ಠ ಇಷ್ಟು ತಲುಪಬೇಕು.', // REVIEW: native speaker
  'agreements.new.chooseGrade': 'ಒಂದು ದರ್ಜೆ ಆರಿಸಿ', // REVIEW: native speaker
  'agreements.new.gradeHint': 'ತಲುಪಿದ ಪ್ರತಿ ಬ್ಯಾಚ್‌ಗೆ ನೀವು ಈ ಐದು ದರ್ಜೆಗಳಲ್ಲಿ ಒಂದನ್ನು ಆರಿಸುತ್ತೀರಿ. ಪ್ರತಿಯೊಂದೂ 100 ರಲ್ಲಿನ ಒಂದು ಸಂಖ್ಯೆ.', // REVIEW: native speaker
  'agreements.new.amount': 'ಮೊತ್ತ (ಅಣಕು INR)', // REVIEW: native speaker
  'agreements.new.noFpoTitle': 'ಒಪ್ಪಂದ ಮಾಡಲು ಇನ್ನೂ ಯಾವುದೇ ಎಫ್‌ಪಿಒ ಇಲ್ಲ.', // REVIEW: native speaker
  'agreements.new.noFpoBody': 'ಒಪ್ಪಂದಕ್ಕೆ ಉದ್ಗಮ್ ಸೇರಿದ ಎಫ್‌ಪಿಒ ಬೇಕು. ಸಂಪರ್ಕಿಸಲು ಎಫ್‌ಪಿಒಗೆ ಕೇಳಿ.', // REVIEW: native speaker
  'agreements.create.note': 'ಸರ್ವರ್ ಈ ಒಪ್ಪಂದವನ್ನು ನಿಮ್ಮ ಖಾತೆಗಾಗಿ ಲೆಡ್ಜರ್‌ನಲ್ಲಿ ದಾಖಲಿಸುತ್ತದೆ. ಮುಂದಿನ ಹಂತದಲ್ಲಿ ನೀವು ಹಣ ಹಾಕುತ್ತೀರಿ.', // REVIEW: native speaker
  'agreements.create.idle': 'ಒಪ್ಪಂದ ರಚಿಸಿ', // REVIEW: native speaker
  'agreements.create.busy': 'ಒಪ್ಪಂದ ರಚಿಸಲಾಗುತ್ತಿದೆ…', // REVIEW: native speaker
  'agreements.create.errTitle': 'ಒಪ್ಪಂದ ರಚಿಸಲಾಗಲಿಲ್ಲ.', // REVIEW: native speaker
  'agreements.create.errBody': 'ಏನೂ ಉಳಿಸಲಾಗಿಲ್ಲ. ನೀವು ಟೈಪ್ ಮಾಡಿದ್ದು ಇಲ್ಲೇ ಇದೆ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.', // REVIEW: native speaker
  'agreements.fund.title': 'ಈ ಒಪ್ಪಂದಕ್ಕೆ ಹಣ ಹಾಕಿ', // REVIEW: native speaker
  'agreements.fund.body': '{amount} (ಅಣಕು INR) ನಿಮ್ಮ ಬಾಕಿಯಿಂದ ಎಸ್ಕ್ರೋಗೆ ಹೋಗುತ್ತದೆ. ಮೂರೂ ನಿಜವಾದಾಗ ಮಾತ್ರ {fpo} ಗೆ ಪಾವತಿಸಲಾಗುತ್ತದೆ:', // REVIEW: native speaker
  'agreements.fund.c1': 'ಕನಿಷ್ಠ {kg} ಕೆಜಿ ತಲುಪುತ್ತದೆ.', // REVIEW: native speaker
  'agreements.fund.c2': 'ಬ್ಯಾಚ್‌ಗೆ ನಿಮ್ಮ ದರ್ಜೆ ಕನಿಷ್ಠ {grade}.', // REVIEW: native speaker
  'agreements.fund.c3': 'ಬ್ಯಾಚ್‌ನ ಪ್ರತಿ ಕೊಯ್ಲು ಪರಿಶೀಲಿತ.', // REVIEW: native speaker
  'agreements.fund.balance': 'ನಿಮ್ಮ ಅಣಕು INR ಬಾಕಿ: ಹಣ ಹಾಕಿದ ನಂತರ {before} → {after}.', // REVIEW: native speaker
  'agreements.fund.note': '{deadline} ರೊಳಗೆ ಏನೂ ಇತ್ಯರ್ಥವಾಗದಿದ್ದರೆ, ನೀವು ಪೂರ್ತಿ ಮೊತ್ತವನ್ನು ಹಿಂಪಡೆಯಬಹುದು.', // REVIEW: native speaker
  'agreements.fund.idle': '{amount} ಹಣ ಹಾಕಿ', // REVIEW: native speaker
  'agreements.fund.busy': '{amount} ಎಸ್ಕ್ರೋಗೆ ಹಾಕಲಾಗುತ್ತಿದೆ…', // REVIEW: native speaker
  'agreements.fund.errTitle': 'ಒಪ್ಪಂದಕ್ಕೆ ಹಣ ಹಾಕಲಾಗಲಿಲ್ಲ.', // REVIEW: native speaker
  'agreements.fund.errBody': 'ಲೆಡ್ಜರ್ ಉತ್ತರಿಸಲಿಲ್ಲ, ಆದ್ದರಿಂದ ಏನೂ ಸರಿಯಲಿಲ್ಲ. ನಿಮ್ಮ ಬಾಕಿ ಬದಲಾಗಿಲ್ಲ.', // REVIEW: native speaker
  'agreements.refund.title': 'ಹಣವನ್ನು ಹಿಂಪಡೆಯಿರಿ', // REVIEW: native speaker
  'agreements.refund.body': 'ಈ ಒಪ್ಪಂದ ಇತ್ಯರ್ಥವಾಗದೆ {deadline} ರಂದು ಮುಗಿಯಿತು. {amount} (ಅಣಕು INR) ಎಸ್ಕ್ರೋದಿಂದ ನಿಮ್ಮ ಬಾಕಿಗೆ ಹಿಂತಿರುಗುತ್ತದೆ ಮತ್ತು ಒಪ್ಪಂದ ಮುಕ್ತಾಯವಾಗುತ್ತದೆ.', // REVIEW: native speaker
  'agreements.refund.balance': 'ನಿಮ್ಮ ಅಣಕು INR ಬಾಕಿ: ಹಿಂಪಡೆದ ನಂತರ {before} → {after}.', // REVIEW: native speaker
  'agreements.refund.note': 'ನಿಮ್ಮ ಖಾತೆಗಾಗಿ ಲೆಡ್ಜರ್‌ನಲ್ಲಿ ದಾಖಲಿಸಲಾಗಿದೆ.', // REVIEW: native speaker
  'agreements.refund.idle': '{amount} ಹಿಂಪಡೆಯಿರಿ', // REVIEW: native speaker
  'agreements.refund.busy': '{amount} ನಿಮ್ಮ ಬಾಕಿಗೆ ಹಿಂತಿರುಗಿಸಲಾಗುತ್ತಿದೆ…', // REVIEW: native speaker
  'agreements.refund.errTitle': 'ಹಣವನ್ನು ಹಿಂಪಡೆಯಲಾಗಲಿಲ್ಲ.', // REVIEW: native speaker
  'agreements.refund.errBody': 'ಲೆಡ್ಜರ್ ಉತ್ತರಿಸಲಿಲ್ಲ, ಆದ್ದರಿಂದ ಏನೂ ಸರಿಯಲಿಲ್ಲ. {amount} (ಅಣಕು INR) ಇನ್ನೂ ಎಸ್ಕ್ರೋದಲ್ಲಿದೆ.', // REVIEW: native speaker
  'agreements.delivered.title': 'ತಲುಪಿದ ಬ್ಯಾಚ್', // REVIEW: native speaker
  'agreements.delivered.batch': 'ಬ್ಯಾಚ್', // REVIEW: native speaker
  'agreements.delivered.certificate': 'ಪ್ರಮಾಣಪತ್ರ', // REVIEW: native speaker
  'agreements.delivered.delivered': 'ತಲುಪಿದ್ದು', // REVIEW: native speaker
  'agreements.delivered.kgWhen': '{kg} ಕೆಜಿ · {when}', // REVIEW: native speaker
  'agreements.delivered.pickings': 'ಕೊಯ್ಲುಗಳು', // REVIEW: native speaker
  'agreements.delivered.pickingsValue': '{of} ರಲ್ಲಿ {n} ಪರಿಶೀಲಿತ', // REVIEW: native speaker
  'agreements.grade.title': 'ಬ್ಯಾಚ್ {batch} ಗೆ ದರ್ಜೆ ನೀಡಿ', // REVIEW: native speaker
  'agreements.grade.legend': 'ಗುಣಮಟ್ಟದ ದರ್ಜೆ', // REVIEW: native speaker
  'agreements.grade.atMin': 'ಒಪ್ಪಿದ ಕನಿಷ್ಠ', // REVIEW: native speaker
  'agreements.grade.belowMin': 'ಒಪ್ಪಿದ ಕನಿಷ್ಠಕ್ಕಿಂತ ಕಡಿಮೆ', // REVIEW: native speaker
  'agreements.grade.hint': '{min} ಕ್ಕಿಂತ ಕಡಿಮೆ ದರ್ಜೆ ಎಂದರೆ ಈ ಬ್ಯಾಚ್‌ಗೆ ಪಾವತಿ ಬಿಡುಗಡೆಯಾಗುವುದಿಲ್ಲ.', // REVIEW: native speaker
  'agreements.grade.note': 'ನಿಮ್ಮ ಖರೀದಿದಾರ ಖಾತೆಯ ಪರವಾಗಿ ಸರ್ವರ್ ಸಹಿ ಹಾಕಿ ಶಾಶ್ವತವಾಗಿ ದಾಖಲಿಸುತ್ತದೆ. ಸಹಿ ಹಾಕಿದ ನಂತರ ಬದಲಾಯಿಸಲು ಆಗುವುದಿಲ್ಲ.', // REVIEW: native speaker
  'agreements.grade.idle': 'ದರ್ಜೆಗೆ ಸಹಿ ಹಾಕಿ', // REVIEW: native speaker
  'agreements.grade.sign': 'ಸಹಿ: {grade}', // REVIEW: native speaker
  'agreements.grade.busy': 'ದರ್ಜೆಗೆ ಸಹಿ ಹಾಕಲಾಗುತ್ತಿದೆ…', // REVIEW: native speaker
  'agreements.grade.errTitle': 'ದರ್ಜೆಯನ್ನು ಉಳಿಸಲಾಗಲಿಲ್ಲ.', // REVIEW: native speaker
  'agreements.grade.errBody': 'ಯಾವುದಕ್ಕೂ ಸಹಿ ಹಾಕಿಲ್ಲ. ನಿಮ್ಮ ಆಯ್ಕೆ ಇನ್ನೂ ಆರಿಸಿದಂತೆಯೇ ಇದೆ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.', // REVIEW: native speaker
  'agreements.grade.emptyTitle': 'ಇನ್ನೂ ಯಾವುದೇ ಬ್ಯಾಚ್ ತಲುಪಿಲ್ಲ.', // REVIEW: native speaker
  'agreements.grade.emptyBody': '{fpo} ಈ ಒಪ್ಪಂದದಡಿ ಬ್ಯಾಚ್ ತಲುಪಿಸಿದಾಗ, ನೀವು ಇಲ್ಲಿ ದರ್ಜೆ ನೀಡುತ್ತೀರಿ.', // REVIEW: native speaker
  'agreements.settle.idle': 'ಇತ್ಯರ್ಥ: {fpo} ಗೆ {amount} ಪಾವತಿಸಿ', // REVIEW: native speaker
  'agreements.settle.busy': 'ಇತ್ಯರ್ಥವಾಗುತ್ತಿದೆ…', // REVIEW: native speaker
  'agreements.settle.working': 'ಇತ್ಯರ್ಥ: ಮೂರು ಷರತ್ತುಗಳನ್ನು ಲೆಡ್ಜರ್‌ಗೆ ಕಳುಹಿಸಲಾಗುತ್ತಿದೆ…', // REVIEW: native speaker
  'agreements.settle.hint': 'ಪಾವತಿಸುವ ಮೊದಲು ಲೆಡ್ಜರ್ ಮೂರೂ ಷರತ್ತುಗಳನ್ನು ಮತ್ತೆ ಪರಿಶೀಲಿಸುತ್ತದೆ.', // REVIEW: native speaker
  'agreements.settle.errTitle': 'ಇತ್ಯರ್ಥ ಮಾಡಲಾಗಲಿಲ್ಲ.', // REVIEW: native speaker
  'agreements.settle.noAnswer': 'ಲೆಡ್ಜರ್ ಉತ್ತರಿಸಲಿಲ್ಲ, ಆದ್ದರಿಂದ ಏನೂ ಸರಿಯಲಿಲ್ಲ ಮತ್ತು ಷರತ್ತುಗಳನ್ನು ನಿರ್ಣಯಿಸಲಿಲ್ಲ. {amount} (ಅಣಕು INR) ಇನ್ನೂ ಎಸ್ಕ್ರೋದಲ್ಲಿದೆ.', // REVIEW: native speaker
  'agreements.settle.turnedAway': 'ಷರತ್ತುಗಳನ್ನು ನಿರ್ಣಯಿಸುವ ಮೊದಲೇ ಲೆಡ್ಜರ್ ವಿನಂತಿಯನ್ನು ತಿರಸ್ಕರಿಸಿತು, ಆದ್ದರಿಂದ ಏನೂ ಸರಿಯಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ; ಮತ್ತೆ ಹೀಗಾದರೆ ಉದ್ಗಮ್ ತಂಡಕ್ಕೆ ತಿಳಿಸಿ.', // REVIEW: native speaker
  'agreements.card.title': 'ಒಪ್ಪಂದ', // REVIEW: native speaker
  'agreements.card.under': 'ಇದರಡಿ ತಲುಪಿದೆ', // REVIEW: native speaker
  'agreements.card.link': '{buyer} ಜೊತೆ {id}', // REVIEW: native speaker
  'agreements.card.status': 'ಸ್ಥಿತಿ', // REVIEW: native speaker

  // M-002 processor surface (TKT-26, follow-up 2): drafts like `agreements.*`.
  'processor.title': 'ನಿಮ್ಮ ಬಳಿ ಇರುವ ಬ್ಯಾಚ್‌ಗಳು', // REVIEW: native speaker
  'processor.sub': 'ಪ್ರತಿ ಬ್ಯಾಚ್‌ಗೆ ನೀವು ಮಾಡಿದ್ದನ್ನು ದಾಖಲಿಸಿ, ನಂತರ ಅದನ್ನು ಖರೀದಿದಾರರಿಗೆ ಹಸ್ತಾಂತರಿಸಿ.', // REVIEW: native speaker
  'processor.eyebrow': 'ಸಂಸ್ಕರಣಾಕಾರ', // REVIEW: native speaker
  'processor.loading': 'ನಿಮ್ಮ ಬ್ಯಾಚ್‌ಗಳನ್ನು ಲೋಡ್ ಮಾಡಲಾಗುತ್ತಿದೆ…', // REVIEW: native speaker
  'processor.emptyH': 'ಈಗ ನಿಮ್ಮ ಬಳಿ ಯಾವುದೇ ಬ್ಯಾಚ್ ಇಲ್ಲ.', // REVIEW: native speaker
  'processor.emptyP': 'ಎಫ್‌ಪಿಒ ಬ್ಯಾಚ್ ಅನ್ನು ನಿಮಗೆ ಹಸ್ತಾಂತರಿಸಿದಾಗ ಅದು ಇಲ್ಲಿ ಕಾಣಿಸುತ್ತದೆ.', // REVIEW: native speaker
  'processor.errorH': 'ನಿಮ್ಮ ಬ್ಯಾಚ್‌ಗಳನ್ನು ಲೋಡ್ ಮಾಡಲಾಗಲಿಲ್ಲ.', // REVIEW: native speaker
  'processor.errorP': 'ಏನೂ ಬದಲಾಗಿಲ್ಲ.', // REVIEW: native speaker
  'processor.retry': 'ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ', // REVIEW: native speaker
  'processor.reload': 'ಮರುಲೋಡ್ ಮಾಡಿ', // REVIEW: native speaker
  'processor.back': 'ಬ್ಯಾಚ್‌ಗಳಿಗೆ ಹಿಂತಿರುಗಿ', // REVIEW: native speaker
  'processor.pick': 'ಸಂಸ್ಕರಣಾ ಹಂತವನ್ನು ದಾಖಲಿಸಿ ಹಸ್ತಾಂತರಿಸಲು ಒಂದು ಬ್ಯಾಚ್ ಆಯ್ಕೆಮಾಡಿ.', // REVIEW: native speaker
  'processor.detailLabel': 'ಬ್ಯಾಚ್ ವಿವರ', // REVIEW: native speaker
  'processor.railLabel': 'ಸಂಸ್ಕರಣಾಕಾರರ ವಿಭಾಗಗಳು', // REVIEW: native speaker
  'processor.signOut': 'ಸೈನ್ ಔಟ್', // REVIEW: native speaker
  'processor.meta.list': 'ಬ್ಯಾಚ್‌ಗಳು · ಉದ್ಗಮ್ ಸಂಸ್ಕರಣಾಕಾರ', // REVIEW: native speaker
  'processor.meta.detail': 'ಬ್ಯಾಚ್ · ಉದ್ಗಮ್ ಸಂಸ್ಕರಣಾಕಾರ', // REVIEW: native speaker
  'processor.kg': '{kg} ಕೆಜಿ', // REVIEW: native speaker
  'processor.row.id': '{id} · {crop}', // REVIEW: native speaker
  'processor.row.from': '{org} ಇಂದ · {when}', // REVIEW: native speaker
  'processor.row.handedOn': '{org} ಗೆ ಹಸ್ತಾಂತರಿಸಲಾಗಿದೆ', // REVIEW: native speaker
  'processor.row.ready': 'ಸಂಸ್ಕರಣಾ ಹಂತಕ್ಕೆ ಸಿದ್ಧ', // REVIEW: native speaker
  'processor.row.ok': '{done} · ನಿರೀಕ್ಷಿತ ವ್ಯಾಪ್ತಿಯೊಳಗೆ', // REVIEW: native speaker
  'processor.row.flag': '{done} · ಗುರುತಿಸಲಾಗಿದೆ: ಒಳಹರಿವಿನ {ratio}%', // REVIEW: native speaker
  'processor.chip.handedOn': 'ಹಸ್ತಾಂತರಿಸಲಾಗಿದೆ', // REVIEW: native speaker
  'processor.chip.withYou': 'ನಿಮ್ಮ ಬಳಿ', // REVIEW: native speaker
  'processor.chip.within': 'ವ್ಯಾಪ್ತಿಯೊಳಗೆ', // REVIEW: native speaker
  'processor.chip.flagged': 'ಗುರುತಿಸಲಾಗಿದೆ', // REVIEW: native speaker
  'processor.process.pulping': 'ಪಲ್ಪಿಂಗ್', // REVIEW: native speaker
  'processor.process.drying': 'ಒಣಗಿಸುವಿಕೆ', // REVIEW: native speaker
  'processor.process.hulling_parchment': 'ಪಾರ್ಚ್‌ಮೆಂಟ್ ಹಲ್ಲಿಂಗ್', // REVIEW: native speaker
  'processor.process.hulling_dry_cherry': 'ಒಣ ಚೆರ್ರಿ ಹಲ್ಲಿಂಗ್', // REVIEW: native speaker
  'processor.done.pulping': 'ಪಲ್ಪ್ ಮಾಡಲಾಗಿದೆ', // REVIEW: native speaker
  'processor.done.drying': 'ಒಣಗಿಸಲಾಗಿದೆ', // REVIEW: native speaker
  'processor.done.hulling_parchment': 'ಹಲ್ ಮಾಡಲಾಗಿದೆ', // REVIEW: native speaker
  'processor.done.hulling_dry_cherry': 'ಹಲ್ ಮಾಡಲಾಗಿದೆ', // REVIEW: native speaker
  'processor.crop.arabica': 'ಅರೇಬಿಕಾ', // REVIEW: native speaker
  'processor.crop.robusta': 'ರೋಬಸ್ಟಾ', // REVIEW: native speaker
  'processor.hint.pulping': 'ತಾಜಾ ಚೆರ್ರಿಯಿಂದ ಹಸಿ ಪಾರ್ಚ್‌ಮೆಂಟ್ · ತಾತ್ಕಾಲಿಕ ವ್ಯಾಪ್ತಿ, ದೃಢೀಕರಿಸಬೇಕಿದೆ', // REVIEW: native speaker
  'processor.hint.drying': 'ತಾತ್ಕಾಲಿಕ ವ್ಯಾಪ್ತಿ, ದೃಢೀಕರಿಸಬೇಕಿದೆ', // REVIEW: native speaker
  'processor.hint.band': 'ನಿರೀಕ್ಷಿತ ಹೊರಹರಿವು ಒಳಹರಿವಿನ {min}–{max}% ({crop})', // REVIEW: native speaker
  'processor.band.none': 'ಪ್ರತಿ ಪ್ರಕ್ರಿಯೆಗೆ ಒಳಹರಿವಿಗೆ ಹೊರಹರಿವಿನ ನಿರೀಕ್ಷಿತ ವ್ಯಾಪ್ತಿ ಇದೆ. ಅದರ ಹೊರಗೆ ಹಂತವನ್ನು ಗುರುತಿಸಲಾಗುತ್ತದೆ, ನಿರಾಕರಿಸುವುದಿಲ್ಲ.', // REVIEW: native speaker
  'processor.band.placeholder': '{process} ({crop}) ಗೆ, ಒಳಹರಿವಿನ {min}–{max}% ವ್ಯಾಪ್ತಿ ತಾತ್ಕಾಲಿಕ, ದೃಢೀಕರಿಸಬೇಕಿದೆ. ಅದರ ಹೊರಗೆ ಹಂತವನ್ನು ಗುರುತಿಸಲಾಗುತ್ತದೆ, ನಿರಾಕರಿಸುವುದಿಲ್ಲ.', // REVIEW: native speaker
  'processor.band.usual': '{process} ({crop}) ಗೆ, ಹೊರಹರಿವು ಸಾಮಾನ್ಯವಾಗಿ ಒಳಹರಿವಿನ {min}–{max}%. ಆ ವ್ಯಾಪ್ತಿಯ ಹೊರಗೆ ಹಂತವನ್ನು ಗುರುತಿಸಲಾಗುತ್ತದೆ, ನಿರಾಕರಿಸುವುದಿಲ್ಲ.', // REVIEW: native speaker
  'processor.detail.eyebrow': 'ಬ್ಯಾಚ್ · {org} ಇಂದ', // REVIEW: native speaker
  'processor.detail.meta': '{crop} · {pickings} · {kg} ಕೆಜಿ · {when} ರಂದು ಸ್ವೀಕರಿಸಲಾಗಿದೆ, {org} ಪರವಾಗಿ ಸಹಿ ಮಾಡಲಾಗಿದೆ', // REVIEW: native speaker
  'processor.detail.picking': '{n} ಕೊಯ್ಲು', // REVIEW: native speaker
  'processor.detail.pickings': '{n} ಕೊಯ್ಲುಗಳು', // REVIEW: native speaker
  'processor.detail.stepH': '{process} · {when} ರಂದು ದಾಖಲಿಸಲಾಗಿದೆ', // REVIEW: native speaker
  'processor.detail.stepSum': 'ಒಳಹರಿವು {in} ಕೆಜಿ · ಹೊರಹರಿವು {out} ಕೆಜಿ', // REVIEW: native speaker
  'processor.recordH': 'ಸಂಸ್ಕರಣಾ ಹಂತವನ್ನು ದಾಖಲಿಸಿ', // REVIEW: native speaker
  'processor.processLegend': 'ಪ್ರಕ್ರಿಯೆ', // REVIEW: native speaker
  'processor.inputLabel': 'ಒಳಹರಿವು (ಕೆಜಿ)', // REVIEW: native speaker
  'processor.inputHint': 'ಒಳಗೆ ಹೋಗುವಾಗ ನೀವು ತೂಕ ಮಾಡಿದ್ದು.', // REVIEW: native speaker
  'processor.outputLabel': 'ಹೊರಹರಿವು (ಕೆಜಿ)', // REVIEW: native speaker
  'processor.outputHint': 'ಹೊರಗೆ ಬರುವಾಗ ನೀವು ತೂಕ ಮಾಡಿದ್ದು. ಒಳಹರಿವಿಗಿಂತ ಹೆಚ್ಚು ಇರಬಹುದು; ಆಗ ಹಂತವನ್ನು ಗುರುತಿಸಲಾಗುತ್ತದೆ.', // REVIEW: native speaker
  'processor.signedNote': 'ನಿಮ್ಮ ಖಾತೆಯ ಪರವಾಗಿ ಸರ್ವರ್ ಸಹಿ ಮಾಡಿ ಶಾಶ್ವತವಾಗಿ ದಾಖಲಿಸುತ್ತದೆ.', // REVIEW: native speaker
  'processor.record': 'ಸಹಿ ಮಾಡಿ ಹಂತವನ್ನು ದಾಖಲಿಸಿ', // REVIEW: native speaker
  'processor.recording': 'ಹಂತವನ್ನು ದಾಖಲಿಸಲಾಗುತ್ತಿದೆ…', // REVIEW: native speaker
  'processor.recordErrB': 'ಹಂತವನ್ನು ದಾಖಲಿಸಲಾಗಲಿಲ್ಲ.', // REVIEW: native speaker
  'processor.recordErrP': 'ಯಾವುದಕ್ಕೂ ಸಹಿ ಮಾಡಿಲ್ಲ ಅಥವಾ ಉಳಿಸಿಲ್ಲ. ನೀವು ನಮೂದಿಸಿದ್ದು ಇನ್ನೂ ಇಲ್ಲಿದೆ.', // REVIEW: native speaker
  'processor.weightName': 'ಒಳಗೆ ಮತ್ತು ಹೊರಗಿನ ತೂಕ', // REVIEW: native speaker
  'processor.nothingRefused': 'ಏನನ್ನೂ ನಿರಾಕರಿಸಿಲ್ಲ. ಹಂತವನ್ನು ದಾಖಲಿಸಲಾಗಿದೆ, ಮತ್ತು ಗುರುತು ಬ್ಯಾಚ್‌ನ ಪ್ರಮಾಣಪತ್ರದಲ್ಲಿ ಕಾಣಿಸುತ್ತದೆ.', // REVIEW: native speaker
  'processor.handH': 'ಖರೀದಿದಾರರಿಗೆ ಹಸ್ತಾಂತರಿಸಿ', // REVIEW: native speaker
  'processor.buyerLabel': 'ಖರೀದಿದಾರ', // REVIEW: native speaker
  'processor.chooseBuyer': 'ಖರೀದಿದಾರರನ್ನು ಆಯ್ಕೆಮಾಡಿ', // REVIEW: native speaker
  'processor.handNote': 'ನಿಮ್ಮ ಖಾತೆಯ ಪರವಾಗಿ ಸರ್ವರ್ ಸಹಿ ಮಾಡುತ್ತದೆ. ಇದರ ನಂತರ, ಬ್ಯಾಚ್ ನಿಮ್ಮ ಬಳಿ ಇರುವುದಿಲ್ಲ.', // REVIEW: native speaker
  'processor.handOn': 'ಸಹಿ ಮಾಡಿ ಹಸ್ತಾಂತರಿಸಿ', // REVIEW: native speaker
  'processor.handingOn': '{buyer} ಗೆ ಹಸ್ತಾಂತರಿಸಲಾಗುತ್ತಿದೆ…', // REVIEW: native speaker
  'processor.handErrB': 'ಬ್ಯಾಚ್ ಅನ್ನು ಹಸ್ತಾಂತರಿಸಲಾಗಲಿಲ್ಲ.', // REVIEW: native speaker
  'processor.handErrP': 'ಯಾವುದಕ್ಕೂ ಸಹಿ ಮಾಡಿಲ್ಲ. ಬ್ಯಾಚ್ ಇನ್ನೂ ನಿಮ್ಮ ಬಳಿ ಇದೆ.', // REVIEW: native speaker
  'processor.recorded': 'ದಾಖಲಿಸಲಾಗಿದೆ', // REVIEW: native speaker
  'processor.handedMeta': '{when} ರಂದು {by} ({org}) ಪರವಾಗಿ ಸಹಿ ಮಾಡಲಾಗಿದೆ. ಈ ಬ್ಯಾಚ್ ಇನ್ನು ನಿಮ್ಮ ಬಳಿ ಇಲ್ಲ.', // REVIEW: native speaker
  'processor.noBuyers': 'ಇನ್ನೂ ಯಾವುದೇ ಖರೀದಿದಾರ ಸಂಸ್ಥೆಯನ್ನು ಹೊಂದಿಸಿಲ್ಲ.', // REVIEW: native speaker
  'processor.refused.alreadyRecordedB': 'ಈ ಬ್ಯಾಚ್‌ಗೆ ಈಗಾಗಲೇ ಒಂದು ಹಂತವನ್ನು ದಾಖಲಿಸಲಾಗಿದೆ.', // REVIEW: native speaker
  'processor.refused.alreadyRecordedP': 'ಹೊಸದಾಗಿ ಯಾವುದಕ್ಕೂ ಸಹಿ ಮಾಡಿಲ್ಲ. ದಾಖಲಾದ ಹಂತವನ್ನು ನೋಡಲು ಮರುಲೋಡ್ ಮಾಡಿ.', // REVIEW: native speaker
  'processor.refused.notHeldB': 'ಈ ಬ್ಯಾಚ್ ಅನ್ನು ಈಗಾಗಲೇ ಹಸ್ತಾಂತರಿಸಲಾಗಿದೆ.', // REVIEW: native speaker
  'processor.refused.notHeldP': 'ಯಾವುದಕ್ಕೂ ಸಹಿ ಮಾಡಿಲ್ಲ. ಅದು ಎಲ್ಲಿದೆ ಎಂದು ನೋಡಲು ಮರುಲೋಡ್ ಮಾಡಿ.', // REVIEW: native speaker
  'processor.refused.noStepB': 'ಈ ಬ್ಯಾಚ್‌ಗೆ ಇನ್ನೂ ಯಾವುದೇ ಸಂಸ್ಕರಣಾ ಹಂತ ದಾಖಲಾಗಿಲ್ಲ.', // REVIEW: native speaker
  'processor.refused.noStepP': 'ಯಾವುದಕ್ಕೂ ಸಹಿ ಮಾಡಿಲ್ಲ. ಬ್ಯಾಚ್ ಹಸ್ತಾಂತರಿಸುವ ಮೊದಲು ಹಂತವನ್ನು ದಾಖಲಿಸಲು ಮರುಲೋಡ್ ಮಾಡಿ.', // REVIEW: native speaker
  'processor.refused.notFoundB': 'ಈ ಬ್ಯಾಚ್ ನಿಮ್ಮ ಬಳಿ ಇಲ್ಲ.', // REVIEW: native speaker
  'processor.refused.notFoundP': 'ಯಾವುದಕ್ಕೂ ಸಹಿ ಮಾಡಿಲ್ಲ. ನಿಮ್ಮ ಬ್ಯಾಚ್‌ಗಳನ್ನು ನೋಡಲು ಮರುಲೋಡ್ ಮಾಡಿ.', // REVIEW: native speaker
  'processor.field.process': 'ನೀವು ಮಾಡಿದ ಪ್ರಕ್ರಿಯೆಯನ್ನು ಆಯ್ಕೆಮಾಡಿ.', // REVIEW: native speaker
  'processor.field.inputNeeded': 'ಒಳಹರಿವಿನ ತೂಕವನ್ನು ಕೆಜಿಯಲ್ಲಿ ನಮೂದಿಸಿ, ಉದಾಹರಣೆಗೆ 600.0.', // REVIEW: native speaker
  'processor.field.inputFormat': '0 ಕೆಜಿಗಿಂತ ಹೆಚ್ಚಿನ ತೂಕವನ್ನು ಅಂಕಿಗಳಲ್ಲಿ ನಮೂದಿಸಿ, ಉದಾಹರಣೆಗೆ 600.0.', // REVIEW: native speaker
  'processor.field.outputNeeded': 'ಹೊರಹರಿವಿನ ತೂಕವನ್ನು ಕೆಜಿಯಲ್ಲಿ ನಮೂದಿಸಿ, ಉದಾಹರಣೆಗೆ 480.0.', // REVIEW: native speaker
  'processor.field.outputFormat': 'ಹೊರಹರಿವು 0 ಕೆಜಿಗಿಂತ ಹೆಚ್ಚಿರಬೇಕು.', // REVIEW: native speaker
  'processor.field.buyer': 'ಪಟ್ಟಿಯಿಂದ ಖರೀದಿದಾರರನ್ನು ಆಯ್ಕೆಮಾಡಿ.', // REVIEW: native speaker
};
