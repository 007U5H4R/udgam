import { resolve } from 'node:path';

// A path under a run-time location (DATA_DIR, an *_KEY_PATH override). SERVER-ONLY.
//
// Next's file tracer (Turbopack) reads `path.resolve`/`path.join` calls and copies whatever they could
// name into each route's .nft.json, which `output: 'standalone'` ships. A path built from DATA_DIR is
// either untraceable ("whole project") or a pattern such as **/keys/users/*.jwk, and both pull the
// private keys under ./data into the artifact (final branch review finding 1). The ignore hint below
// tells the tracer this path is decided at run time: nothing it names is traced. Build key, deployment
// and other DATA_DIR paths through here, never with a bare resolve/join.
export function runtimePath(...segments: string[]): string {
  return resolve(/* turbopackIgnore: true */ ...segments);
}
