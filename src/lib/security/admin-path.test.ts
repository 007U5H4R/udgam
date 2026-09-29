import { describe, expect, it } from 'vitest';
import { isAdminPath, needsAdminDocument } from './admin-path';

// TASK-20 fix round 2 (N1): an admin page shown inside a document that was not loaded as an admin page
// (a client navigation from /sign-in, /field, /verify…) carries that document's CSP, without the tile
// host. The admin layout then reloads the page as its own document.

describe('isAdminPath', () => {
  it('/admin and everything under /admin/, nothing else', () => {
    for (const p of ['/admin', '/admin/', '/admin/phones', '/admin/plots/new']) expect(isAdminPath(p), p).toBe(true);
    for (const p of ['/', '/adminx', '/administrator', '/sign-in', '/field', '/buyer', '/verify/B-1']) expect(isAdminPath(p), p).toBe(false);
  });
});

describe('needsAdminDocument', () => {
  it('an admin page in a document loaded at a non-admin path must be reloaded', () => {
    expect(needsAdminDocument('http://localhost:3000/sign-in')).toBe(true);
    expect(needsAdminDocument('https://udgam.example/field?plot=PL-1')).toBe(true);
    expect(needsAdminDocument('https://udgam.example/verify/B-0000TEST?h=00')).toBe(true);
    expect(needsAdminDocument('https://udgam.example/')).toBe(true);
    expect(needsAdminDocument('https://udgam.example/administrator')).toBe(true);
  });

  it('a document loaded at an admin path already has the admin policy', () => {
    expect(needsAdminDocument('https://udgam.example/admin')).toBe(false);
    expect(needsAdminDocument('https://udgam.example/admin/phones')).toBe(false);
    expect(needsAdminDocument('https://udgam.example/admin/plots/new#x')).toBe(false);
  });

  it('without a navigation entry (or an unreadable one) nothing is reloaded: never a reload loop', () => {
    expect(needsAdminDocument(undefined)).toBe(false);
    expect(needsAdminDocument('')).toBe(false);
    expect(needsAdminDocument('not a url')).toBe(false);
  });
});
