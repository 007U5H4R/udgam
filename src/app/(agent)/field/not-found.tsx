import type { Metadata } from 'next';
import { FieldNotFound } from '../../../components/field/FieldNotFound';
import { langFromCookies } from './route-state';

// Any /field page that is not found (DES-011): the field screen, the shared not-found card, Back to Home.
export const metadata: Metadata = { title: 'Not found · Udgam' };

export default async function FieldNotFoundPage() {
  const lang = await langFromCookies();
  return <FieldNotFound lang={lang} tab="home" title="notFound.title" body="notFound.body" backHref="/field" backLabel="notFound.toHome" />;
}
