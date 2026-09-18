# Josh Evans Hub — Airtable-ready TEST patch

This patch is for the TEST branch only.

## Files
- `index.html` — adds `content-provider.js` before `app.js`
- `content-provider.js` — source-agnostic content layer

## What changes visually?
Nothing yet. Current labels stay the same by default.

## Why this exists
The Hub should not contain a private Airtable token in browser code.
This provider creates the safe frontend contract now, so a secure backend
endpoint can be added later without redesigning the UI.

Future flow:
TEST Hub -> secure content API -> Airtable

## Important
Do not upload this to the live/default branch yet.
