# Josh Evans Hub — Venues v1

Information-first Venue build on top of Session Details v1.

## Venue list
- Searchable venue list.
- Uses the existing `Venue info` Google Sheet plus Sessions as fallback.
- Shows how many of the logged-in coach's sessions are at each venue this week.
- No venue photography yet; the layout is ready for imagery to be added later from Airtable.

## Venue details
- Address and postcode.
- Parking.
- Where to meet.
- Access instructions.
- Useful notes.
- Get Directions button using the venue address/postcode.
- `Your sessions here this week` is calculated live from Sessions + Terms + Changes for the logged-in coach.
- Session rows link back into Session Details.
- Session Details now opens the specific venue directly instead of the generic Venue list.

Google Sheets remain read-only. Existing `config.js` and the real `je-logo.png` are preserved.
