import { AdminNotFound } from '../../../../../components/admin/AdminNotFound';

// An unknown or another organisation's plot ID (TC-019): the admin not-found, back to Plots (DES-115).
export default function NotFound() {
  return <AdminNotFound section="plots" />;
}
