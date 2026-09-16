/* ---------------------------------------------------------------------------
   Coach Schedule — configuration
   ---------------------------------------------------------------------------
   This is the only file you edit to point the app at your sheet.
   See README.md for the full walkthrough.

   1. In the Google Sheet:  File -> Share -> Publish to web
      Publish the "Sessions" and "Coaches" tabs as CSV, and paste the two
      URLs below.

   2. Publish the "Financials" tab as CSV too, then open setup.html in a
      browser, paste that URL and choose a password. It hands you a
      `financials` block to paste over the one below. The URL is encrypted
      with your password, so it never appears in this file in readable form,
      and the app cannot fetch the financial data until someone enters the
      password correctly.
--------------------------------------------------------------------------- */

window.APP_CONFIG = {

  /* Published CSV URL for the "Sessions" tab. Public — safe to share. */
  sessionsCsvUrl: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQj4giL7oEoZLLfC74Sq97bnUGIdMqnG_ECOkNyRis-Drz4yH1OUssQ-YBRbCR6ajiJBvV05JjzOi8I/pub?gid=349419235&single=true&output=csv",

  /* Published CSV URL for the "Coaches" tab. Public — safe to share.
     Optional: leave as-is and the app builds the coach list from the
     sessions alone (you just lose the alias column and the rates). */
  coachesCsvUrl: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQj4giL7oEoZLLfC74Sq97bnUGIdMqnG_ECOkNyRis-Drz4yH1OUssQ-YBRbCR6ajiJBvV05JjzOi8I/pub?gid=11015794&single=true&output=csv",

  /* Published CSV URL for the "Venue info" tab. Public — safe to share.
     Optional. The Venues section works from the schedule alone; this adds
     the arrival detail (postcode, parking, where to meet, access, notes).
     It is a separate tab from "Venues", which the financial formulas use —
     nothing here touches those. Leave empty until the tab is published.
     Columns: venue, address, postcode, parking, meeting_point, access, notes. */
  venueInfoCsvUrl: "",

  /* Published CSV URL for the "Info" tab — the handbook. Public — safe to
     share. Optional: while this is empty the Handbook section is hidden
     entirely, so nobody sees an empty page.
     Columns: section, order, title, body. */
  infoCsvUrl: "",

  /* Published CSV URL for the "Resources" tab. Public — safe to share.
     Optional: while this is empty the Resources section is hidden entirely.
     Columns: section, order, title, description, url, image_url.
     `url` is what the card opens; `image_url` shows a picture on the card.
     Either, both or neither. */
  resourcesCsvUrl: "",

  /* Produced by setup.html — do not hand-edit. */
  financials: {
    salt: "yv6jJJ/oYpXFI6bYLLGgkg==",
    iv: "IkdOz5YMPEJIfgFY",
    ciphertext: "T9T5AZO/+4ub7ksTRH7zoI1dMtKWr+LskZqXojhBQ0cBv9CT2/bU1Idtag0Drm0nUX7UeI21lQrUaLvej9ZQhVj/Z7UG8+DUtwUuN5FcWRIEMeGNHRp2WbELmf+i9+qzkAuZaCSlBMxXlqaQlxA3t40CvJMlInABkcmgVnHvYiYIBZx+cmSfXqn5yEF+zJQq+hwjxnrOmDQ8gscvM4N/rzWCCL7xLtDniBsqBjLvoTJJ/b/bs8Znk8c=",
    iterations: 250000
  },

  /* Places that appear on the schedule under more than one name, written as
     "name as it appears": "the name to show it under". This only affects the
     Venues section - it never changes what the Sessions tab says, so the
     financial formulas are untouched.
     The "Venue info" tab can carry an `also_known_as` column instead, which
     is merged on top of this list. */
  venueAliases: {
    /* The school we coach for and the pitches we hire in the evening are the
       same car park, but two different strings on the Sessions tab - and the
       financial formulas need them to stay that way. */
    "City of London Freemen's": "City of London Freemen's School"
  },

  /* Coach codes, for "their own space". Normally these live in a `code`
     column on the Coaches tab (with an `owner` column for David and Josh),
     and the app reads them from there — this is only for trying it out
     before that column exists. Written as
       "Coach name": "CODE"                for a coach
       "Coach name": { code: "…", owner: true }   for an owner
     A code decides what the hub SHOWS. It is not a lock: the schedule is a
     published CSV and always readable. That is fine for a rota; anything
     genuinely private has to come through the Apps Script door instead. */
  coachCodes: {},

  /* Coaches who appear under more than one name.
     Written as  "name as it appears": "the real coach".
     Matching ignores case and extra spaces. The Coaches tab can carry an
     `aliases` column instead, which is merged on top of this list. */
  coachAliases: {
    "Jack": "Jacko"
  },

  /* Weeks per month, used only to show a monthly equivalent alongside the
     weekly school figures. Matches the Assumptions tab (52 / 12). */
  weeksPerMonth: 4.3333
};
