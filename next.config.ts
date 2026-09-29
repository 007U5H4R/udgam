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
  experimental: {
    serverActions: { bodySizeLimit: "3mb" },
  },
  env: {
    UDGAM_COMMIT: gitCommit(),
  },
  // technical-plan §16 (TSK-19.5): on every response. The per-request CSP is set by src/proxy.ts.
  async headers() {
    return [{ source: "/:path*", headers: [...STATIC_SECURITY_HEADERS] }];
  },
};

export default nextConfig;
