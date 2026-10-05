import { execSync } from "node:child_process";
import type { NextConfig } from "next";
import { STATIC_SECURITY_HEADERS } from "./src/lib/security/headers";

// Build metadata for /api/health. Never a secret: a short git SHA, or "unknown" outside a checkout.
function gitCommit(): string {
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "unknown";
  }
}

const nextConfig: NextConfig = {
  // exifr probes for fs/zlib with a dynamic require that a bundle cannot satisfy ("Couldn't load fs");
  // loaded natively on the server it finds them (TKT-08, media/exif.ts).
  serverExternalPackages: ["exifr"],
  // Plot uploads go through Server Actions and are capped at 2 MB by the action itself (TKT-06), so the
  // framework's 1 MB default must not refuse them first; 3 MB leaves room for the form's other fields.
  // Next 16 has no per-action limit: this applies to EVERY Server Action (sign-in, phones, …), and the
  // body is read before an action's guard runs. Accepted for the MVP; TKT-19 (Stage 10 SEC) revisits,
  // e.g. by moving uploads to a route handler with its own streaming cap.
  experimental: {
    serverActions: { bodySizeLimit: "3mb" },
  },
  env: {
    UDGAM_COMMIT: gitCommit(),
  },
  // Never trace these into a server bundle's .nft.json, which `output: 'standalone'` (TKT-27) copies into
  // the artifact (final branch review finding 1). DATA_DIR (./data, CI's ./data-ci, e2e's .e2e-data)
  // holds the ledger, EVM and user private keys and the database; the rest is planning, test and
  // contract source the server never reads. Next applies these to route and server traces only, NOT to
  // instrumentation.js.nft.json, so the primary guard is that DATA_DIR paths are built untraceably
  // (src/lib/config/runtime-path.ts); scripts/ci/check-trace.mjs fails the CI build job on any traced
  // data, key or env file. evals/fixtures stays traceable: the fixture remote-sensing provider (dev and
  // e2e) reads it.
  outputFileTracingExcludes: {
    '*': [
      'data/**',
      'data-ci/**',
      '.e2e-data/**',
      '.secrets/**',
      '.env',
      '.env.*',
      '.claude/**',
      '.design/**',
      'backlog/**',
      'contracts/**',
      'docs/**',
      'e2e/**',
      'tests/**',
      'evals/eval-dataset*.json',
      'evals/harness/**',
      'evals/perf/**',
      'evals/reports/**',
      'evals/results/**',
      'evals/scorers/**',
    ],
  },
  // technical-plan §16 (TSK-19.5): on every response. The per-request CSP is set by src/proxy.ts.
  async headers() {
    return [{ source: "/:path*", headers: [...STATIC_SECURITY_HEADERS] }];
  },
};

export default nextConfig;
