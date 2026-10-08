# Photo fixtures

Read-only inputs for the EXIF and capture tests (TC-035, TC-013). Regenerate the three small JPEGs with
`pnpm exec tsx evals/fixtures/photos/make.ts`; it reads each file back with exifr and refuses to write
one whose EXIF differs from what is listed here.

| File | Made by | EXIF |
|---|---|---|
| `gps-time-offset.jpg` | `make.ts` (sharp `withExif`) | GPS 12.4211 N, 75.7392 E (tracer plot P01's inside point); `DateTimeOriginal` `2026:09:20 10:15:00`; `OffsetTimeOriginal` `+05:30` |
| `time-no-offset.jpg` | `make.ts` | `DateTimeOriginal` `2026:09:20 10:15:00`, no offset and no GPS (read as IST, TP25) |
| `no-exif.jpg` | `make.ts` | none |
| `sample.heic` | downloaded, not generated | none (a valid single-image HEIF: `ftyp` major brand `mif1`, compatible `heic`) |
| `p01-exif-ok.jpg` | `scripts/make-fixture-photo.ts` (TKT-02) | GPS inside P01, `DateTimeOriginal` `2026:10:14 09:40:12`, no offset |

`make.ts` writes the EXIF with sharp, which is already a dependency, rather than with `piexifjs`, so no
package is added for fixtures.

## sample.heic

- Source: `heic-single.heic` from the exifr test fixtures,
  https://raw.githubusercontent.com/MikeKovarik/exifr/master/test/fixtures/heic-single.heic
  (293 608 bytes, sha256 `00d9e0636b645036f77b3809fcd26a29df71b9ee66f2865fd8729b894aeabf59`).
- Licence: MIT, not public domain. No verified public-domain HEIC sample was found (Wikimedia Commons
  does not host HEIC). The exifr repository's notice applies:

  > MIT License. Copyright (c) 2020 Mike Kovařík, Mutiny.cz. Permission is hereby granted, free of charge,
  > to any person obtaining a copy of this software and associated documentation files (the "Software"),
  > to deal in the Software without restriction, including without limitation the rights to use, copy,
  > modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit
  > persons to whom the Software is furnished to do so, subject to the following conditions: The above
  > copyright notice and this permission notice shall be included in all copies or substantial portions
  > of the Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.

It carries no EXIF, so it tests that a HEIC is recognised by its magic bytes and that a HEIC without
EXIF yields no facts without throwing.
