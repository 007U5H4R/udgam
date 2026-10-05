import { ProcessorScreen } from '../ProcessorScreen';

// Streaming fallback while the processor list loads: skeleton rows with "Loading your batches…" and the
// detail skeleton (a skeleton, not a spinner, Design.md §18, §28.8).
export default function Loading() {
  return <ProcessorScreen state="loading" batches={[]} orgName={null} userName={null} />;
}
