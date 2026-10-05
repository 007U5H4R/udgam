import type { CDPSession } from '@playwright/test';

// The performance reference profile (evaluation-plan §4.4, EV9/EV10): a mid-range phone on a rural 4G link.
// Network: 10 Mbit/s down, 5 Mbit/s up, 80 ms round trip, via CDP Network.emulateNetworkConditions
// (throughputs in bytes per second). CPU: 4× slowdown via Emulation.setCPUThrottlingRate (S4).

export const EV9_NETWORK = { downloadMbps: 10, uploadMbps: 5, latencyMs: 80 } as const;
export const S4_CPU_THROTTLE = 4;

const bytesPerSecond = (mbps: number) => (mbps * 1_000_000) / 8;

/** Apply the EV9 network profile (and optionally the CPU slowdown) to a page's CDP session. */
export async function applyReferenceProfile(cdp: CDPSession, opts: { cpuThrottle?: number } = {}): Promise<void> {
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: EV9_NETWORK.latencyMs,
    downloadThroughput: bytesPerSecond(EV9_NETWORK.downloadMbps),
    uploadThroughput: bytesPerSecond(EV9_NETWORK.uploadMbps),
  });
  if (opts.cpuThrottle) await cdp.send('Emulation.setCPUThrottlingRate', { rate: opts.cpuThrottle });
}
