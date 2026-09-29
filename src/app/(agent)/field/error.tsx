'use client';

import { HomeError } from '../../../components/field/HomeStates';

// /field when rendering failed (Design.md §18): what happened, that saved pickings are safe, and Try again.
export default function FieldError() {
  return <HomeError lang="en" />;
}
