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

/** Keys every farmer- and agent-facing language must carry (admin keys excluded; M-002 `agreements.*` is an office surface, TKT-25). */
export const isFieldKey = (k: string): boolean => !k.startsWith('rail.') && !k.startsWith('phones.') && !k.startsWith('agreements.');

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
  'fe.demo': ' (ಡೆಮೊ ಡೇಟಾ)', // REVIEW: native speaker (EXE12 "(demo data)" label; starts with a space)
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
