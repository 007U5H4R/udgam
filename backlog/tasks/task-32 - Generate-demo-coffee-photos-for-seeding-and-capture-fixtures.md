---
id: TASK-32
title: Generate demo coffee photos for seeding and capture fixtures
status: Done
assignee: []
created_date: '2026-09-29 03:33'
updated_date: '2026-09-29 03:42'
labels:
  - P2
  - 'sp:1'
milestone: m-0
dependencies: []
priority: medium
type: task
ordinal: 32000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner waived HR3 real field captures (2026-09-29); seed data (TKT-20) and capture e2e fixtures (TKT-10, TKT-13 demo) need believable coffee photos for the three D6 slots: the branch, basket on the scale, the day's pile. Generated, labelled as generated, no people.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Pick a photoreal model; generate 4 variants per slot at phone-like resolution; review; store in assets/demo-photos with provenance README; record TP29
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
8 AI-generated slot photos (4 branch, 3 scale, 1 pile) in assets/demo-photos with manifest.json (provider, model, generation id, prompt, sha256) and README (generated, not evidence; seed writes synthetic EXIF). 4 prompts pending: Higgsfield and ElevenLabs hit daily limits on 2026-09-29. Recorded as TP29.
<!-- SECTION:FINAL_SUMMARY:END -->
