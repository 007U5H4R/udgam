-- TKT-12 re-review r2 (N2, N3, N5, N6; technical-plan §4.2, CF-06, EXE19). Custom migration: drizzle-kit
-- does not model triggers. Defence in depth for writes the app never makes. Self-contained and idempotent.

-- CF-06, N3: a hard fail is final. A raw INSERT of a clean run after a hard-failed run of the same event
-- (which an override of that new run would then turn Verified) is refused. The app never re-runs a
-- hard-failed event: it is not Needs Review.
CREATE TRIGGER IF NOT EXISTS `verification_runs_after_hard_fail` BEFORE INSERT ON `verification_runs`
WHEN EXISTS (
  SELECT 1 FROM `verification_runs` r, json_each(r.`checks`) c
   WHERE r.`event_id` = NEW.`event_id` AND json_extract(c.`value`, '$.hardFail') IS 1
)
BEGIN
  SELECT RAISE(ABORT, 'a hard fail is final: no new run after a hard-failed run');
END;
--> statement-breakpoint
-- 0021's admin_overrides_before_insert, unchanged but for its reason check, which now also refuses the
-- characters that render blank (N2: U+2800 braille blank, U+3164, U+115F, U+1160 and U+FFA0 Hangul
-- fillers) and the tag characters (N6: U+E0001, U+E0020–U+E007F), and allows ZWJ and ZWNJ only between
-- two Kannada characters (N5: the arkavattu ರ‍್; U+0C80–U+0CFF), as the app's rule does.
DROP TRIGGER IF EXISTS `admin_overrides_before_insert`;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `admin_overrides_before_insert` BEFORE INSERT ON `admin_overrides`
BEGIN
  SELECT RAISE(ABORT, 'verification run not found')
   WHERE NOT EXISTS (SELECT 1 FROM `verification_runs` WHERE `id` = NEW.`run_id`);
  SELECT RAISE(ABORT, 'a hard-failed run cannot be overridden')
   WHERE EXISTS (
     SELECT 1 FROM `verification_runs` r, json_each(r.`checks`) c
      WHERE r.`id` = NEW.`run_id` AND json_extract(c.`value`, '$.hardFail') IS 1
   );
  SELECT RAISE(ABORT, 'event is in a batch: its verdict is frozen')
   WHERE EXISTS (
     SELECT 1 FROM `batch_events` be JOIN `verification_runs` r ON r.`event_id` = be.`event_id`
      WHERE r.`id` = NEW.`run_id`
   );
  SELECT RAISE(ABORT, 'only the latest run of an event can be overridden')
   WHERE EXISTS (
     SELECT 1 FROM `verification_runs` r JOIN `verification_runs` later ON later.`event_id` = r.`event_id` AND later.`run_no` > r.`run_no`
      WHERE r.`id` = NEW.`run_id`
   );
  SELECT RAISE(ABORT, 'UNIQUE: override already exists (id or run_id): overrides are never replaced')
   WHERE EXISTS (SELECT 1 FROM `admin_overrides` WHERE `id` = NEW.`id` OR `run_id` = NEW.`run_id`);
  SELECT RAISE(ABORT, 'only a Needs Review run can be overridden')
   WHERE NOT EXISTS (SELECT 1 FROM `verification_runs` WHERE `id` = NEW.`run_id` AND `verdict` = 'Needs Review');
  SELECT RAISE(ABORT, 'override reason has hidden or control characters')
   WHERE NEW.`reason` GLOB ('*['
     || char(1) || '-' || char(9) || char(11) || '-' || char(31) || char(127) || '-' || char(159) || char(173)
     || char(1536) || '-' || char(1541) || char(1564) || char(1757) || char(1807) || char(2192) || '-' || char(2193) || char(2274) || char(6158)
     || char(8203) || char(8206) || '-' || char(8207) || char(8232) || '-' || char(8238) || char(8288) || '-' || char(8292) || char(8294) || '-' || char(8303)
     || char(65279) || char(65529) || '-' || char(65531)
     || char(4447) || '-' || char(4448) || char(10240) || char(12644) || char(65440)
     || char(917505) || char(917536) || '-' || char(917631)
     || ']*')
      -- a joiner (ZWNJ U+200C, ZWJ U+200D) anywhere but between two Kannada characters
      OR NEW.`reason` GLOB ('[' || char(8204) || char(8205) || ']*')
      OR NEW.`reason` GLOB ('*[' || char(8204) || char(8205) || ']')
      OR NEW.`reason` GLOB ('*[^' || char(3200) || '-' || char(3327) || '][' || char(8204) || char(8205) || ']*')
      OR NEW.`reason` GLOB ('*[' || char(8204) || char(8205) || '][^' || char(3200) || '-' || char(3327) || ']*');
END;
