import { AdminNotFound } from '../../../../../components/admin/AdminNotFound';

// An unknown or another organisation's batch ID (EVAL-080): the admin not-found, back to Batches (DES-115).
export default function NotFound() {
  return <AdminNotFound section="batches" />;
}
