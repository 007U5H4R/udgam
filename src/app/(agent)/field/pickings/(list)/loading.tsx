import { langFromCookies } from '../../route-state';
import { PickingsSkeleton } from '../PickingsStates';

// /field/pickings while the server reads the pickings (Design.md §18: skeleton rows, not a spinner), in
// the agent's language (the udgam_lang cookie).
export default async function PickingsLoading() {
  return <PickingsSkeleton lang={await langFromCookies()} />;
}
