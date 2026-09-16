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
  /* ------------------------------------------------------------------
     A sample calendar and change log, built relative to today so the
     preview never goes stale. They are handed over as data: URLs, which
     go through exactly the same CSV path as a published sheet tab - no
     special case in the app for demo data.
     ------------------------------------------------------------------ */
  function monday(offsetWeeks) {
    var d = new Date();
    d.setHours(12, 0, 0, 0);                        // clear of DST edges
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7)  // back to Monday
                          + offsetWeeks * 7);
    return d.getFullYear() + "-" +
      String(d.getMonth() + 1).padStart(2, "0") + "-" +
      String(d.getDate()).padStart(2, "0");
  }

  function asCsv(text) {
    return "data:text/csv;charset=utf-8," + encodeURIComponent(text);
  }

  if (!cfg.calendarCsvUrl) {
    cfg.calendarCsvUrl = asCsv(
      "week_commencing,week_no,label,theme,running\n" +
      monday(0) + ",8,Term 1 Week 8,Jabs & Blocks,yes\n" +
      monday(1) + ",9,Term 1 Week 9,Start Attacks,yes\n" +
      monday(2) + ",10,Term 1 Week 10,Match & Mirror,yes\n" +
      monday(3) + ",11,Term 1 Week 11,\"Hard to beat, move your feet\",yes\n");
    used = true;
  }

  if (!cfg.termsCsvUrl) {
    /* David's scenario in full: St Peter's runs straight through. Daneshill
       (his Dane's Hill) starts a week later, AND takes a break for half
       term two weeks after that - two Terms rows for the same school, not
       one with a hole punched in it. Nothing here says "cancelled": a half
       term was never a scheduled session in the first place. */
    cfg.termsCsvUrl = asCsv(
      "school,starts,ends,note\n" +
      "St Peters," + monday(0) + "," + monday(20) + ",\n" +
      "Daneshill," + monday(1) + "," + monday(1) + ",\n" +
      "Daneshill," + monday(3) + "," + monday(20) + ",Back after half term\n");
    used = true;
  }

  if (!cfg.changesCsvUrl) {
    cfg.changesCsvUrl = asCsv(
      "week_commencing,session_id,venue,coach_out,coach_in,type,day,time,session_name,note\n" +
      /* one session off this week */
      monday(0) + ",E14,,,,cancelled,,,,School hall booked for a concert\n" +
      /* a coach away for a whole week - one row, every session of theirs */
      monday(1) + ",,,Tom,Sam,cover,,,,Tom on holiday\n" +
      /* a genuine one-off, unlike half term: nobody knew this in advance,
         so it stays a Changes row rather than a second Terms span */
      monday(2) + ",,City of London Freemen's School,,,cancelled,,,,Building works\n" +
      /* something the school asked for as a one-off */
      monday(3) + ",,Daneshill,,Tom,extra,Tuesday,1:00-2:00pm,Year 5 taster," +
        "School asked for a one-off\n");
    used = true;
  }

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
