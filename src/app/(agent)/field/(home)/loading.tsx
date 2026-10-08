import { HomeSkeleton } from '../../../../components/field/HomeStates';
import { langFromCookies } from '../route-state';

// /field while the server reads the plots and pickings (Design.md §18: a skeleton, not a spinner), in
// the agent's language (the udgam_lang cookie).
export default async function FieldLoading() {
  return <HomeSkeleton lang={await langFromCookies()} />;
}
