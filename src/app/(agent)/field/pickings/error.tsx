'use client';

import { PickingsError } from './PickingsStates';

// /field/pickings when rendering failed (Design.md §18): what happened, that saved pickings are safe on
// this phone, and Try again.
export default function PickingsRouteError() {
  return <PickingsError lang="en" />;
}
