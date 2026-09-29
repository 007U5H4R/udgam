import { requireTestSurface } from '../guard';
import { CryptoHarness } from './harness';

// Read E2E per request, so a production server started without it answers 404.
export const dynamic = 'force-dynamic';

export default function CryptoVectorsPage() {
  requireTestSurface();
  return <CryptoHarness />;
}
