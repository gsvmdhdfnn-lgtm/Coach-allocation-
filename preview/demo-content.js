/* ---------------------------------------------------------------------------
   TEMPORARY — sample content for the preview only.

   The Handbook and the venue detail are both driven from sheet tabs that do
   not exist yet. Rather than show empty sections, this points them at two
   sample CSVs sitting in this folder, so the layout can be judged before
   anyone touches the spreadsheet.

   It only fills in URLs that are still blank, so the moment the real tabs are
   published and their links go into config.js, this does nothing.

   To remove it: delete this file, its two sample CSVs, and the <script> tag
   for it in index.html.
--------------------------------------------------------------------------- */
(function () {
  var cfg = window.APP_CONFIG;
  if (!cfg) return;

  var used = false;
  if (!cfg.infoCsvUrl)      { cfg.infoCsvUrl      = "sample-info.csv";       used = true; }
  if (!cfg.venueInfoCsvUrl) { cfg.venueInfoCsvUrl = "sample-venue-info.csv"; used = true; }

  /* The app puts a quiet line at the top of anything fed from here, so nobody
     mistakes sample wording for something the office actually wrote. */
  cfg.demoContent = used;
})();
