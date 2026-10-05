import type { Metadata } from 'next';
import { FieldNotFound } from '../../../../../components/field/FieldNotFound';
import { langFromCookies } from '../../route-state';

// A picking that is not this agent's, or an old link (DES-011): still a 404, now the field screen with
// "We can't find that picking", that the saved pickings are safe, and Back to Pickings.
export const metadata: Metadata = { title: 'Not found · Udgam' };

export default async function PickingNotFound() {
  const lang = await langFromCookies();
  return <FieldNotFound lang={lang} tab="pickings" title="notFound.picking.title" body="notFound.picking.body" backHref="/field/pickings" backLabel="dt.back" />;
}
