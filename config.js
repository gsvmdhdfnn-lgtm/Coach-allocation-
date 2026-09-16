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

  /* Produced by setup.html — do not hand-edit. */
  financials: null,

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
