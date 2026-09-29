import { HomeSkeleton } from '../../../../components/field/HomeStates';

// /field while the server reads the plots and pickings (Design.md §18: a skeleton, not a spinner).
export default function FieldLoading() {
  return <HomeSkeleton lang="en" />;
}
