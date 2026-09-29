import type { PlotPolygon } from '../geo/types';

// The remote-sensing provider contract (technical-plan §7). TKT-02 needs only the interface, for
// VerifyContext; TKT-07 owns the rest of this folder (fixture and live adapters, cache, timeouts).

export type PlotGeom = { id: string; polygon: PlotPolygon; areaHa: number };

export interface RemoteSensingProvider {
  name: 'fixture' | 'live';
  forestLoss(plot: PlotGeom): Promise<{ lossHa: number; lossPct: number; yearsFrom: number; dataYear: number }>;
  ndviHistory(plot: PlotGeom, endMonth: string): Promise<{ months: { month: string; mean: number | null; clearFraction: number }[] }>;
  ndviWindow(plot: PlotGeom, centreDate: string, days: number): Promise<{ mean: number | null; clearObservations: number }>;
}
