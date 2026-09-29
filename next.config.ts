import { execSync } from "node:child_process";
import type { NextConfig } from "next";

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
  env: {
    UDGAM_COMMIT: gitCommit(),
  },
};

export default nextConfig;
