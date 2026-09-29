'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getDbReady } from '../../../../lib/db/client';
import { parsePlotFile, type PlotGeomError } from '../../../../lib/geo/parse';
import type { PlotPolygon } from '../../../../lib/geo/types';
import { CROPS, editPlot, PlotsError, registerPlot, type RegisterPlotInput } from '../../../../lib/plots/plots';
import { requireSession } from '../../../_auth/require';

// Plot register, edit and upload Server Actions (TSK-06.4). Each one guards first (a layout never
// protects an action), takes the org from the session and never from input, validates with zod, and
// lets the server compute the area from the geometry: any client-sent area is ignored.

export type PlotActionReason =
  | PlotGeomError
  | 'invalid_input'
  | 'file_too_large'
  | 'no_file'
  | 'farmer_not_found'
  | 'not_found';

export type PlotActionResult = { ok: true; plotId: string } | { ok: false; reason: PlotActionReason };

/** Upload cap (and the cap on a drawn geometry's text). */
const MAX_BYTES = 2 * 1024 * 1024;

const PLOT_ID = z.string().regex(/^PL-[0-9A-Z]{8}$/);
const FARMER_ID = z.string().regex(/^FA-[0-9A-Z]{8}$/);

const farmerFields = z.union([
  z.object({ farmerId: FARMER_ID }),
  z.object({
    newFarmerName: z.string().trim().min(1).max(120),
    newFarmerIdentifier: z.string().trim().max(64).optional(),
  }),
]);
const newPlotFields = z.intersection(farmerFields, z.object({ crop: z.enum(CROPS) }));

const text = (form: FormData, key: string) => {
  const v = form.get(key);
  return typeof v === 'string' && v !== '' ? v : undefined;
};

const fail = (reason: PlotActionReason): PlotActionResult => ({ ok: false, reason });

/** The new-plot fields of a form (farmer choice + crop), or null when they do not validate. */
function newPlotInput(form: FormData, geometry: PlotPolygon): RegisterPlotInput | null {
  const parsed = newPlotFields.safeParse({
    farmerId: text(form, 'farmerId'),
    newFarmerName: text(form, 'newFarmerName'),
    newFarmerIdentifier: text(form, 'newFarmerIdentifier'),
    crop: text(form, 'crop'),
  });
  if (!parsed.success) return null;
  const v = parsed.data;
  return 'farmerId' in v
    ? { farmerId: v.farmerId, crop: v.crop, geometry }
    : { newFarmer: { name: v.newFarmerName, identifier: v.newFarmerIdentifier || null }, crop: v.crop, geometry };
}

/** Map a lib refusal to an answer; anything else is a bug or an outage and is rethrown. */
function refusal(err: unknown): PlotActionResult {
  if (err instanceof PlotsError) {
    if (err.code === 'invalid_geometry') return fail(err.reason ?? 'not_polygon');
    return fail(err.code === 'plot_not_found' ? 'not_found' : 'farmer_not_found');
  }
  throw err;
}

async function register(orgId: string, input: RegisterPlotInput): Promise<PlotActionResult> {
  const db = await getDbReady();
  try {
    const { plotId } = await registerPlot(db, orgId, input);
    revalidatePath('/admin/plots');
    return { ok: true, plotId };
  } catch (err) {
    return refusal(err);
  }
}

async function edit(orgId: string, plotId: string, geometry: PlotPolygon): Promise<PlotActionResult> {
  const db = await getDbReady();
  try {
    await editPlot(db, orgId, plotId, geometry);
    revalidatePath('/admin/plots');
    return { ok: true, plotId };
  } catch (err) {
    return refusal(err);
  }
}

/** Register a plot from a drawn geometry (`geojson`), for an existing (`farmerId`) or new farmer. */
export async function createPlotAction(form: FormData): Promise<PlotActionResult> {
  const { orgId } = await requireSession('admin', { action: true });
  const geojson = text(form, 'geojson');
  if (geojson === undefined) return fail('invalid_input');
  if (geojson.length > MAX_BYTES) return fail('file_too_large');
  const parsed = parsePlotFile('drawn.geojson', geojson);
  if (!parsed.ok) return fail(parsed.reason);
  const input = newPlotInput(form, parsed.geometry);
  if (!input) return fail('invalid_input');
  return register(orgId, input);
}

/** Replace a plot's boundary with an edited geometry (anchors plot_edited, marks checks stale). */
export async function updatePlotGeometryAction(plotId: string, geojsonText: string): Promise<PlotActionResult> {
  const { orgId } = await requireSession('admin', { action: true });
  if (!PLOT_ID.safeParse(plotId).success) return fail('not_found');
  if (typeof geojsonText !== 'string') return fail('invalid_input');
  if (geojsonText.length > MAX_BYTES) return fail('file_too_large');
  const parsed = parsePlotFile('edited.geojson', geojsonText);
  if (!parsed.ok) return fail(parsed.reason);
  return edit(orgId, plotId, parsed.geometry);
}

/**
 * Register or re-draw a plot from an uploaded GeoJSON or KML file (≤ 2 MB). With `plotId` it replaces
 * that plot's boundary; otherwise it needs the farmer choice and crop like createPlotAction.
 */
export async function uploadPlotFileAction(form: FormData): Promise<PlotActionResult> {
  const { orgId } = await requireSession('admin', { action: true });
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) return fail('no_file');
  if (file.size > MAX_BYTES) return fail('file_too_large');
  const parsed = parsePlotFile(file.name, await file.text());
  if (!parsed.ok) return fail(parsed.reason);
  const plotId = text(form, 'plotId');
  if (plotId !== undefined) {
    if (!PLOT_ID.safeParse(plotId).success) return fail('not_found');
    return edit(orgId, plotId, parsed.geometry);
  }
  const input = newPlotInput(form, parsed.geometry);
  if (!input) return fail('invalid_input');
  return register(orgId, input);
}
