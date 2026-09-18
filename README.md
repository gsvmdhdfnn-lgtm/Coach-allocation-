# Josh Evans Hub — Coach Schedule v1

Focused Schedule build on top of the approved Coach Home.

## Coach schedule
- Today shows only today's valid sessions.
- This Week shows only days the coach is working.
- Today is expanded automatically in the current week; other days are collapsed until tapped.
- Coaches can browse the current week plus the next 3 weeks only.
- Calendar provides a neat month view; dates outside the 4-week window are disabled.
- Session themes are pulled by week + category from the existing Themes data.
- Status styling: normal lime, extra dark blue, cover amber, cancelled red.
- Session details are intentionally lightweight and arranged as simple rows.
- Calendar export supports selected day / whole visible week, and session details can export one session.

## Role-ready shell
The app now has a role field and keeps Coach screens behind the Coach role, making Parent / Player / Management screen sets easier to plug in later without converting the Coach UI.

## Data safety
- Existing Google Sheets remain read-only from this frontend.
- `config.js` is preserved.
- Existing Coach Home remains in place.
- Uses the real existing `je-logo.png` asset.
