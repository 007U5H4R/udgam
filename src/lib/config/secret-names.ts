/**
 * The secret environment variables (every secret name in .env.example): the one list. log.ts redacts
 * each wherever it is logged by name, and scripts/ci/check-bundle-secrets.sh greps the client bundle for
 * each one's CI stand-in value; tests/bundle-secrets.test.ts asserts the script's bash copy equals this list.
 */
export const SECRET_ENV_NAMES = ['BETTER_AUTH_SECRET', 'GFW_API_KEY', 'CDSE_CLIENT_ID', 'CDSE_CLIENT_SECRET', 'ARCGIS_API_KEY', 'MAPTILER_KEY', 'ANVIL_RPC_URL'] as const;
