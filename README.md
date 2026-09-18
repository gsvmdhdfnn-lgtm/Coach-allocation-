# Josh Evans Hub — Coach Schedule v1.2

Schedule refinement on top of the approved Coach Home.

## Changes in v1.2
- Session theme is displayed directly on schedule cards, including the compact This Week view.
- Themes continue to come from the existing Google Sheet `Themes` tab by week + category.
- Extra sessions now show a clear `EXTRA SESSION` heading on the card.
- Cover and cancelled sessions use the same small heading treatment for consistency.
- Extra sessions try their own category first; if no category is supplied, the Hub can fall back to a matching normal session to find the appropriate weekly theme.
- Existing AM/PM, Back button and academic-year Calendar behaviour are preserved.
- Google Sheets remain read-only.
- Existing `config.js` and real `je-logo.png` are preserved.
