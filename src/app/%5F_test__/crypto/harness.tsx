'use client';

import { useEffect } from 'react';
import * as udgamCrypto from '../../../lib/crypto';

declare global {
  interface Window {
    udgamCrypto?: typeof udgamCrypto;
  }
}

/** Exposes the bundled src/lib/crypto on window so Playwright can run the shared vectors (TC-006). */
export function CryptoHarness() {
  useEffect(() => {
    window.udgamCrypto = udgamCrypto;
  }, []);
  return (
    <main>
      <h1>Crypto vectors</h1>
    </main>
  );
}
