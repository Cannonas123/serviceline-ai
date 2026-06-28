/**
 * Next.js server instrumentation hook.
 * Runs once when the Next.js server process starts (both `next dev` and
 * `next start`). Used here to fail-fast on missing or invalid production
 * environment variables before any request is served.
 *
 * Docs: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
  if (process.env.NODE_ENV !== 'production') return;

  const errors: string[] = [];

  // Validate ENCRYPTION_KEY — required for decrypting OAuth tokens stored in the DB
  const encKey = process.env.ENCRYPTION_KEY;
  if (!encKey || encKey.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(encKey)) {
    errors.push(
      'ENCRYPTION_KEY must be a 64-character hex string. ' +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    );
  }

  if (errors.length > 0) {
    console.error('[startup] Fatal configuration errors:');
    for (const err of errors) {
      console.error(`  - ${err}`);
    }
    // Throw (not process.exit) — Next's instrumentation bundler disallows
    // process.exit, and a thrown error aborts startup just the same.
    throw new Error(`[startup] Invalid configuration: ${errors.join('; ')}`);
  }
}
