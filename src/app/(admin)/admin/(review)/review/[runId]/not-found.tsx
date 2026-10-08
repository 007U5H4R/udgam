import { AdminNotFound } from '../../../../../../components/admin/AdminNotFound';

// An unknown or another organisation's review run ID (EVAL-080): the admin not-found, back to Review with
// Review marked in the rail (DES-115).
export default function NotFound() {
  return <AdminNotFound section="review" />;
}
