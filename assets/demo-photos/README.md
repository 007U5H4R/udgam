# Demo photos (AI-generated)

These are **AI-generated images, not photographs of real farms or real harvests**. They stand in for the three capture slots (Design.md D6: The branch · Basket on the scale · The day's pile) in seed data and capture tests. The owner waived real field captures on 2026-09-29 (TP29).

- **Where they come from:** Higgsfield `gpt_image_2_5` and ElevenLabs `gpt-image-2.5-flare`, generated 2026-09-29. `manifest.json` records each file's provider, model, generation ID, prompt, SHA-256 and size.
- **What they contain:** no people and no legible text. The EXIF is minimal (colour space and dimensions only): **no GPS and no capture time**.
- **How they are used:**
  - The seed (TKT-20) copies a photo per capture and writes synthetic EXIF: GPS inside the seeded plot, `DateTimeOriginal` and `OffsetTimeOriginal` +05:30, and `Make: Udgam demo`. That gives every seeded capture unique bytes, as `photo_uniqueness` requires.
  - Capture e2e tests (TKT-10, TKT-30) use them as file-input fixtures.
  - The S3 perf runner pads them to the reference photo size.
- **Honesty rules:**
  - Seeded media rows carry `source: "generated-demo"`.
  - Nothing labels these images as real evidence.
  - Unit tests of EXIF parsing use the purpose-built fixtures in `evals/fixtures/photos/`, not these files.
- **Coverage:** 4 branch, 3 scale and 1 pile image. Seeded captures reuse these images with different synthetic EXIF, so the same scene can appear on more than one picking. Four more prompts (1 scale, 3 pile) are listed under `pending_prompts` in `manifest.json`, to be generated when the providers' daily limits reset.
