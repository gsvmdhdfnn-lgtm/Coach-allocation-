/* ---------------------------------------------------------------------------
   TEMPORARY — sample content for the preview only.

   The Handbook and the venue detail are both driven from sheet tabs that do
   not exist yet. Rather than show empty sections, this points them at two
   sample CSVs sitting in this folder, so the layout can be judged before
   anyone touches the spreadsheet.

   It only fills in URLs that are still blank, so the moment the real tabs are
   published and their links go into config.js, this does nothing.

   To remove it: delete this file, its sample CSVs, the sample poster, and
   the <script> tag for it in index.html.
--------------------------------------------------------------------------- */
(function () {
  var cfg = window.APP_CONFIG;
  if (!cfg) return;

  var used = false;
  if (!cfg.infoCsvUrl)      { cfg.infoCsvUrl      = "sample-info.csv";       used = true; }
  if (!cfg.venueInfoCsvUrl) { cfg.venueInfoCsvUrl = "sample-venue-info.csv"; used = true; }
  if (!cfg.resourcesCsvUrl) { cfg.resourcesCsvUrl = "sample-resources.csv";   used = true; }

  /* The app puts a quiet line at the top of anything fed from here, so nobody
     mistakes sample wording for something the office actually wrote. */
  cfg.demoContent = used;

  /* ------------------------------------------------------------------
     Sample coach codes, so "their own space" can be tried before the
     Coaches tab has a `code` column. Six characters, no 0/O/1/I/L, and
     nothing derived from the name - a coach should not be able to guess
     a colleague's.

     These are throwaway. The real ones get generated into the sheet and
     the app reads them from there instead.
     ------------------------------------------------------------------ */
  /* An empty object is still an object, so test for emptiness, not presence -
     config.js ships `coachCodes: {}` and that must not count as "already
     set". Same for the URLs above, which are empty strings and so falsy. */
  if (!cfg.coachCodes || !Object.keys(cfg.coachCodes).length) {
    cfg.coachCodes = {
      "David":  { code: "H4RN7Q", owner: true },
      "Josh":   { code: "T8MKW3", owner: true },
      "Tom":     "R6XJ92",
      "Sam":     "K3VP7D",
      "Danny":   "W9FQ4M",
      "Jacko":   "P2HD68",
      "Joe":     "N7ZC35",
      "Callum":  "B5TG94",
      "Charlie": "V6KN59",
      "Mat":     "M4JX76",
      "Ollie":   "D8QW23",
      "Zoe":     "Z3RP84"
    };
  }
})();
