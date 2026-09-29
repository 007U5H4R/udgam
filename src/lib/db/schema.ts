import { sql } from 'drizzle-orm';
import { check, index, integer, real, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';

// technical-plan §4.1, initial slice (TKT-02). Later tickets add tables and columns in new migrations.
// Times are ISO-8601 UTC strings with milliseconds. JSON columns are text.
// Invariants that SQL constraints cannot express (append-only ledger, final-verdict trigger) live in
// the custom migration 0001_invariants.sql (§4.2).

/** Hash-chain ledger (§8.1). Append-only: UPDATE and DELETE abort (trigger). */
export const ledgerEntries = sqliteTable('ledger_entries', {
  seq: integer('seq').primaryKey(),
  prevHash: text('prev_hash').notNull(),
  kind: text('kind').notNull(),
  payload: text('payload').notNull(),
  payloadHash: text('payload_hash').notNull(),
  ts: text('ts').notNull(),
  entryHash: text('entry_hash').notNull().unique(),
});

const anchorSeq = () =>
  integer('anchor_seq')
    .notNull()
    .references(() => ledgerEntries.seq);

export const organisations = sqliteTable(
  'organisations',
  {
    id: text('id').primaryKey(),
    type: text('type', { enum: ['fpo', 'buyer', 'processor'] }).notNull(),
    name: text('name').notNull(),
    officePhone: text('office_phone'),
  },
  (t) => [check('organisations_type_check', sql`${t.type} IN ('fpo','buyer','processor')`)],
);

export const farmers = sqliteTable('farmers', {
  id: text('id').primaryKey(),
  orgId: text('org_id')
    .notNull()
    .references(() => organisations.id),
  name: text('name').notNull(),
  identifier: text('identifier'),
  /** Random `PR-` + 8 Crockford base32; the only farmer ID ever public (EV16). */
  producerId: text('producer_id').notNull().unique(),
});

export const plots = sqliteTable(
  'plots',
  {
    id: text('id').primaryKey(),
    farmerId: text('farmer_id')
      .notNull()
      .references(() => farmers.id),
    crop: text('crop', { enum: ['arabica', 'robusta'] }).notNull(),
    geojson: text('geojson').notNull(),
    areaHa: real('area_ha').notNull(),
    registrationChecks: text('registration_checks'),
    registrationStale: integer('registration_stale').notNull().default(0),
    anchorSeq: anchorSeq(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [
    check('plots_crop_check', sql`${t.crop} IN ('arabica','robusta')`),
    check('plots_registration_stale_check', sql`${t.registrationStale} IN (0,1)`),
  ],
);

export const devices = sqliteTable('devices', {
  /** `DV-` + 8 Crockford base32. */
  id: text('id').primaryKey(),
  /** The agent's user id. The foreign key to Better Auth's `user` arrives with TKT-04. */
  agentId: text('agent_id').notNull(),
  publicKeyJwk: text('public_key_jwk').notNull(),
  keyThumbprint: text('key_thumbprint').notNull().unique(),
  enrolledAt: text('enrolled_at').notNull(),
  revokedAt: text('revoked_at'),
  lastSeq: integer('last_seq').notNull().default(0),
  lastEventHash: text('last_event_hash'),
  anchorSeq: anchorSeq(),
});

export const harvestEvents = sqliteTable(
  'harvest_events',
  {
    id: text('id').primaryKey(),
    /** No foreign key: a boundary-rejected event may name a plot that does not exist. */
    plotId: text('plot_id'),
    deviceId: text('device_id').references(() => devices.id),
    agentId: text('agent_id'),
    seq: integer('seq'),
    clientCapturedAt: text('client_captured_at'),
    serverReceivedAt: text('server_received_at').notNull(),
    lat: real('lat'),
    lng: real('lng'),
    accuracyM: real('accuracy_m'),
    cherryKg: real('cherry_kg'),
    prevEventHash: text('prev_event_hash'),
    /** The exact canonical string the phone signed (never re-serialised). */
    payload: text('payload').notNull(),
    payloadHash: text('payload_hash').notNull().unique(),
    signature: text('signature').notNull(),
    boundaryStatus: text('boundary_status', { enum: ['accepted', 'rejected'] }).notNull(),
    boundaryReason: text('boundary_reason'),
    /** Maintained by triggers (§4.2); the app never writes it. */
    finalVerdict: text('final_verdict', { enum: ['Verified', 'Needs Review', 'Rejected'] }),
    anchorSeq: anchorSeq(),
  },
  (t) => [
    check('harvest_events_boundary_status_check', sql`${t.boundaryStatus} IN ('accepted','rejected')`),
    check('harvest_events_device_check', sql`${t.deviceId} IS NOT NULL OR ${t.boundaryStatus} = 'rejected'`),
    index('harvest_events_device_idx').on(t.deviceId),
    index('harvest_events_plot_idx').on(t.plotId),
  ],
);

export const media = sqliteTable(
  'media',
  {
    id: text('id').primaryKey(),
    eventId: text('event_id')
      .notNull()
      .references(() => harvestEvents.id),
    path: text('path').notNull(),
    sha256: text('sha256').notNull(),
    size: integer('size').notNull(),
    mime: text('mime').notNull(),
    exif: text('exif'),
    thumbPath: text('thumb_path'),
  },
  // Not unique: a rejected replay still stores its row (§4.1).
  (t) => [index('media_sha256_idx').on(t.sha256), index('media_event_idx').on(t.eventId)],
);

export const verificationRuns = sqliteTable(
  'verification_runs',
  {
    id: text('id').primaryKey(),
    eventId: text('event_id')
      .notNull()
      .references(() => harvestEvents.id),
    runNo: integer('run_no').notNull(),
    verdict: text('verdict', { enum: ['Verified', 'Needs Review', 'Rejected'] }).notNull(),
    score: real('score').notNull(),
    checks: text('checks').notNull(),
    unavailableProviders: text('unavailable_providers').notNull(),
    configVersion: text('config_version').notNull(),
    configHash: text('config_hash').notNull(),
    createdAt: text('created_at').notNull(),
    anchorSeq: anchorSeq(),
  },
  (t) => [
    unique('verification_runs_event_run_unique').on(t.eventId, t.runNo),
    check('verification_runs_verdict_check', sql`${t.verdict} IN ('Verified','Needs Review','Rejected')`),
  ],
);
