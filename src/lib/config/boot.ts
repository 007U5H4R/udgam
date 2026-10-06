import { log } from '../log';
import { loadEnv } from './env';

// QA-P5-4 (TKT-28): the configuration check at server start (src/instrumentation.ts). An invalid
// environment used to throw out of the instrumentation hook, and Next then answered a bare 500 on every
// route, /api/health included, with nothing in the body to say why. EXE12 has the server refuse to run
// with such a configuration (fixture data must never reach a deployment); it does not require the process
// to exit, and an exit would put the container in a restart loop that hides the cause.
//
// So: validate once, log `config.invalid` at fatal level (variable names and rule codes only: loadEnv's
// messages never carry values) and tell the caller to skip the boot steps. The server stays up and still
// serves nothing that needs the configuration, while /api/health answers 503 `config:"error"`: the
// Compose healthcheck (it needs a 200) marks the container unhealthy and the uptime probe alerts.

/** True when the environment is valid; otherwise logs config.invalid (names only) and returns false. */
export function configValidAtBoot(src: Record<string, string | undefined> = process.env): boolean {
  try {
    loadEnv(src);
    return true;
  } catch (err) {
    log.fatal({ problem: err instanceof Error ? err.message : 'invalid' }, 'config.invalid');
    return false;
  }
}
