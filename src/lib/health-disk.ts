import { statfs as fsStatfs } from 'node:fs/promises';

// Disk space under DATA_DIR (SEC-003, TKT-28): the database, the ledger key, the photos and the local
// backups all live on that volume, and a full volume stops every capture. /api/health reports it as a
// degraded component (`disk`, never a 503: the app still serves), and the uptime probe alerts on
// anything but "ok" (.github/workflows/uptime.yml). The numbers go to the log only, not the public body.

export type DiskStatus = 'ok' | 'low' | 'unknown';

type Statfs = (path: string) => Promise<{ bavail: number | bigint; bsize: number | bigint }>;

/**
 * Free bytes on `dir`'s filesystem (blocks available to an unprivileged user × block size) against
 * `minFreeBytes`: "low" below it, "unknown" when the filesystem cannot be read (DATA_DIR missing).
 */
export async function diskHealth(dir: string, minFreeBytes: number, statfs: Statfs = fsStatfs): Promise<{ status: DiskStatus; freeBytes: number | null }> {
  try {
    const s = await statfs(dir);
    const freeBytes = Number(s.bavail) * Number(s.bsize);
    return { status: freeBytes < minFreeBytes ? 'low' : 'ok', freeBytes };
  } catch {
    return { status: 'unknown', freeBytes: null };
  }
}
