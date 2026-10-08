import type { MetadataRoute } from 'next';

// The capture app's web app manifest (TSK-10.12, TC-049), served at /manifest.webmanifest: installable
// from the phone's browser, opening on the capture Home, standalone, in the ground colour of the tokens
// (--bg #0A0E0C), with the cherry-cluster icons from scripts/make-icons.ts.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Udgam',
    short_name: 'Udgam',
    description: 'Record a coffee picking from inside your plot and see it checked.',
    start_url: '/field',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0A0E0C',
    theme_color: '#0A0E0C',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
