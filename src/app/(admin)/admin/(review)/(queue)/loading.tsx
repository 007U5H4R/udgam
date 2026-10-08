import { ReviewScreen } from '../ReviewScreen';

// Streaming fallback while the review screens load: admin.html's loading state (skeleton rows, the
// "Loading the review list…" note and the detail skeleton; a skeleton, not a spinner, Design.md §18).
export default function Loading() {
  return <ReviewScreen state="loading" queue={null} orgName={null} adminName={null} />;
}
