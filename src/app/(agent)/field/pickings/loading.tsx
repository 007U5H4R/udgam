import { PickingsSkeleton } from './PickingsStates';

// /field/pickings while the server reads the pickings (Design.md §18: skeleton rows, not a spinner).
export default function PickingsLoading() {
  return <PickingsSkeleton lang="en" />;
}
