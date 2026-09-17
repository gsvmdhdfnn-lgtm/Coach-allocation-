/* ---------------------------------------------------------------------------
   Coach Schedule
   Fetches the published Google Sheet tabs as CSV, filters by coach, renders.
   The Financials tab is never requested until the password has been accepted.
--------------------------------------------------------------------------- */
(function () {
  "use strict";

  var CFG = window.APP_CONFIG || {};

  var DAY_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday",
                   "Friday", "Saturday", "Sunday"];

  var money = new Intl.NumberFormat("en-GB", {
    style: "currency", currency: "GBP", minimumFractionDigits: 2
  });

  var state = {
    sessions: [],        // every session, coaches already split
    coaches: [],         // [{ name, sessions:[...] }] sorted A-Z
    rates: {},           // canonical name -> row from the Coaches tab
    aliases: {},         // lowercased alias -> canonical name
    financials: null,    // session_id -> row, once unlocked
    overheads: null,     // rows from the Overheads tab, once unlocked
    archive: null,       // the permanent weekly record, once unlocked
    selected: null,
    view: "home",
    calendar: null,      // "YYYY-MM-DD" (a Monday) -> { weekNo, label, theme, running }
    changes: null,       // the exceptions log, as rows
    terms: null,         // per-school term windows, as rows
    themes: null,        // "YYYY-MM-DD" -> category key -> theme, per programme
    week: null,          // the Monday currently being shown
    codes: null,         // CODE -> { name, owner }
    me: null             // whoever is signed in, if anyone
  };

  var el = {
    main:    document.getElementById("main"),
    picker:  document.getElementById("picker"),
    status:  document.getElementById("status"),
    results: document.getElementById("results"),
    summary: document.getElementById("summary"),
    days:    document.getElementById("days"),
    weekbar: document.getElementById("weekbar"),
    combo:   document.getElementById("combo"),
    input:   document.getElementById("coach-input"),
    toggle:  document.getElementById("combo-toggle"),
    list:    document.getElementById("coach-listbox"),
    modal:   document.getElementById("modal"),
    pwForm:  document.getElementById("pw-form"),
    pwInput: document.getElementById("pw-input"),
    pwError: document.getElementById("pw-error"),
    pwSubmit:document.getElementById("pw-submit"),
    pwCancel:document.getElementById("pw-cancel")
  };

  /* The sections that make this a hub rather than a single lookup tool. */
  var hub = {
    home:        document.getElementById("home"),
    tiles:       document.getElementById("home-tiles"),
    stats:       document.getElementById("hero-stats"),
    title:       document.getElementById("hero-title"),
    blurb:       document.getElementById("hero-blurb"),
    signin:      document.getElementById("home-signin"),
    badCode:     false,
    venues:      document.getElementById("venues"),
    venueList:   document.getElementById("venue-list"),
    handbook:    document.getElementById("handbook"),
    handbookBody:document.getElementById("handbook-body"),
    navHandbook: document.getElementById("nav-handbook"),
    resources:   document.getElementById("resources"),
    resourceBody:document.getElementById("resource-body"),
    navResources:document.getElementById("nav-resources"),
    venueInfo:   null,   // venue key -> row from the Venue info tab, once fetched
    venueAliases:null,   // another spelling -> the name to show it under
    info:        null,   // rows from the Info tab, once fetched
    infoError:   null,
    res:         null,   // rows from the Resources tab, once fetched
    resError:    null
  };

  /* ====================================================================== *
   * CSV
   * ====================================================================== */

  /** Parse RFC 4180 CSV into an array of string arrays. */
  function parseCsv(text) {
    var rows = [], row = [], field = "", i = 0, inQuotes = false;
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);  // strip BOM

    while (i < text.length) {
      var c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
          inQuotes = false; i++; continue;
        }
        field += c; i++; continue;
      }
      if (c === '"') { inQuotes = true; i++; continue; }
      if (c === ",") { row.push(field); field = ""; i++; continue; }
      if (c === "\r") { i++; continue; }
      if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
      field += c; i++;
    }
    row.push(field);
    rows.push(row);

    // Drop trailing blank lines and rows that are entirely empty.
    return rows.filter(function (r) {
      return r.some(function (v) { return String(v).trim() !== ""; });
    });
  }

  function headerKey(h) {
    return String(h).trim().toLowerCase().replace(/\s+/g, "_");
  }

  /** Turn parsed rows into objects keyed by normalised header name. */
  function toObjects(rows, required, tabName) {
    if (!rows.length) throw dataError(tabName, "the tab is empty");

    var headers = rows[0].map(headerKey);
    var missing = required.filter(function (k) { return headers.indexOf(k) === -1; });
    if (missing.length) {
      throw dataError(tabName,
        "these columns are missing: " + missing.join(", ") +
        ". Found: " + headers.filter(Boolean).join(", "));
    }

    return rows.slice(1).map(function (r) {
      var o = {};
      headers.forEach(function (h, i) { if (h) o[h] = (r[i] || "").trim(); });
      return o;
    });
  }

  function dataError(tabName, why) {
    var e = new Error("The " + tabName + " tab could not be read — " + why + ".");
    e.isDataError = true;
    return e;
  }

  /* ====================================================================== *
   * Fetching
   * ====================================================================== */

  function looksUnset(url) {
    return !url || /^PASTE_/.test(url);
  }

  function fetchCsv(url, tabName) {
    return fetch(url, { cache: "no-store", redirect: "follow" })
      .then(function (res) {
        if (!res.ok) {
          throw dataError(tabName,
            "the sheet replied " + res.status + " " + res.statusText +
            ". Check the tab is still published to the web");
        }
        return res.text();
      })
      .catch(function (err) {
        if (err.isDataError) throw err;
        throw dataError(tabName,
          "the sheet could not be reached. Check your connection, and that " +
          "the tab is published to the web (File → Share → Publish to web)");
      })
      .then(function (text) {
        // An unpublished or access-denied tab returns an HTML page, not CSV.
        if (/^\s*</.test(text)) {
          throw dataError(tabName,
            "the sheet returned a web page instead of CSV. That usually means " +
            "the tab is not published, or the link points at the editing URL " +
            "rather than the published CSV one");
        }
        return parseCsv(text);
      });
  }

  /* ====================================================================== *
   * Coach names
   * ====================================================================== */

  function nameKey(name) {
    return String(name).trim().toLowerCase().replace(/\s+/g, " ");
  }

  /** Resolve a name as written in the sheet to the one true coach name. */
  function resolveCoach(raw) {
    var trimmed = String(raw).trim();
    return state.aliases[nameKey(trimmed)] || trimmed;
  }

  /** "Josh, Tom" -> ["Josh", "Tom"], resolved and de-duplicated. */
  function splitCoaches(field) {
    var seen = Object.create(null), out = [];
    String(field || "").split(",").forEach(function (part) {
      var name = part.trim();
      if (!name) return;
      name = resolveCoach(name);
      var k = nameKey(name);
      if (seen[k]) return;
      seen[k] = true;
      out.push(name);
    });
    return out;
  }

  /* ====================================================================== *
   * Times
   * ====================================================================== */

  /** Minutes past midnight for the start of a range like "6:00-7:30pm". */
  function startMinutes(time) {
    var m = String(time).match(
      // Accepts 6:00-7:30pm, 6.00-7.30pm, 9am-3pm, "9am to 3pm", 09:00-15:00
      // and en/em dashes - people write times in the sheet however they like.
      /(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?(?:\s*[-–—]\s*|\s+to\s+)(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?/i);
    if (!m) return null;

    var sh = +m[1], sm = +(m[2] || 0), smer = m[3] && m[3].toLowerCase();
    var eh = +m[4], em = +(m[5] || 0), emer = m[6] && m[6].toLowerCase();

    function to24(h, mer) {
      if (!mer) return h;
      if (mer === "pm" && h !== 12) return h + 12;
      if (mer === "am" && h === 12) return 0;
      return h;
    }

    if (smer) return to24(sh, smer) * 60 + sm;

    if (emer) {
      // Only the end of the range is marked am/pm — usually it covers both.
      var end = to24(eh, emer) * 60 + em;
      var start = to24(sh, emer) * 60 + sm;
      if (start >= end) start = to24(sh, emer === "pm" ? "am" : "pm") * 60 + sm;
      return start;
    }

    return (sh < 8 ? sh + 12 : sh) * 60 + sm;   // no marker: assume afternoon
  }

  /** Minutes past midnight for the end of a range like "6:00-7:30pm". */
  function endMinutes(time) {
    var m = String(time).match(
      /(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?(?:\s*[-–—]\s*|\s+to\s+)(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?/i);
    if (!m) return null;

    var smer = m[3] && m[3].toLowerCase();
    var eh = +m[4], em = +(m[5] || 0), emer = m[6] && m[6].toLowerCase();
    var mer = emer || smer;

    function to24(h, mr) {
      if (!mr) return h;
      if (mr === "pm" && h !== 12) return h + 12;
      if (mr === "am" && h === 12) return 0;
      return h;
    }

    return mer ? to24(eh, mer) * 60 + em : (eh < 8 ? eh + 12 : eh) * 60 + em;
  }

  /* ====================================================================== *
   * Loading
   * ====================================================================== */

  function loadSchedule() {
    showLoading("Loading the schedule…");

    if (looksUnset(CFG.sessionsCsvUrl)) return showNotConfigured();

    var jobs = [fetchCsv(CFG.sessionsCsvUrl, "Sessions")];
    jobs.push(looksUnset(CFG.coachesCsvUrl)
      ? Promise.resolve(null)
      : fetchCsv(CFG.coachesCsvUrl, "Coaches").catch(function () { return null; }));

    /* Venue detail rides along rather than waiting for its own section: the
       aliases in it decide the venue count shown on the home page. */
    jobs.push(ensureVenueInfo());
    jobs.push(loadWeekData());

    return Promise.all(jobs).then(function (res) {
      buildAliases(res[1]);
      buildSessions(res[0]);
      buildCoachList();
      ready();
    }).catch(showError);
  }

  /** Alias map: built-in config first, then anything the Coaches tab adds. */
  function buildAliases(coachRows) {
    state.aliases = {};
    state.rates = {};
    Object.keys(CFG.coachAliases || {}).forEach(function (from) {
      state.aliases[nameKey(from)] = CFG.coachAliases[from];
    });

    if (!coachRows) return;
    var rows;
    try {
      rows = toObjects(coachRows, ["coach_name"], "Coaches");
    } catch (e) {
      return;   // the Coaches tab is optional — carry on without it
    }
    rows.forEach(function (r) {
      if (!r.coach_name) return;
      state.rates[nameKey(r.coach_name)] = r;
      state.aliases[nameKey(r.coach_name)] = r.coach_name;
      String(r.aliases || "").split(",").forEach(function (a) {
        if (a.trim()) state.aliases[nameKey(a)] = r.coach_name;
      });
    });
  }

  function buildSessions(rows) {
    var objs = toObjects(rows, ["session_id", "day", "coaches"], "Sessions");

    state.sessions = objs.map(function (r) {
      return {
        id:        r.session_id,
        programme: r.programme || "",
        category:  r.category || "",
        name:      r.session_name || r.category || r.session_id,
        ageGroup:  r.age_group || "",
        day:       r.day || "",
        time:      r.time || "",
        venue:     r.venue || "",
        address:   r.address || "",
        client:    r.client || "",
        coaches:   splitCoaches(r.coaches),
        startMin:  startMinutes(r.time)
      };
    }).filter(function (s) { return s.id; });

    if (!state.sessions.length) throw dataError("Sessions", "it has no rows");
  }

  /* ====================================================================== *
   * Which week
   * ====================================================================== *
   * There is a base schedule and it is mostly right. Everything that makes a
   * given week different from it - a school's half term, a coach on holiday,
   * a one-off a school asked for - is a row on the Changes tab.
   *
   * A change row targets whatever is filled in: a session_id for one
   * session, a venue or client for everything at that place, a coach_out for
   * everything that coach was down for. So a week's holiday is one row, not
   * eight - and a row nobody can be bothered to write is a week the hub gets
   * wrong.
   * ====================================================================== */

  var WEEKS_AHEAD = 3;   // this week plus three; David's call

  function isoDay(d) {
    return d.getFullYear() + "-" +
      String(d.getMonth() + 1).padStart(2, "0") + "-" +
      String(d.getDate()).padStart(2, "0");
  }

  /** The Monday of whatever week a date falls in. */
  function mondayOf(d) {
    var out = new Date(d.getTime());
    out.setHours(12, 0, 0, 0);            // midday, so DST cannot shift the day
    out.setDate(out.getDate() - ((out.getDay() + 6) % 7));
    return out;
  }

  /** Accepts 2026-09-14 and 14/09/2026, which is how people type dates. */
  function parseDay(v) {
    var t = String(v || "").trim();
    if (!t) return null;
    var iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
    if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3], 12);
    var uk = /^(\d{1,2})[\/.](\d{1,2})[\/.](\d{2,4})/.exec(t);
    if (uk) {
      var yr = +uk[3];
      return new Date(yr < 100 ? 2000 + yr : yr, +uk[2] - 1, +uk[1], 12);
    }
    var d = new Date(t);
    return isNaN(d.getTime()) ? null : d;
  }

  /**
   * Whether a school runs at all this week is not an exception - it is the
   * plan, and a different one per school. St Peter's and Dane's Hill can
   * both be "normal" and still not agree, because their terms do not start
   * on the same date. Putting that through Changes would mean a fresh
   * cancelled row for Dane's Hill every single week until its term starts -
   * exactly the "nobody will keep that up" trap the Changes tab exists to
   * avoid.
   *
   * So this is a separate, smaller idea: a date range per school. A session
   * belongs to a school by its `client` column, or its `venue` when client
   * is blank (a day session's venue usually IS the school). No row for a
   * school -> no restriction, it runs whenever the base schedule says.
   */
  function loadTerms() {
    if (!hasTab(CFG.termsCsvUrl)) { state.terms = []; return Promise.resolve(); }
    return fetchCsv(CFG.termsCsvUrl, "Terms").then(function (rows) {
      state.terms = toObjects(rows, ["school"], "Terms").map(function (r) {
        return {
          key: nameKey(r.school),
          school: String(r.school || "").trim(),
          starts: parseDay(r.starts),
          ends: parseDay(r.ends),
          note: String(r.note || "").trim()
        };
      }).filter(function (t) { return t.key; });
    }).catch(function (e) {
      console.warn("Terms could not be loaded:", e);
      state.terms = [];
    });
  }

  /**
   * A school can have more than one Terms row. That is not duplication -
   * it is how a mid-term break is expressed: one span up to half term, a
   * second span after it. Half term is not a cancellation - it was never
   * scheduled in the first place, so "Cancelled" would tell a coach
   * something went wrong when nothing did. It gets the same quiet, no-card
   * treatment as a term that has not started yet, because to a coach it is
   * the identical fact: this school, this week, nothing to do.
   */
  function schoolTerms(s) {
    if (!state.terms || !state.terms.length) return [];
    var key = nameKey(s.client || s.venue || "");
    return state.terms.filter(function (t) { return t.key === key; });
  }

  /** Does this one span cover the Monday of this week? A start with no end
      means "still going"; both blank would mean "always" (schoolTerms
      never returns a school with nothing set, so this is just the guard). */
  function inSpan(span, mondayIso) {
    var d = parseDay(mondayIso);
    if (span.starts && d < mondayOf(span.starts)) return false;
    if (span.ends && d > mondayOf(span.ends)) return false;
    return true;
  }

  /** In term if ANY of the school's spans cover this week. No rows at all
      means no restriction - runs whenever the base schedule says. */
  function inAnyTerm(spans, mondayIso) {
    if (!spans.length) return true;
    return spans.some(function (t) { return inSpan(t, mondayIso); });
  }

  /**
   * Coarser than inAnyTerm on purpose: is this week anywhere between the
   * EARLIEST start and the LATEST end across all of a school's spans -
   * i.e. somewhere within the whole enrolment, gaps like half term
   * included - rather than strictly inside one specific span.
   *
   * For a `monthly`-billed session, the family's subscription runs the
   * whole season (September - July, say), smoothed straight through a
   * half-term gap; it only actually stops outside that whole season
   * (August). A `weekly`-billed family pays as they go, so they use
   * inAnyTerm instead, at the finer per-span granularity - see agg().
   */
  function withinWholeSeason(spans, mondayIso) {
    if (!spans.length) return true;
    var d = parseDay(mondayIso);
    var starts = spans.filter(function (t) { return t.starts; })
                       .map(function (t) { return mondayOf(t.starts).getTime(); });
    if (starts.length && d.getTime() < Math.min.apply(null, starts)) return false;
    if (spans.some(function (t) { return t.starts && !t.ends; })) return true;
    var ends = spans.filter(function (t) { return t.ends; })
                     .map(function (t) { return mondayOf(t.ends).getTime(); });
    if (ends.length && d.getTime() > Math.max.apply(null, ends)) return false;
    return true;
  }

  /**
   * Why a school is not on this week - distinguishing "hasn't started",
   * "finished for the year" and "on a break between two spans" (half term),
   * because they read differently even though none of them is a
   * cancellation. Prefers whatever the sheet actually wrote in `note`.
   */
  function termMessage(spans, mondayIso) {
    var d = parseDay(mondayIso);
    var sorted = spans.slice().sort(function (a, b) {
      var at = a.starts ? a.starts.getTime() : -Infinity;
      var bt = b.starts ? b.starts.getTime() : -Infinity;
      return at - bt;
    });
    var first = sorted[0], last = sorted[sorted.length - 1];

    if (first.starts && d < mondayOf(first.starts)) {
      return (first.note ? first.note + " — " : "") + "starts " + shortDate(first.starts);
    }
    if (last.ends && d > mondayOf(last.ends)) {
      return (last.note ? last.note + " — " : "") + "ended " + shortDate(last.ends);
    }
    /* Neither before the first span nor after the last - so this is a gap
       between two of the school's own spans, e.g. half term. */
    var next = sorted.filter(function (t) {
      return t.starts && mondayOf(t.starts) > d;
    })[0];
    if (next) {
      return (next.note ? next.note + " — " : "") + "back " + shortDate(next.starts);
    }
    return "not on this week";
  }

  function loadWeekData() {
    var jobs = [
      loadTerms(),
      hasTab(CFG.calendarCsvUrl)
        ? fetchCsv(CFG.calendarCsvUrl, "Calendar").then(function (rows) {
            var map = Object.create(null);
            toObjects(rows, ["week_commencing"], "Calendar").forEach(function (r) {
              var d = parseDay(r.week_commencing);
              if (!d) return;
              map[isoDay(mondayOf(d))] = {
                weekNo: String(r.week_no || "").trim(),
                label:  String(r.label || "").trim(),
                theme:  String(r.theme || "").trim(),
                running: !/^(n|no|false|0)$/i.test(String(r.running || "yes").trim())
              };
            });
            state.calendar = map;
          })
        : Promise.resolve(),
      hasTab(CFG.changesCsvUrl)
        ? fetchCsv(CFG.changesCsvUrl, "Changes").then(function (rows) {
            state.changes = toObjects(rows, ["type"], "Changes").map(function (r) {
              var d = parseDay(r.week_commencing || r.date);
              return {
                week: d ? isoDay(mondayOf(d)) : "",
                sessionId: String(r.session_id || "").trim(),
                venue: String(r.venue || "").trim(),
                client: String(r.client || "").trim(),
                coachOut: String(r.coach_out || "").trim(),
                coachIn: String(r.coach_in || "").trim(),
                type: String(r.type || "").trim().toLowerCase(),
                day: String(r.day || "").trim(),
                time: String(r.time || "").trim(),
                name: String(r.session_name || "").trim(),
                note: String(r.note || "").trim()
              };
            });
          })
        : Promise.resolve(),
      /* Different programmes (Pre Academy, TDC, Academy...) run their own
         curriculum in the same week, so a week's theme is not one fact -
         it is one fact per category. Keyed the same way as Calendar
         (week -> ...) with a second key for the category, looked up
         against each session's own category rather than shown once for
         the whole week. */
      hasTab(CFG.themesCsvUrl)
        ? fetchCsv(CFG.themesCsvUrl, "Themes").then(function (rows) {
            var map = Object.create(null);
            toObjects(rows, ["week_commencing", "category"], "Themes").forEach(function (r) {
              var d = parseDay(r.week_commencing);
              if (!d) return;
              var wk = isoDay(mondayOf(d));
              if (!map[wk]) map[wk] = Object.create(null);
              map[wk][nameKey(r.category)] = String(r.theme || "").trim();
            });
            state.themes = map;
          })
        : Promise.resolve()
    ];
    return Promise.all(jobs).catch(function (e) {
      console.warn("Week data could not be loaded:", e);
      state.calendar = state.calendar || null;
      state.changes = state.changes || null;
      state.themes = state.themes || null;
    });
  }

  /** This session's theme for the currently selected week, if one is set. */
  function themeFor(session) {
    if (!state.themes || !state.week || !session.category) return "";
    var wk = state.themes[state.week];
    return (wk && wk[nameKey(session.category)]) || "";
  }

  function hasWeeks() { return !!(state.calendar || state.changes); }

  /** This week and the next few, whether or not the Calendar tab lists them. */
  function weekChoices() {
    var start = mondayOf(new Date()), out = [];
    for (var i = 0; i <= WEEKS_AHEAD; i++) {
      var d = new Date(start.getTime());
      d.setDate(d.getDate() + i * 7);
      var iso = isoDay(d);
      var info = (state.calendar && state.calendar[iso]) || {};
      out.push({
        iso: iso,
        date: d,
        thisWeek: i === 0,
        label: info.label || "",
        weekNo: info.weekNo || "",
        theme: info.theme || "",
        running: info.running !== false
      });
    }
    return out;
  }

  function shortDate(d) {
    return d.getDate() + " " +
      ["Jan","Feb","Mar","Apr","May","Jun",
       "Jul","Aug","Sep","Oct","Nov","Dec"][d.getMonth()];
  }

  function weekLabel(w) {
    var wc = "w/c " + w.date.getDate() + " " +
      ["Jan","Feb","Mar","Apr","May","Jun",
       "Jul","Aug","Sep","Oct","Nov","Dec"][w.date.getMonth()];
    if (w.thisWeek) return "This week — " + wc;
    return (w.label ? w.label + " — " : "") + wc;
  }

  function changesForWeek(iso) {
    return (state.changes || []).filter(function (c) { return c.week === iso; });
  }

  /** Does this change row point at this session? Whatever is filled in wins. */
  function changeHits(ch, s) {
    if (ch.sessionId) return ch.sessionId === s.id;
    if (ch.venue) return venueKey(ch.venue) === venueKey(s.venue);
    if (ch.client) return nameKey(ch.client) === nameKey(s.client || "");
    if (ch.coachOut) {
      return s.coaches.some(function (c) { return nameKey(c) === nameKey(ch.coachOut); });
    }
    return false;
  }

  /**
   * Whether this session is actually being COACHED this real week - out of
   * term (Terms), or cancelled (Changes). A cover still counts as running
   * (same session, different coach, same money); only cancelled zeroes it.
   *
   * Deliberately not about revenue: on the Financials page this only gates
   * coach cost and venue cost, never revenue, because a monthly
   * subscription bills the same whether that month's weeks were 3-on-1-off
   * or 4-on - confirmed with David directly. What it decides is whether
   * anyone was actually paid to be there.
   */
  function sessionRunsThisWeek(s, iso) {
    var spans = schoolTerms(s);
    if (spans.length && !inAnyTerm(spans, iso)) return false;
    var hits = changesForWeek(iso).filter(function (ch) { return changeHits(ch, s); });
    return !hits.some(function (ch) { return ch.type === "cancelled"; });
  }

  /**
   * One coach's week, with the changes applied. Sessions they have handed
   * over stay on the list, greyed, rather than vanishing - otherwise a coach
   * reads it as "deleted" and turns up anyway.
   */
  function weekFor(coach, iso) {
    var chs = changesForWeek(iso);
    var mine = [];
    var outOfTerm = [];   // their own sessions that simply are not on yet/still

    state.sessions.forEach(function (s) {
      var onBase = s.coaches.some(function (c) { return nameKey(c) === nameKey(coach.name); });

      var spans = schoolTerms(s);
      if (spans.length && !inAnyTerm(spans, iso)) {
        if (onBase) outOfTerm.push({ session: s, message: termMessage(spans, iso) });
        return;   // not part of the plan this week - nothing to cancel or cover
      }

      var coaches = s.coaches.slice();
      var cancelled = null, coveredBy = null, coveringFor = null;

      chs.forEach(function (ch) {
        if (ch.type === "extra" || !changeHits(ch, s)) return;
        if (ch.type === "cancelled") { cancelled = ch.note || "Cancelled"; return; }
        if (ch.type === "cover" && ch.coachOut && ch.coachIn) {
          coaches = coaches.map(function (c) {
            return nameKey(c) === nameKey(ch.coachOut) ? ch.coachIn : c;
          });
          if (nameKey(ch.coachOut) === nameKey(coach.name)) coveredBy = ch.coachIn;
          if (nameKey(ch.coachIn) === nameKey(coach.name)) coveringFor = ch.coachOut;
        }
      });

      var onIt = coaches.some(function (c) { return nameKey(c) === nameKey(coach.name); });
      if (!onIt && !coveredBy) return;

      mine.push({
        session: s,
        coaches: coaches,
        status: cancelled ? "cancelled" : coveredBy ? "covered"
              : coveringFor ? "covering" : "on",
        note: cancelled ||
              (coveredBy ? coveredBy + " is covering" : "") ||
              (coveringFor ? "Covering for " + coveringFor : "")
      });
    });

    /* One-offs are not on the base schedule at all, so they are built here. */
    chs.forEach(function (ch, i) {
      if (ch.type !== "extra") return;
      var who = splitCoaches(ch.coachIn || "");
      if (!who.some(function (c) { return nameKey(c) === nameKey(coach.name); })) return;
      mine.push({
        session: {
          id: "extra-" + iso + "-" + i,
          name: ch.name || "One-off session",
          programme: "", category: "", ageGroup: "", client: "",
          day: ch.day, time: ch.time, venue: ch.venue, address: "",
          coaches: who, startMin: startMinutes(ch.time)
        },
        coaches: who,
        status: "extra",
        note: ch.note || "Added this week"
      });
    });

    return { items: mine, outOfTerm: outOfTerm };
  }

  /* ====================================================================== *
   * Who is looking
   * ====================================================================== *
   * A coach gets a code, not a password: nothing to reset, nothing to
   * remember, and clearing it removes their access. It comes from a `code`
   * column on the Coaches tab, or from config.js while that column does not
   * exist yet.
   *
   * This decides what the hub SHOWS, not what it will hand over. The whole
   * schedule is a published CSV, so a coach who went looking could read all
   * of it. That is fine for a rota. It is not fine for feedback, which is
   * why feedback will come through the Apps Script door instead.
   * ====================================================================== */

  var ME_KEY = "je-hub-code";

  function truthy(v) { return /^(y|yes|true|1|owner)$/i.test(String(v || "").trim()); }

  function buildCodes() {
    var byCode = Object.create(null);

    function add(name, code, owner) {
      code = String(code || "").trim().toUpperCase();
      if (!code || !name) return;
      byCode[code] = { name: name, owner: !!owner };
    }

    /* The Coaches tab wins, because that is where this lives in the end. */
    Object.keys(state.rates).forEach(function (k) {
      var r = state.rates[k];
      add(r.coach_name, r.code, truthy(r.owner));
    });

    Object.keys(CFG.coachCodes || {}).forEach(function (name) {
      var v = CFG.coachCodes[name];
      if (typeof v === "string") add(name, v, false);
      else if (v) add(name, v.code, v.owner);
    });

    state.codes = byCode;
  }

  function lookUpCode(code) {
    var who = state.codes[String(code || "").trim().toUpperCase()];
    if (!who) return null;
    var coach = findCoach(who.name);
    return coach ? { name: coach.name, owner: who.owner, coach: coach } : null;
  }

  function rememberCode(code) {
    try { localStorage.setItem(ME_KEY, code); } catch (e) { /* private window */ }
  }

  function forgetCode() {
    try { localStorage.removeItem(ME_KEY); } catch (e) {}
    state.me = null;
    state.selected = null;
    el.input.value = "";
    applyIdentity();      // nav label and the financial button come back too
    setView("home");
  }

  /**
   * A code arrives in a link the first time and is remembered after that.
   * It is then taken back out of the address bar, so a screenshot of the
   * page does not hand it to anyone - the link in their messages is still
   * the way back if they clear their browser.
   */
  /* A bad code is left in the bar on purpose, so a refresh still shows the
     error rather than silently forgetting what went wrong. */
  function stripCode() {
    var rest = (location.hash || "").replace(/^#/, "").split("&")
      .filter(function (part) { return part && !/^me=/.test(part); }).join("&");
    history.replaceState(null, "",
      rest ? "#" + rest : location.pathname + location.search);
  }

  function signIn() {
    var m = /(?:^|[#&])me=([^&]+)/.exec(location.hash || "");
    var fromLink = m ? decodeURIComponent(m[1].replace(/\+/g, " ")) : null;
    var stored = null;
    try { stored = localStorage.getItem(ME_KEY); } catch (e) {}

    var who = fromLink ? lookUpCode(fromLink) : null;
    if (who) { rememberCode(fromLink); stripCode(); }
    else if (stored) who = lookUpCode(stored);

    state.me = who;
    return { me: who, badCode: !!fromLink && !who };
  }

  /** Every coach on any session, plus anyone listed on the Coaches tab. */
  function buildCoachList() {
    var byKey = Object.create(null);

    function slot(name) {
      var k = nameKey(name);
      if (!byKey[k]) byKey[k] = { name: name, sessions: [] };
      return byKey[k];
    }

    Object.keys(state.rates).forEach(function (k) { slot(state.rates[k].coach_name); });
    state.sessions.forEach(function (s) {
      s.coaches.forEach(function (name) { slot(name).sessions.push(s); });
    });

    state.coaches = Object.keys(byKey).map(function (k) { return byKey[k]; })
      .sort(function (a, b) { return a.name.localeCompare(b.name, "en-GB"); });

    state.coaches.forEach(function (c) { c.sessions.sort(bySlot); });
  }

  function bySlot(a, b) {
    var d = DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day);
    if (DAY_ORDER.indexOf(a.day) === -1) d = DAY_ORDER.indexOf(b.day) === -1 ? 0 : 1;
    else if (DAY_ORDER.indexOf(b.day) === -1) d = -1;
    if (d) return d;

    // Sessions with no readable time sort to the end of their day.
    if (a.startMin === null && b.startMin === null) return a.name.localeCompare(b.name);
    if (a.startMin === null) return 1;
    if (b.startMin === null) return -1;
    return a.startMin - b.startMin || a.name.localeCompare(b.name);
  }

  /* ====================================================================== *
   * Rendering
   * ====================================================================== */

  function showLoading(msg) {
    el.status.hidden = false;
    el.results.hidden = true;
    el.status.innerHTML = '<div class="spinner" aria-hidden="true"></div><p></p>';
    el.status.querySelector("p").textContent = msg;
  }

  function notice(title, bodyHtml, isError) {
    el.status.hidden = false;
    el.results.hidden = true;
    el.status.innerHTML = '<div class="notice' + (isError ? " is-error" : "") + '">' +
      "<h2></h2>" + bodyHtml + "</div>";
    el.status.querySelector("h2").textContent = title;
  }

  function showError(err) {
    console.error(err);
    var p = document.createElement("p");
    p.textContent = err && err.message ? err.message : String(err);
    notice("The schedule could not be loaded", p.outerHTML +
      '<p><button class="btn btn-primary" id="retry">Try again</button></p>', true);
    var btn = document.getElementById("retry");
    if (btn) btn.addEventListener("click", loadSchedule);
  }

  function showNotConfigured() {
    notice("Almost there", "" +
      "<p>This site has no sheet to read from yet. Open <code>config.js</code> " +
      "and paste in the published CSV links.</p>" +
      "<ol>" +
        "<li>In the Google Sheet: <strong>File → Share → Publish to web</strong>.</li>" +
        "<li>Publish the <strong>Sessions</strong> tab, format <strong>CSV</strong>, " +
            "and copy the link into <code>sessionsCsvUrl</code>.</li>" +
        "<li>Do the same for the <strong>Coaches</strong> tab.</li>" +
        "<li>For the financial layer, open <code>setup.html</code> and follow it.</li>" +
      "</ol>" +
      "<p>The README walks through all of it.</p>", false);
    el.picker.hidden = true;
  }

  /** The schedule has loaded: reveal the hub and open whichever section the
      link asked for. A bare visit lands on Home. */
  function ready() {
    el.status.hidden = true;
    if (fv && fv.nav) fv.nav.hidden = false;
    if (hub.navHandbook) hub.navHandbook.hidden = !hasTab(CFG.infoCsvUrl);
    if (hub.navResources) hub.navResources.hidden = !hasTab(CFG.resourcesCsvUrl);

    buildCodes();
    var signedIn = signIn();
    hub.badCode = signedIn.badCode;
    applyIdentity();

    var wanted = coachFromHash();
    if (wanted) {
      state.selected = findCoach(wanted);
      if (state.selected) el.input.value = state.selected.name;
    }

    if (state.me && !state.me.owner) state.selected = state.me.coach;
    var view = viewFromHash() || (state.selected ? "schedule" : "home");

    /* Someone who followed a link with a code in it expected to land on their
       own week. Dropping them on the whole team's, with the explanation in a
       box below the tiles, reads as "the site is broken" - which, from their
       side, it is. */
    if (hub.badCode) {
      setView("home", { silent: true });
      notice("That link did not work",
        "<p>The code in the link was not recognised, so this is the whole " +
        "team's schedule rather than yours.</p>" +
        "<p>If the link is one you have used before, your phone may be " +
        "holding an old copy of the page — pull down to refresh and try " +
        "again. Otherwise ask David for a new link.</p>", true);
      el.status.hidden = false;
      return;
    }

    if (view === "financials" && !state.financials) {
      setView("home", { silent: true });
      askPassword().then(function (ok) { if (ok) setView("financials"); });
      return;
    }
    setView(view, { silent: true });
  }

  /** Who the hub belongs to right now. A coach sees their own; an owner,
      and anyone without a code, sees the whole team. */
  function isMine() { return !!(state.me && !state.me.owner); }

  function applyIdentity() {
    /* The financial side is password-gated anyway, but putting it in front of
       a coach who will never open it makes the hub feel less like theirs. */
    var hideOwnerBits = isMine();
    var finBtn = document.querySelector('.view-btn[data-view="financials"]');
    if (finBtn) finBtn.hidden = hideOwnerBits;

    var schedBtn = document.querySelector('.view-btn[data-view="schedule"]');
    if (schedBtn) schedBtn.textContent = state.me ? "My week" : "Schedule";
  }

  /** Their week if we know who they are, otherwise the picker. */
  function showSchedule() {
    if (isMine()) {
      el.picker.hidden = true;
      state.selected = state.me.coach;
      render();
      return;
    }
    el.picker.hidden = false;
    if (state.selected) { render(); return; }
    notice("Pick a coach",
      "<p>Choose a coach above to see every session they run this week — " +
      state.sessions.length + " sessions across " + state.coaches.length +
      " coaches are loaded.</p>", false);
  }

  function findCoach(name) {
    return state.coaches.filter(function (c) {
      return nameKey(c.name) === nameKey(name);
    })[0] || null;
  }

  function coachFromHash() {
    var m = /(?:^|[#&])coach=([^&]+)/.exec(location.hash || "");
    if (!m) return null;
    var wanted = nameKey(decodeURIComponent(m[1].replace(/\+/g, " ")));
    var hit = state.coaches.filter(function (c) { return nameKey(c.name) === wanted; })[0];
    return hit ? hit.name : null;
  }

  function select(name) {
    var coach = findCoach(name);
    if (!coach) return;
    state.selected = coach;
    el.input.value = coach.name;
    setView("schedule");   // writes #coach=... and renders
  }

  function render() {
    var coach = state.selected;
    if (!coach) return;

    el.days.innerHTML = "";
    el.summary.innerHTML = "";
    renderWeekBar(coach);

    if (!coach.sessions.length) {
      el.status.hidden = false;
      el.results.hidden = true;
      var safe = document.createElement("strong");
      safe.textContent = coach.name;
      notice("No sessions for " + coach.name,
        "<p>" + safe.outerHTML + " is not listed on any session in the schedule.</p>" +
        "<p>If that looks wrong, check the <strong>coaches</strong> column on the " +
        "<strong>Sessions</strong> tab — a name spelled differently there will " +
        "show up as a separate coach. Known alternative spellings can be added to " +
        "the <strong>aliases</strong> column on the <strong>Coaches</strong> tab.</p>",
        false);
      return;
    }

    el.status.hidden = true;
    el.results.hidden = false;

    /* Without a calendar this is still the plain base schedule. */
    var week = state.week ? weekFor(coach, state.week) : null;
    var items = week ? week.items : coach.sessions.map(function (s) {
      return { session: s, coaches: s.coaches, status: "on", note: "" };
    });
    var outOfTerm = week ? week.outOfTerm : [];

    /* What they are actually working, which is not the same as what is on
       the base schedule: a session handed to someone else is not theirs. */
    function count(status) {
      return items.filter(function (it) { return it.status === status; }).length;
    }
    var doing = items.filter(function (it) {
      return it.status !== "cancelled" && it.status !== "covered";
    });
    var days = [];
    doing.forEach(function (it) {
      if (days.indexOf(it.session.day) === -1) days.push(it.session.day);
    });

    var bits = [];
    if (doing.length) {
      bits.push(doing.length + (doing.length === 1 ? " session" : " sessions"));
      bits.push(days.length + (days.length === 1 ? " day" : " days"));
    } else {
      bits.push("nothing on");
    }
    if (count("covered")) bits.push(count("covered") + " covered by someone else");
    if (count("cancelled")) bits.push(count("cancelled") + " cancelled");

    var h2 = document.createElement("h2");
    h2.textContent = coach.name;
    var meta = document.createElement("span");
    meta.className = "meta";
    meta.textContent = bits.join(" · ");
    el.summary.appendChild(h2);
    el.summary.appendChild(meta);

    if (outOfTerm.length) {
      var termNote = mk("p", "term-note");
      outOfTerm.forEach(function (o, i) {
        if (i) termNote.appendChild(document.createTextNode(" · "));
        var label = o.session.name || o.session.venue;
        termNote.appendChild(document.createTextNode(
          "Not running this week: " + label + " — " + o.message));
      });
      el.summary.appendChild(termNote);
    }

    if (!items.length) {
      var none = document.createElement("p");
      none.className = "empty";
      none.textContent = "Nothing on for " + coach.name + " this week.";
      el.days.appendChild(none);
      return;
    }

    // Group by day, in weekday order
    var groups = [];
    items.forEach(function (it) {
      var g = groups.filter(function (x) { return x.day === it.session.day; })[0];
      if (!g) { g = { day: it.session.day, items: [] }; groups.push(g); }
      g.items.push(it);
    });
    groups.sort(function (a, b) {
      return DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day);
    });

    groups.forEach(function (g) {
      var wrap = document.createElement("section");
      wrap.className = "day";

      var head = document.createElement("h3");
      head.className = "day-head";
      head.textContent = g.day || "Unscheduled";
      wrap.appendChild(head);

      var cards = document.createElement("div");
      cards.className = "cards";
      g.items.sort(function (a, b) {
        return (a.session.startMin || 0) - (b.session.startMin || 0);
      });
      g.items.forEach(function (it) {
        cards.appendChild(buildCard(it.session, coach, it));
      });
      wrap.appendChild(cards);

      el.days.appendChild(wrap);
    });
  }

  /* ---------------------------- the week bar ---------------------------- */

  function renderWeekBar(coach) {
    el.weekbar.innerHTML = "";
    if (!hasWeeks()) { el.weekbar.hidden = true; return; }

    var weeks = weekChoices();
    if (!state.week) state.week = weeks[0].iso;

    var label = mk("label", "picker-label", "Week");
    label.htmlFor = "week-select";
    var sel = mk("select", "fin-select");
    sel.id = "week-select";
    weeks.forEach(function (w) {
      var o = mk("option", null, weekLabel(w) + (w.running ? "" : " (nothing on)"));
      o.value = w.iso;
      if (w.iso === state.week) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener("change", function () {
      state.week = sel.value;
      render();
    });

    var box = mk("div", "weekpick");
    box.appendChild(label);
    box.appendChild(sel);
    el.weekbar.appendChild(box);

    el.weekbar.hidden = false;
  }

  /**
   * What the banner says. The headline carries the fact - "Sam is covering",
   * not "Covered" - because a coach skimming on a phone reads four words and
   * the label alone does not tell them whether to turn up.
   */
  function statusBanner(status, item, coach) {
    if (status === "on") return null;
    var note = (item && item.note) || "";

    var head, cls, why = note;
    if (status === "cancelled") {
      cls = "st-off"; head = "Cancelled — not happening";
    } else if (status === "covered") {
      cls = "st-covered";
      head = note || "Someone else is covering";
      why = "You are not needed";
    } else if (status === "covering") {
      cls = "st-covering";
      head = note || "You are covering this one";
      why = "";
    } else {
      cls = "st-extra"; head = "One-off — not on the usual schedule";
    }

    var bar = mk("div", "card-status " + cls);
    bar.appendChild(mk("span", "what", head));
    if (why) bar.appendChild(mk("span", "why", why));
    return bar;
  }

  function buildCard(session, coach, item) {
    var status = (item && item.status) || "on";
    var card = document.createElement("article");
    card.className = "card" + (status === "cancelled" ? " is-off" :
                               status === "covered" ? " is-handed-over" :
                               status === "covering" ? " is-cover" :
                               status === "extra" ? " is-extra" : "");
    var banner = statusBanner(status, item, coach);
    if (banner) card.appendChild(banner);

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "card-head";
    btn.setAttribute("aria-expanded", "false");
    btn.id = "head-" + session.id;

    var top = document.createElement("div");
    top.className = "card-top";

    var title = document.createElement("div");
    title.className = "card-title";
    var h = document.createElement("h3");
    h.textContent = session.name;
    title.appendChild(h);

    // Age group, then this week's theme in place of the old category/
    // programme tags - those mostly repeated what the title already said,
    // the theme is the thing worth a coach's eye going to first.
    var tags = document.createElement("div");
    tags.className = "tags";

    if (session.ageGroup) tags.appendChild(tag(session.ageGroup, true));
    var cardTheme = themeFor(session);
    if (cardTheme) tags.appendChild(mk("span", "card-theme", cardTheme));

    if (tags.childNodes.length) title.appendChild(tags);
    top.appendChild(title);

    var when = document.createElement("div");
    when.className = "card-time";
    var t = document.createElement("div");
    t.className = "t";
    t.textContent = session.time || "Time TBC";
    when.appendChild(t);
    when.insertAdjacentHTML("beforeend",
      '<span class="chev" aria-hidden="true"><svg viewBox="0 0 20 20">' +
      '<path d="M5 8l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round"/></svg></span>');
    top.appendChild(when);
    btn.appendChild(top);

    var facts = document.createElement("dl");
    facts.className = "card-facts";
    // School sessions are named after the venue - no need to print it twice.
    if (session.venue && nameKey(session.venue) !== nameKey(session.name)) {
      facts.appendChild(fact("Venue", session.venue));
    }
    if (session.address) facts.appendChild(fact("Address", session.address));

    /* The theme already shows once, in blue by the title - not repeated here. */

    /* Who is actually on it this week, which is not always the base schedule. */
    var onIt = (item && item.coaches) || session.coaches;
    var others = onIt.filter(function (c) { return nameKey(c) !== nameKey(coach.name); });
    facts.appendChild(fact("With", others.length ? others.join(", ") : "On their own"));

    /* The banner already carries the reason - no need to say it twice. */
    btn.appendChild(facts);

    card.appendChild(btn);

    // Collapsed financial panel
    var fin = document.createElement("div");
    fin.className = "fin";
    var inner = document.createElement("div");
    inner.className = "fin-inner";
    var body = document.createElement("div");
    body.className = "fin-body";
    body.id = "fin-" + session.id;
    body.setAttribute("role", "region");
    body.setAttribute("aria-labelledby", btn.id);
    inner.appendChild(body);
    fin.appendChild(inner);
    card.appendChild(fin);

    btn.setAttribute("aria-controls", body.id);
    btn.addEventListener("click", function () { onCardClick(card, btn, body, session); });

    return card;
  }

  function tag(text, accent) {
    var s = document.createElement("span");
    s.className = "tag" + (accent ? " tag-accent" : "");
    s.textContent = text;
    return s;
  }

  function fact(key, value) {
    var row = document.createElement("div");
    var k = document.createElement("dt");
    k.className = "k";
    k.textContent = key;
    var v = document.createElement("dd");
    v.className = "v";
    v.style.margin = "0";
    v.textContent = value;
    row.appendChild(k);
    row.appendChild(v);
    return row;
  }

  /* ====================================================================== *
   * Financial layer
   * ====================================================================== */

  function onCardClick(card, btn, body, session) {
    if (card.classList.contains("is-open")) {
      card.classList.remove("is-open");
      btn.setAttribute("aria-expanded", "false");
      return;
    }
    if (!state.financials) {
      askPassword().then(function (ok) {
        if (ok) openCard(card, btn, body, session);
      });
      return;
    }
    openCard(card, btn, body, session);
  }

  function openCard(card, btn, body, session) {
    body.innerHTML = "";
    body.appendChild(renderFinancials(session));
    card.classList.add("is-open");
    btn.setAttribute("aria-expanded", "true");
  }

  function renderFinancials(session) {
    var frag = document.createDocumentFragment();
    var row = state.financials[session.id];

    if (!row) {
      var p = document.createElement("p");
      p.className = "fin-missing";
      p.textContent = "No financial row for " + session.id +
        " on the Financials tab. Add one keyed by that session_id.";
      frag.appendChild(p);
      return frag;
    }

    var period = String(row.period || "").toLowerCase();
    var head = document.createElement("div");
    head.className = "fin-head";
    var h4 = document.createElement("h4");
    h4.textContent = "Financials";
    head.appendChild(h4);
    if (period) {
      var badge = document.createElement("span");
      badge.className = "period";
      badge.textContent = period === "weekly" ? "Per week"
                        : period === "monthly" ? "Per month"
                        : period;
      head.appendChild(badge);
    }
    frag.appendChild(head);

    var grid = document.createElement("div");
    grid.className = "fin-grid";
    grid.appendChild(cell("Participants", count(row.participants)));
    grid.appendChild(cell("Price each", cash(row.price_per_participant)));
    grid.appendChild(cell("Revenue (gross)", cash(row.revenue_gross)));
    grid.appendChild(cell("Revenue (net)", cash(row.revenue_net)));
    grid.appendChild(cell("Coach cost", cash(row.coach_cost)));
    grid.appendChild(cell("Venue cost", cash(row.venue_cost)));

    var profit = num(row.profit);
    var pc = cell("Profit", cash(row.profit));
    pc.className = "fin-cell is-profit";
    if (profit !== null) {
      pc.querySelector(".value").classList.add(profit >= 0 ? "pos" : "neg");
    }
    grid.appendChild(pc);
    frag.appendChild(grid);

    // Never let the two time bases sit side by side unlabelled.
    var note = document.createElement("p");
    note.className = "fin-note";
    var weeks = Number(CFG.weeksPerMonth) || 4.3333;
    if (period === "weekly") {
      note.textContent = "School sessions are billed weekly." +
        (profit === null ? "" : " At " + weeks.toFixed(2) + " weeks that is about " +
          money.format(profit * weeks) + " a month.");
    } else if (period === "monthly") {
      note.textContent = "Evening sessions are billed monthly." +
        (profit === null ? "" : " That is about " +
          money.format(profit / weeks) + " a week.");
    } else {
      note.textContent = "No period set on the Financials tab for this session, " +
        "so these figures are unlabelled — add weekly or monthly to the period column.";
    }
    frag.appendChild(note);

    return frag;
  }

  function cell(label, value) {
    var d = document.createElement("div");
    d.className = "fin-cell";
    var l = document.createElement("span");
    l.className = "label";
    l.textContent = label;
    var v = document.createElement("span");
    v.className = "value";
    v.textContent = value;
    d.appendChild(l);
    d.appendChild(v);
    return d;
  }

  function num(v) {
    if (v === undefined || v === null) return null;
    var s = String(v).trim();
    if (!s) return null;
    var neg = /^\(.*\)$/.test(s);               // (£81.68) style negatives
    s = s.replace(/[()]/g, "").replace(/[£,\s]/g, "");
    if (s === "" || s === "-" || s === "–" || s.toLowerCase() === "n/a") return null;
    var n = parseFloat(s);
    if (!isFinite(n)) return null;
    return neg ? -n : n;
  }

  function cash(v) {
    var n = num(v);
    return n === null ? "—" : money.format(n);
  }

  function count(v) {
    var n = num(v);
    return n === null ? "—" : String(n);
  }

  /* ---------------------- password + decryption ---------------------- */

  var pending = null;

  function askPassword() {
    return new Promise(function (resolve) {
      if (!CFG.financials || !CFG.financials.ciphertext) {
        alert("The financial layer is not set up yet. Open setup.html to " +
              "generate the settings, then paste them into config.js.");
        resolve(false);
        return;
      }
      pending = resolve;
      el.pwError.hidden = true;
      el.pwInput.value = "";
      el.modal.hidden = false;
      el.pwInput.focus();
    });
  }

  function closeModal(result) {
    el.modal.hidden = true;
    el.pwSubmit.disabled = false;
    el.pwSubmit.textContent = "Unlock";
    if (pending) { pending(result); pending = null; }
  }

  function b64ToBytes(b64) {
    var bin = atob(String(b64).replace(/\s+/g, ""));
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  /** Turn the password into the AES key that the URL was encrypted with. */
  function deriveKey(password, salt, iterations) {
    return crypto.subtle
      .importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"])
      .then(function (base) {
        return crypto.subtle.deriveKey(
          { name: "PBKDF2", salt: salt, iterations: iterations, hash: "SHA-256" },
          base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
      });
  }

  /**
   * The Financials URL is stored encrypted, so a wrong password does not
   * merely fail a check — it cannot produce a URL to fetch at all.
   */
  function unlock(password) {
    var f = CFG.financials;
    return deriveKey(password, b64ToBytes(f.salt), f.iterations || 250000)
      .then(function (key) {
        return crypto.subtle.decrypt(
          { name: "AES-GCM", iv: b64ToBytes(f.iv) }, key, b64ToBytes(f.ciphertext));
      })
      .then(function (plain) {
        var url = new TextDecoder().decode(plain).trim();
        // AES-GCM already authenticates, so a wrong password throws above.
        // This only catches a blob that decrypted into something unusable.
        if (!url || /[\u0000-\u001f]/.test(url)) throw new Error("bad-password");
        return fetchCsv(url, "Financials");
      })
      .then(function (rows) {
        var objs = toObjects(rows, ["session_id"], "Financials");
        var map = {};
        objs.forEach(function (r) { if (r.session_id) map[r.session_id] = r; });
        state.financials = map;   // memory only — gone on reload, never stored
        return loadOverheads();
      })
      .then(loadArchive);
  }

  /** Company-wide costs, not tied to any session. Optional, and only ever
      fetched once the password above has already succeeded. */
  function loadOverheads() {
    if (!hasTab(CFG.overheadsCsvUrl)) { state.overheads = []; return; }
    return fetchCsv(CFG.overheadsCsvUrl, "Overheads").then(function (rows) {
      state.overheads = toObjects(rows, ["item"], "Overheads").map(function (r) {
        return {
          item: String(r.item || "").trim(),
          category: String(r.category || "").trim(),
          amount: num(r.amount) || 0,
          repeats: String(r.repeats || "").trim().toLowerCase(),
          starts: parseDay(r.starts),
          ends: parseDay(r.ends),
          note: String(r.note || "").trim()
        };
      }).filter(function (r) { return r.item; });
    }).catch(function (e) {
      console.warn("Overheads could not be loaded:", e);
      state.overheads = [];
    });
  }

  /** The permanent weekly record, read-only here — the app only ever sums
      what is already archived, never writes to it. Same password gate as
      Financials/Overheads: not fetched until the password has succeeded. */
  function loadArchive() {
    if (!hasTab(CFG.archiveCsvUrl)) { state.archive = []; return; }
    return fetchCsv(CFG.archiveCsvUrl, "P&L archive").then(function (rows) {
      state.archive = toObjects(rows, ["week_commencing", "session_id"], "P&L archive")
        .map(function (r) {
          return {
            week: isoDay(mondayOf(parseDay(r.week_commencing) || new Date())),
            sessionId: String(r.session_id || "").trim(),
            gross: num(r.revenue_gross) || 0,
            net: num(r.revenue_net) || 0,
            coach: num(r.coach_cost) || 0,
            venue: num(r.venue_cost) || 0,
            profit: num(r.profit) || 0,
            participants: num(r.participants) || 0
          };
        }).filter(function (r) { return r.week && r.sessionId; });
    }).catch(function (e) {
      console.warn("P&L archive could not be loaded:", e);
      state.archive = [];
    });
  }

  /**
   * Recurring costs converted to both bases, same shape as agg(). One-offs
   * are kept separate rather than blended in - folding "a laptop, once"
   * into a weekly average would be a made-up number, not a fact, the same
   * reasoning as keeping a snapshot distinct from a total everywhere else
   * in this app.
   */
  function overheadTotals() {
    var out = { weekly: 0, monthly: 0, oneOffWeek: [], oneOffMonth: [] };
    if (!state.overheads || !state.overheads.length) return out;

    var thisMonday = mondayOf(new Date());
    var now = new Date();

    state.overheads.forEach(function (r) {
      if (!r.repeats) {
        if (!r.starts) return;
        if (isoDay(mondayOf(r.starts)) === isoDay(thisMonday)) out.oneOffWeek.push(r);
        if (r.starts.getFullYear() === now.getFullYear() &&
            r.starts.getMonth() === now.getMonth()) out.oneOffMonth.push(r);
        return;
      }
      var toWeekly = { weekly: 1, monthly: 1 / WEEKS, quarterly: 1 / 13,
                       annually: 1 / 52 }[r.repeats];
      var toMonthly = { weekly: WEEKS, monthly: 1, quarterly: 1 / 3,
                        annually: 1 / 12 }[r.repeats];
      if (toWeekly == null) return;   // an unrecognised word in `repeats` - skip, don't guess
      out.weekly += r.amount * toWeekly;
      out.monthly += r.amount * toMonthly;
    });
    return out;
  }

  el.pwForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var pw = el.pwInput.value;
    if (!pw) return;

    if (!window.isSecureContext || !window.crypto || !crypto.subtle) {
      el.pwError.textContent = "This needs a secure connection (https). " +
        "Open the site over https rather than as a local file.";
      el.pwError.hidden = false;
      return;
    }

    el.pwSubmit.disabled = true;
    el.pwSubmit.textContent = "Checking…";
    el.pwError.hidden = true;

    unlock(pw).then(function () {
      closeModal(true);
    }).catch(function (err) {
      el.pwSubmit.disabled = false;
      el.pwSubmit.textContent = "Unlock";
      el.pwError.textContent = err && err.isDataError
        ? err.message
        : "That password is not right.";
      el.pwError.hidden = false;
      el.pwInput.select();
    });
  });

  el.pwCancel.addEventListener("click", function () { closeModal(false); });
  el.modal.addEventListener("mousedown", function (e) {
    if (e.target === el.modal) closeModal(false);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !el.modal.hidden) closeModal(false);
  });

  /* ====================================================================== *
   * Coach combobox
   * ====================================================================== */

  var combo = { open: false, active: -1, items: [] };

  function openList(filter) {
    var q = nameKey(filter || "");
    combo.items = state.coaches.filter(function (c) {
      return !q || nameKey(c.name).indexOf(q) !== -1;
    });

    el.list.innerHTML = "";
    if (!combo.items.length) {
      var li = document.createElement("li");
      li.className = "combo-empty";
      li.textContent = "No coach matches “" + filter + "”";
      el.list.appendChild(li);
    } else {
      combo.items.forEach(function (c, i) {
        var li = document.createElement("li");
        li.className = "combo-option";
        li.id = "coach-opt-" + i;
        li.setAttribute("role", "option");
        li.setAttribute("aria-selected",
          state.selected && nameKey(state.selected.name) === nameKey(c.name) ? "true" : "false");

        var n = document.createElement("span");
        n.textContent = c.name;
        var cnt = document.createElement("span");
        cnt.className = "count";
        cnt.textContent = c.sessions.length ? c.sessions.length + " sessions" : "no sessions";
        li.appendChild(n);
        li.appendChild(cnt);

        li.addEventListener("mousedown", function (e) {
          e.preventDefault();          // keep focus so blur does not race us
          select(c.name);
          closeList();
        });
        el.list.appendChild(li);
      });
    }

    el.list.hidden = false;
    combo.open = true;
    combo.active = -1;
    el.input.setAttribute("aria-expanded", "true");
    el.combo.setAttribute("aria-owns-open", "true");
  }

  function closeList() {
    el.list.hidden = true;
    combo.open = false;
    combo.active = -1;
    el.input.setAttribute("aria-expanded", "false");
    el.input.removeAttribute("aria-activedescendant");
    el.combo.setAttribute("aria-owns-open", "false");
  }

  function setActive(i) {
    var opts = el.list.querySelectorAll(".combo-option");
    if (!opts.length) return;
    if (i < 0) i = opts.length - 1;
    if (i >= opts.length) i = 0;
    combo.active = i;
    Array.prototype.forEach.call(opts, function (o, n) {
      o.classList.toggle("is-active", n === i);
    });
    opts[i].scrollIntoView({ block: "nearest" });
    el.input.setAttribute("aria-activedescendant", opts[i].id);
  }

  el.input.addEventListener("focus", function () { openList(""); el.input.select(); });
  el.input.addEventListener("input", function () { openList(el.input.value); });

  el.input.addEventListener("keydown", function (e) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!combo.open) return openList(el.input.value);
      setActive(combo.active + (e.key === "ArrowDown" ? 1 : -1));
      return;
    }
    if (e.key === "Enter") {
      if (combo.open && combo.active >= 0 && combo.items[combo.active]) {
        e.preventDefault();
        select(combo.items[combo.active].name);
        closeList();
      } else if (combo.open && combo.items.length === 1) {
        e.preventDefault();
        select(combo.items[0].name);
        closeList();
      }
      return;
    }
    if (e.key === "Escape" && combo.open) {
      e.preventDefault();
      el.input.value = state.selected ? state.selected.name : "";
      closeList();
    }
  });

  el.input.addEventListener("blur", function () {
    // Restore the selected name if the box was left half-typed.
    el.input.value = state.selected ? state.selected.name : "";
    closeList();
  });

  el.toggle.addEventListener("mousedown", function (e) {
    e.preventDefault();
    if (combo.open) { closeList(); return; }
    el.input.focus();
    openList("");
  });

  /* Back button, or a link someone was sent. */
  window.addEventListener("hashchange", function () {
    var name = coachFromHash();
    if (name && (!state.selected || nameKey(name) !== nameKey(state.selected.name))) {
      var coach = findCoach(name);
      if (coach) { state.selected = coach; el.input.value = coach.name; }
    }
    /* No hash at all means the root of the site, which is Home. An unknown
       hash is left alone - it may belong to something else on the page. */
    var view = viewFromHash() || (location.hash ? null : "home");
    if (view && view !== state.view) {
      if (view === "financials" && !state.financials) {
        askPassword().then(function (ok) { if (ok) setView("financials"); });
        return;
      }
      setView(view, { silent: true });
    } else if (state.view === "schedule") {
      showSchedule();
    }
  });


  /* ====================================================================== *
   * Financials view - roll-ups above the per-session cards
   * ====================================================================== */

  var WEEKS = Number(CFG.weeksPerMonth) || 4.3333;
  var fv = {
    nav:    document.getElementById("views"),
    view:   document.getElementById("finview"),
    cards:  document.getElementById("head-cards"),
    picks:  document.getElementById("fin-pickers"),
    detail: document.getElementById("fin-detail"),
    filterControls: document.getElementById("fin-filter-controls"),
    filterResult:   document.getElementById("fin-filter-result"),
    periodControls: document.getElementById("period-controls"),
    periodResult:   document.getElementById("period-result"),
    basis:  "monthly",
    nodes:  {},
    node:   null,
    /* Independent of the programme tree above: a day, a venue and/or a
       time window, any combination. `days` holds the ones switched on. */
    filter: { days: {}, venue: "", from: "", to: "" },
    /* A date range - "from"/"to" the person picks. */
    period: { from: "", to: "" }
  };

  var DAY_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday",
                   "Saturday", "Sunday"];

  /** Totals for a set of sessions, expressed in BOTH bases. */
  /**
   * A single week's ACTUAL total for a list of sessions - not the typical
   * figure, what this specific week genuinely brings in. Works for any
   * week, not just today: the head cards use it for "This week (actual)",
   * the date-range panel reuses it to project any future week that has
   * not been archived yet, so the two never compute this differently.
   *
   * Revenue and cost do not follow the same rule, and revenue does not
   * follow one rule for every session - it depends on how that session
   * is billed (`period`), confirmed directly with David:
   *   - `monthly`: a smoothed subscription, billed the same whether a
   *     school's specific weeks that month were 3-on-1-off or 4-on.
   *     Revenue keeps counting through a mid-season gap like half term -
   *     it only stops outside the WHOLE season (before term starts, or
   *     after it ends for the year).
   *   - `weekly`: pay-as-you-go, no smoothing - revenue only counts for a
   *     week the session is actually running, same as cost below.
   * Coach cost and venue cost always zero for a week that is not actually
   * happening, regardless of billing period - nobody is coaching, no
   * venue is being paid for, either way.
   */
  function weekEstimate(list, iso) {
    var out = { gross: 0, net: 0, coach: 0, venue: 0, profit: 0 };
    list.forEach(function (s) {
      var f = state.financials && state.financials[s.id];
      if (!f) return;
      var per = String(f.period || "").toLowerCase();
      var toW = per === "monthly" ? 1 / WEEKS : 1;
      var gross = num(f.revenue_gross) || 0, net = num(f.revenue_net) || 0,
          coach = num(f.coach_cost) || 0, venue = num(f.venue_cost) || 0;
      var costsApply = sessionRunsThisWeek(s, iso);
      var revenueApplies = per === "weekly"
        ? costsApply
        : withinWholeSeason(schoolTerms(s), iso);
      if (revenueApplies) { out.gross += gross * toW; out.net += net * toW; }
      if (costsApply)     { out.coach += coach * toW; out.venue += venue * toW; }
    });
    out.profit = out.net - out.coach - out.venue;
    return out;
  }

  function agg(list) {
    var a = { participants: 0, missing: 0, counted: 0,
      monthly:  { gross:0, net:0, coach:0, venue:0, profit:0 },
      weekly:   { gross:0, net:0, coach:0, venue:0, profit:0 },
      /* The typical figures above answer "what does this normally bring
         in" and never change with the calendar, on purpose - so promoting
         or renaming a school does not quietly move them. thisWeek is the
         separate, deliberately different question "what does this
         actually bring in, this real week" - see weekEstimate() above. */
      thisWeek: { gross:0, net:0, coach:0, venue:0, profit:0 }
    };
    list.forEach(function (s) {
      var f = state.financials && state.financials[s.id];
      if (!f) { a.missing++; return; }
      a.counted++;
      var per = String(f.period || "").toLowerCase();
      var toM = per === "weekly" ? WEEKS : 1;
      var toW = per === "monthly" ? 1 / WEEKS : 1;
      var v = { gross: num(f.revenue_gross) || 0, net: num(f.revenue_net) || 0,
                coach: num(f.coach_cost) || 0, venue: num(f.venue_cost) || 0,
                profit: num(f.profit) || 0 };
      a.participants += num(f.participants) || 0;
      Object.keys(v).forEach(function (k) {
        a.monthly[k] += v[k] * toM;
        a.weekly[k]  += v[k] * toW;
      });
    });
    a.thisWeek = weekEstimate(list, isoDay(mondayOf(new Date())));
    return a;
  }

  function isDay(s) { return /^day$/i.test(s.programme); }

  /**
   * Everything -> programme -> category or school -> session name -> the
   * individual session. The name level matters: 'Pre Academy U8' runs twice
   * a week and the two are not alike, so they roll up and then split.
   */
  function buildTree() {
    var root = { key: "all", label: "Everything", level: 0,
                 sessions: state.sessions.slice(), children: [] };
    var progs = {};

    state.sessions.forEach(function (s) {
      var pLabel = isDay(s) ? "Day programme" : "Evening programme";
      var gLabel = isDay(s) ? (s.client || s.venue || "Unknown")
                            : (s.category || "Other");
      var p = progs[pLabel];
      if (!p) {
        p = progs[pLabel] = { key: "p:" + pLabel, label: pLabel, level: 1,
                              sessions: [], children: [], groups: {} };
        root.children.push(p);
      }
      p.sessions.push(s);

      var g = p.groups[gLabel];
      if (!g) {
        g = p.groups[gLabel] = { key: "g:" + pLabel + ":" + gLabel, label: gLabel,
                                 level: 2, sessions: [], children: [], names: {} };
        p.children.push(g);
      }
      g.sessions.push(s);

      var nLabel = s.name || gLabel;
      var nm = g.names[nLabel];
      if (!nm) {
        nm = g.names[nLabel] = { key: "n:" + g.key + ":" + nLabel, label: nLabel,
                                 level: 3, sessions: [], children: [] };
        g.children.push(nm);
      }
      nm.sessions.push(s);
      nm.children.push({ key: "s:" + s.id, label: s.day + " " + s.time,
                         level: 4, sessions: [s], children: [], session: s });
    });

    // Tidy the levels that would say nothing.
    root.children.forEach(function (p) {
      p.children.forEach(function (g) {
        // A school whose every session is named after it: skip the name step.
        if (g.children.length === 1 && g.children[0].label === g.label) {
          g.children = g.children[0].children;
        }
        // One occurrence of a name is just that session.
        g.children.forEach(function (nm) {
          if (nm.children.length === 1 && !nm.session) {
            nm.session = nm.children[0].session;
            nm.children = [];
          }
        });
      });
    });

    (function rank(node) {
      node.children.sort(function (a, b) {
        return agg(b.sessions).monthly.profit - agg(a.sessions).monthly.profit;
      });
      node.children.forEach(function (c) { c.parent = node; rank(c); });
    })(root);

    fv.nodes = {};
    (function index(n) { fv.nodes[n.key] = n; n.children.forEach(index); })(root);
    fv.root = root;
    return root;
  }

  /** Walk up from a node to the root. */
  function chain(node) {
    var out = [];
    for (var n = node; n; n = n.parent) out.unshift(n);
    return out;
  }

  function option(value, label, selected) {
    var o = document.createElement("option");
    o.value = value; o.textContent = label;
    if (selected) o.selected = true;
    return o;
  }

  function step(labelText, build) {
    var wrap = document.createElement("div");
    wrap.className = "fin-step";
    var lab = document.createElement("label");
    lab.className = "picker-label";
    var sel = document.createElement("select");
    sel.className = "fin-select";
    sel.id = "step-" + labelText.toLowerCase().replace(/[^a-z]+/g, "-");
    lab.setAttribute("for", sel.id);
    lab.textContent = labelText;
    build(sel);
    wrap.appendChild(lab); wrap.appendChild(sel);
    return wrap;
  }

  /** One dropdown per level that has somewhere further to go. */
  function renderPickers(node) {
    fv.picks.innerHTML = "";
    var coachView = !!node.coachView;
    var path = coachView ? [] : chain(node);
    var grp  = path[2] || null;     // category or school
    var name = path[3] || null;     // session name
    var leaf = path[4] || null;     // the individual session

    fv.picks.appendChild(step("Programme or group", function (sel) {
      sel.appendChild(option("all", "Everything", node.key === "all"));
      fv.root.children.forEach(function (p) {
        var og = document.createElement("optgroup");
        og.label = p.label;
        og.appendChild(option(p.key, "All " + p.label.replace(" programme", ""),
                              node.key === p.key));
        p.children.forEach(function (g) {
          og.appendChild(option(g.key, g.label, grp && grp.key === g.key));
        });
        sel.appendChild(og);
      });
      var og2 = document.createElement("optgroup");
      og2.label = "The team";
      og2.appendChild(option("coaches", "By coach", coachView));
      sel.appendChild(og2);
      sel.addEventListener("change", function () { selectNode(sel.value); });
    }));

    if (grp && grp.children.length) {
      fv.picks.appendChild(step("Within " + grp.label, function (sel) {
        sel.appendChild(option(grp.key, "All " + grp.label, node.key === grp.key));
        grp.children.forEach(function (c) {
          sel.appendChild(option(c.key, c.label,
            (name && name.key === c.key) || (leaf && leaf.key === c.key)));
        });
        sel.addEventListener("change", function () { selectNode(sel.value); });
      }));
    }

    if (name && name.children.length) {
      fv.picks.appendChild(step("Which one", function (sel) {
        sel.appendChild(option(name.key, "All " + name.label, node.key === name.key));
        name.children.forEach(function (c) {
          sel.appendChild(option(c.key, c.label, leaf && leaf.key === c.key));
        });
        sel.addEventListener("change", function () { selectNode(sel.value); });
      }));
    }
  }

  function cash(v) { return money.format(v); }

  function statCell(label, value, cls) {
    var d = document.createElement("div");
    d.className = "fin-cell";
    var l = document.createElement("span");
    l.className = "label"; l.textContent = label;
    var s2 = document.createElement("span");
    s2.className = "value" + (cls ? " " + cls : "");
    s2.textContent = value;
    d.appendChild(l); d.appendChild(s2);
    return d;
  }

  function headCard(title, a, isTotal, overheads) {
    var c = document.createElement("div");
    c.className = "hcard" + (isTotal ? " is-total" : "");
    var h = document.createElement("h3"); h.textContent = title; c.appendChild(h);

    var other = fv.basis === "monthly" ? "weekly" : "monthly";
    var sessionProfit = a[fv.basis].profit;

    var big = document.createElement("div");
    var headline = overheads ? sessionProfit - overheads[fv.basis] : sessionProfit;
    big.className = "big " + (headline >= 0 ? "pos" : "neg");
    big.textContent = cash(headline);
    c.appendChild(big);

    var alt = document.createElement("div");
    alt.className = "alt";
    var otherHeadline = overheads
      ? a[other].profit - overheads[other] : a[other].profit;
    alt.textContent = (fv.basis === "monthly" ? "per month" : "per week") +
      " · " + cash(otherHeadline) +
      (other === "monthly" ? " per month" : " per week");
    c.appendChild(alt);
    if (overheads) {
      var caption = document.createElement("div");
      caption.className = "alt hcard-caption";
      caption.textContent = "net profit after overheads";
      c.appendChild(caption);
    }

    /* Deliberately separate from the big figure above, never blended into
       it: that one answers "what does this normally bring in", this one
       answers "what does this actually bring in, this real week" - term
       breaks and cancellations included. Always weekly, whichever basis
       is selected, since "this week" is not a monthly idea. */
    var thisWeekHeadline = overheads
      ? a.thisWeek.profit - overheads.weekly : a.thisWeek.profit;
    var thisWeekLine = document.createElement("div");
    thisWeekLine.className = "hcard-thisweek";
    thisWeekLine.appendChild(mk("span", null, "This week (actual)"));
    thisWeekLine.appendChild(mk("span",
      thisWeekHeadline >= 0 ? "pos" : "neg", cash(thisWeekHeadline)));
    c.appendChild(thisWeekLine);

    var rows = document.createElement("div");
    rows.className = "rows";
    var lines = [["Revenue (net)", a[fv.basis].net], ["Coach cost", a[fv.basis].coach],
                 ["Venue cost", a[fv.basis].venue]];
    if (overheads) {
      lines.push(["Session profit", sessionProfit]);
      lines.push(["Overheads", -overheads[fv.basis]]);
    }
    lines.forEach(function (r) {
      var d = document.createElement("div");
      var k = document.createElement("span"); k.textContent = r[0];
      var v = document.createElement("span"); v.textContent = cash(r[1]);
      d.appendChild(k); d.appendChild(v); rows.appendChild(d);
    });
    c.appendChild(rows);

    var oneOffs = overheads &&
      (fv.basis === "monthly" ? overheads.oneOffMonth : overheads.oneOffWeek);
    if (oneOffs && oneOffs.length) {
      var note = document.createElement("p");
      note.className = "hcard-oneoff";
      note.textContent = "Plus one-off this " + (fv.basis === "monthly" ? "month" : "week") +
        ": " + oneOffs.map(function (o) {
          return o.item + " (" + cash(o.amount) + ")";
        }).join(", ") + " — not included in the figure above.";
      c.appendChild(note);
    }

    return c;
  }

  function renderHeadCards() {
    fv.cards.innerHTML = "";
    var ev = state.sessions.filter(function (s) { return !isDay(s); });
    var dy = state.sessions.filter(isDay);
    fv.cards.appendChild(headCard("Evening programme", agg(ev), false));
    fv.cards.appendChild(headCard("Day programme", agg(dy), false));
    /* Overheads are a whole-business fact, not an Evening or Day one, so
       they only ever apply to the Combined card. */
    var overheads = state.overheads && state.overheads.length ? overheadTotals() : null;
    fv.cards.appendChild(headCard("Combined", agg(state.sessions), true, overheads));
  }

  function renderLevel(node) {
    fv.detail.innerHTML = "";
    var a = agg(node.sessions);
    var f = a[fv.basis];

    var panel = document.createElement("section");
    panel.className = "level";
    var h = document.createElement("h2"); h.textContent = node.label;
    panel.appendChild(h);

    var crumb = document.createElement("p");
    crumb.className = "crumb";
    crumb.textContent = node.sessions.length +
      (node.sessions.length === 1 ? " session" : " sessions") +
      (a.participants ? " · " + a.participants + " participants" : "") +
      " · figures " + (fv.basis === "monthly" ? "per month" : "per week");
    panel.appendChild(crumb);

    var grid = document.createElement("div");
    grid.className = "level-grid";
    grid.appendChild(statCell("Revenue (gross)", cash(f.gross)));
    grid.appendChild(statCell("Revenue (net)", cash(f.net)));
    grid.appendChild(statCell("Coach cost", cash(f.coach)));
    grid.appendChild(statCell("Venue cost", cash(f.venue)));
    grid.appendChild(statCell("Profit", cash(f.profit), f.profit >= 0 ? "pos" : "neg"));
    grid.appendChild(statCell("Margin",
      f.net ? (f.profit / f.net * 100).toFixed(1) + "%" : "—",
      f.profit >= 0 ? "pos" : "neg"));
    panel.appendChild(grid);

    if (a.missing) {
      var w = document.createElement("p");
      w.className = "fin-note";
      w.textContent = a.missing + " session" + (a.missing === 1 ? " has" : "s have") +
        " no row on the Financials tab and are left out of these totals.";
      panel.appendChild(w);
    }
    fv.detail.appendChild(panel);

    if (node.children.length) fv.detail.appendChild(breakdown(node));
  }

  function breakdown(node) {
    var wrap = document.createElement("div");
    wrap.className = "level";
    var h = document.createElement("h2");
    h.textContent = "What's inside";
    h.style.fontSize = "1.05rem";
    wrap.appendChild(h);

    var rows = node.children.map(function (c) {
      return { node: c, a: agg(c.sessions) };
    });
    var peak = Math.max.apply(null, rows.map(function (r) {
      return Math.abs(r.a[fv.basis].profit);
    }).concat([1]));

    var scroll = document.createElement("div");
    scroll.className = "bd-wrap";
    var t = document.createElement("table");
    t.className = "bd";
    t.innerHTML = "<thead><tr><th>Name</th><th>Kids</th><th>Revenue</th>" +
      "<th>Coach</th><th>Venue</th><th>Profit</th><th>Margin</th></tr></thead>";
    var tb = document.createElement("tbody");

    rows.forEach(function (r) {
      var f = r.a[fv.basis];
      var tr = document.createElement("tr");
      if (r.node.children.length || r.node.session) tr.className = "is-link";

      var td = document.createElement("td");
      td.className = "name";
      td.textContent = r.node.label;
      // Under a session name the row is already labelled by day and time;
      // repeating it underneath just adds noise.
      if (r.node.session) {
        var when = r.node.session.day + " · " + r.node.session.time;
        if (r.node.label !== r.node.session.day + " " + r.node.session.time) {
          var sub = document.createElement("span");
          sub.className = "sub";
          sub.textContent = when;
          td.appendChild(sub);
        }
      }
      var bar = document.createElement("span");
      bar.className = "bar" + (f.profit < 0 ? " neg" : "");
      bar.style.width = Math.max(2, Math.abs(f.profit) / peak * 100) + "%";
      td.appendChild(bar);
      tr.appendChild(td);

      // Per-coach-hour schools have no participants; 0 would read as "empty".
      var kids = r.a.participants ? String(r.a.participants)
               : (r.a.counted ? "n/a" : "—");
      [kids, cash(f.net), cash(f.coach), cash(f.venue)].forEach(function (v) {
        var c = document.createElement("td"); c.textContent = v; tr.appendChild(c);
      });
      var pc = document.createElement("td");
      pc.textContent = cash(f.profit);
      pc.className = f.profit >= 0 ? "pos" : "neg";
      pc.style.fontWeight = "600";
      tr.appendChild(pc);
      var mc = document.createElement("td");
      mc.textContent = f.net ? (f.profit / f.net * 100).toFixed(0) + "%" : "—";
      tr.appendChild(mc);

      tr.addEventListener("click", function () { selectNode(r.node.key); });
      tb.appendChild(tr);
    });
    t.appendChild(tb);
    scroll.appendChild(t);
    wrap.appendChild(scroll);
    return wrap;
  }


  /* -------------------------- period totals -------------------------- *
   * Any date range, split honestly into two parts that are never blended:
   *
   *   Actual    - weeks strictly before this real week, summed straight
   *               from the permanent archive. Locked - nothing changes
   *               these once they are written, whatever gets edited later.
   *   Scheduled - this week and any future week in the range, worked out
   *               fresh from today's Financials figures via
   *               weekEstimate() (the exact same calculation the head
   *               cards' "This week (actual)" uses) - an honest estimate,
   *               not a promise, since it uses whatever is true today.
   *
   * "This week" (not yet finished) always falls on the Scheduled side,
   * never Actual - it is not archived until next Monday, so treating it
   * as locked would be pretending a week is over before it is. */

  /** Every Monday from `fromIso` to `toIso` inclusive, as ISO strings. */
  function mondaysBetween(fromIso, toIso) {
    var out = [];
    var d = mondayOf(parseDay(fromIso));
    var end = mondayOf(parseDay(toIso));
    while (d <= end) {
      out.push(isoDay(d));
      d = new Date(d.getTime());
      d.setDate(d.getDate() + 7);
    }
    return out;
  }

  function periodTotals(fromIso, toIso) {
    var out = {
      actual:    { gross:0, net:0, coach:0, venue:0, profit:0 },
      scheduled: { gross:0, net:0, coach:0, venue:0, profit:0 },
      actualWeeks: 0, scheduledWeeks: 0
    };
    var fromMonday = isoDay(mondayOf(parseDay(fromIso)));
    var toMonday = isoDay(mondayOf(parseDay(toIso)));
    var todayMonday = isoDay(mondayOf(new Date()));
    if (fromMonday > toMonday) return out;

    var archivedWeeks = {};
    (state.archive || []).forEach(function (r) {
      if (r.week < fromMonday || r.week > toMonday || r.week >= todayMonday) return;
      archivedWeeks[r.week] = true;
      out.actual.gross += r.gross; out.actual.net += r.net;
      out.actual.coach += r.coach; out.actual.venue += r.venue;
    });
    out.actual.profit = out.actual.net - out.actual.coach - out.actual.venue;
    out.actualWeeks = Object.keys(archivedWeeks).length;

    var scheduledFrom = fromMonday > todayMonday ? fromMonday : todayMonday;
    if (scheduledFrom <= toMonday) {
      mondaysBetween(scheduledFrom, toMonday).forEach(function (iso) {
        var w = weekEstimate(state.sessions, iso);
        out.scheduled.gross += w.gross; out.scheduled.net += w.net;
        out.scheduled.coach += w.coach; out.scheduled.venue += w.venue;
        out.scheduledWeeks++;
      });
    }
    out.scheduled.profit = out.scheduled.net - out.scheduled.coach - out.scheduled.venue;

    return out;
  }

  function renderPeriodPanel() {
    var box = fv.periodControls;
    box.innerHTML = "";

    var line = document.createElement("div");
    line.className = "filter-line";

    var fromInput = document.createElement("input");
    fromInput.type = "date";
    fromInput.value = fv.period.from;
    fromInput.setAttribute("aria-label", "From date");
    fromInput.addEventListener("change", function () {
      fv.period.from = fromInput.value;
      renderPeriodResult();
    });
    line.appendChild(fromInput);

    var toLabel = document.createElement("span");
    toLabel.className = "filter-to";
    toLabel.textContent = "to";
    line.appendChild(toLabel);

    var toInput = document.createElement("input");
    toInput.type = "date";
    toInput.value = fv.period.to;
    toInput.setAttribute("aria-label", "To date");
    toInput.addEventListener("change", function () {
      fv.period.to = toInput.value;
      renderPeriodResult();
    });
    line.appendChild(toInput);

    if (fv.period.from || fv.period.to) {
      var clear = document.createElement("button");
      clear.type = "button";
      clear.className = "btn btn-quiet filter-clear";
      clear.textContent = "Clear";
      clear.addEventListener("click", function () {
        fv.period = { from: "", to: "" };
        renderPeriodPanel();
      });
      line.appendChild(clear);
    }
    box.appendChild(line);

    renderPeriodResult();
  }

  function renderPeriodResult() {
    var out = fv.periodResult;
    out.innerHTML = "";

    if (!fv.period.from || !fv.period.to) {
      var hint = document.createElement("p");
      hint.className = "fin-note";
      hint.textContent = "Pick a from and to date for what actually came in over that " +
        "period, plus an honest estimate of what's still to come within it.";
      out.appendChild(hint);
      return;
    }
    if (fv.period.from > fv.period.to) {
      var bad = document.createElement("p");
      bad.className = "fin-note";
      bad.textContent = "The “from” date is after the “to” date.";
      out.appendChild(bad);
      return;
    }
    if (!state.archive) {
      var noArchive = document.createElement("p");
      noArchive.className = "fin-note";
      noArchive.textContent = "No P&L archive is set up yet, so there's nothing " +
        "locked in for “Actual” - once it's running, real weeks will show here.";
      out.appendChild(noArchive);
      return;
    }

    var t = periodTotals(fv.period.from, fv.period.to);
    var total = {
      net: t.actual.net + t.scheduled.net,
      profit: t.actual.profit + t.scheduled.profit
    };

    var grid = document.createElement("div");
    grid.className = "level-grid";
    grid.appendChild(statCell(
      "Actual (" + t.actualWeeks + (t.actualWeeks === 1 ? " week" : " weeks") + ")",
      cash(t.actual.profit), t.actual.profit >= 0 ? "pos" : "neg"));
    grid.appendChild(statCell(
      "Scheduled (" + t.scheduledWeeks + (t.scheduledWeeks === 1 ? " week" : " weeks") + ")",
      cash(t.scheduled.profit), t.scheduled.profit >= 0 ? "pos" : "neg"));
    grid.appendChild(statCell("Total profit", cash(total.profit), total.profit >= 0 ? "pos" : "neg"));
    grid.appendChild(statCell("Total revenue (net)", cash(total.net)));
    out.appendChild(grid);

    if (t.scheduledWeeks) {
      var note = document.createElement("p");
      note.className = "fin-note";
      note.textContent = "“Scheduled” uses today's Financials figures for " +
        t.scheduledWeeks + " week" + (t.scheduledWeeks === 1 ? "" : "s") +
        " not yet archived - an honest estimate, not locked in until each week " +
        "actually happens.";
      out.appendChild(note);
    }
  }

  /* ------------------------- custom filter ------------------------- *
   * David's own example: "Monday sessions hosted at the venue Freemen's"
   * is not the same question as "coaching done at the school Freemen's" -
   * the venue-hire evening club and the school coaching contract are two
   * different pieces of business that happen to share a car park (see the
   * comment on canonicalVenue). So this reads the raw s.venue the Sessions
   * tab actually has, never the Venues-page alias, and combines freely with
   * a day of the week and/or a time window - "afterschool clubs 3-4:30pm"
   * is the same tool, just filtering by time instead of by venue. */

  function timeToMinutes(hhmm) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || "");
    return m ? (+m[1]) * 60 + (+m[2]) : null;
  }

  function filterActive() {
    return Object.keys(fv.filter.days).some(function (d) { return fv.filter.days[d]; }) ||
      !!fv.filter.venue || !!fv.filter.from || !!fv.filter.to;
  }

  function filteredSessions() {
    var days = Object.keys(fv.filter.days).filter(function (d) { return fv.filter.days[d]; });
    var venue = fv.filter.venue;
    var from = timeToMinutes(fv.filter.from);
    var to = timeToMinutes(fv.filter.to);
    return state.sessions.filter(function (s) {
      if (days.length && days.indexOf(s.day) === -1) return false;
      if (venue && venueKey(s.venue) !== venueKey(venue)) return false;
      if (from != null || to != null) {
        var st = s.startMin;
        if (st == null) return false;
        var en = endMinutes(s.time);
        if (en == null) en = st;
        if (from != null && en < from) return false;
        if (to != null && st > to) return false;
      }
      return true;
    });
  }

  /** Every raw venue string on the schedule, unfolded — not canonicalVenue,
      on purpose: this is the tool for telling the two Freemen's apart. */
  function rawVenues() {
    var seen = {}, out = [];
    state.sessions.forEach(function (s) {
      var v = s.venue || "";
      if (!v || seen[venueKey(v)]) return;
      seen[venueKey(v)] = true;
      out.push(v);
    });
    return out.sort(function (a, b) { return a.localeCompare(b, "en-GB"); });
  }

  function renderFilterPanel() {
    var box = fv.filterControls;
    box.innerHTML = "";

    var dayRow = document.createElement("div");
    dayRow.className = "filter-days";
    DAY_ORDER.forEach(function (d) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "day-btn" + (fv.filter.days[d] ? " is-on" : "");
      b.setAttribute("aria-pressed", fv.filter.days[d] ? "true" : "false");
      b.textContent = d.slice(0, 3);
      b.addEventListener("click", function () {
        fv.filter.days[d] = !fv.filter.days[d];
        renderFilterPanel();
      });
      dayRow.appendChild(b);
    });
    box.appendChild(dayRow);

    var line = document.createElement("div");
    line.className = "filter-line";

    var venueSel = document.createElement("select");
    venueSel.className = "fin-select";
    venueSel.setAttribute("aria-label", "Venue");
    venueSel.appendChild(option("", "Any venue", !fv.filter.venue));
    rawVenues().forEach(function (v) {
      venueSel.appendChild(option(v, v, fv.filter.venue === v));
    });
    venueSel.addEventListener("change", function () {
      fv.filter.venue = venueSel.value;
      renderFilterResult();
    });
    line.appendChild(venueSel);

    var fromInput = document.createElement("input");
    fromInput.type = "time";
    fromInput.value = fv.filter.from;
    fromInput.setAttribute("aria-label", "From time");
    fromInput.addEventListener("change", function () {
      fv.filter.from = fromInput.value;
      renderFilterResult();
    });
    line.appendChild(fromInput);

    var toLabel = document.createElement("span");
    toLabel.className = "filter-to";
    toLabel.textContent = "to";
    line.appendChild(toLabel);

    var toInput = document.createElement("input");
    toInput.type = "time";
    toInput.value = fv.filter.to;
    toInput.setAttribute("aria-label", "To time");
    toInput.addEventListener("change", function () {
      fv.filter.to = toInput.value;
      renderFilterResult();
    });
    line.appendChild(toInput);

    if (filterActive()) {
      var clear = document.createElement("button");
      clear.type = "button";
      clear.className = "btn btn-quiet filter-clear";
      clear.textContent = "Clear filter";
      clear.addEventListener("click", function () {
        fv.filter = { days: {}, venue: "", from: "", to: "" };
        renderFilterPanel();
      });
      line.appendChild(clear);
    }
    box.appendChild(line);

    renderFilterResult();
  }

  function renderFilterResult() {
    var out = fv.filterResult;
    out.innerHTML = "";

    if (!filterActive()) {
      var hint = document.createElement("p");
      hint.className = "fin-note";
      hint.textContent = "Choose a day, venue or time window above for a custom total.";
      out.appendChild(hint);
      return;
    }

    var list = filteredSessions();
    var a = agg(list);
    var f = a[fv.basis];

    var panel = document.createElement("div");
    var crumb = document.createElement("p");
    crumb.className = "crumb";
    crumb.style.margin = "0 0 14px";
    crumb.textContent = list.length + (list.length === 1 ? " session" : " sessions") +
      (a.participants ? " · " + a.participants + " participants" : "") +
      " · figures " + (fv.basis === "monthly" ? "per month" : "per week");
    panel.appendChild(crumb);

    if (!list.length) {
      var none = document.createElement("p");
      none.className = "fin-note";
      none.textContent = "No sessions match that filter.";
      panel.appendChild(none);
      out.appendChild(panel);
      return;
    }

    var grid = document.createElement("div");
    grid.className = "level-grid";
    grid.appendChild(statCell("Revenue (net)", cash(f.net)));
    grid.appendChild(statCell("Coach cost", cash(f.coach)));
    grid.appendChild(statCell("Venue cost", cash(f.venue)));
    grid.appendChild(statCell("Profit", cash(f.profit), f.profit >= 0 ? "pos" : "neg"));
    panel.appendChild(grid);
    if (a.missing) {
      var w = document.createElement("p");
      w.className = "fin-note";
      w.textContent = a.missing + " session" + (a.missing === 1 ? " has" : "s have") +
        " no row on the Financials tab and are left out of these totals.";
      panel.appendChild(w);
    }
    out.appendChild(panel);

    var scroll = document.createElement("div");
    scroll.className = "bd-wrap";
    var t = document.createElement("table");
    t.className = "bd";
    t.innerHTML = "<thead><tr><th>Session</th><th>Day</th><th>Venue</th>" +
      "<th>Revenue</th><th>Profit</th></tr></thead>";
    var tb = document.createElement("tbody");

    list.slice().sort(function (x, y) {
      var dx = DAY_ORDER.indexOf(x.day), dy = DAY_ORDER.indexOf(y.day);
      if (dx !== dy) return dx - dy;
      return (x.startMin || 0) - (y.startMin || 0);
    }).forEach(function (s) {
      var fin = state.financials && state.financials[s.id];
      var tr = document.createElement("tr");

      var name = document.createElement("td");
      name.className = "name";
      name.textContent = s.name;
      var sub = document.createElement("span");
      sub.className = "sub";
      sub.textContent = s.time || "Time TBC";
      name.appendChild(sub);
      tr.appendChild(name);

      [s.day, s.venue || "—"].forEach(function (v) {
        var td = document.createElement("td");
        td.style.textAlign = "left";
        td.textContent = v;
        tr.appendChild(td);
      });

      var netCell = document.createElement("td");
      var profitCell = document.createElement("td");
      if (fin) {
        var per = String(fin.period || "").toLowerCase();
        var to = fv.basis === "monthly" ? (per === "weekly" ? WEEKS : 1)
                                        : (per === "monthly" ? 1 / WEEKS : 1);
        netCell.textContent = cash((num(fin.revenue_net) || 0) * to);
        var profit = (num(fin.profit) || 0) * to;
        profitCell.textContent = cash(profit);
        profitCell.className = profit >= 0 ? "pos" : "neg";
      } else {
        netCell.textContent = "—";
        profitCell.textContent = "—";
      }
      tr.appendChild(netCell);
      tr.appendChild(profitCell);
      tb.appendChild(tr);
    });
    t.appendChild(tb);
    scroll.appendChild(t);
    out.appendChild(scroll);
  }

  /* ---------------------------- by coach ---------------------------- */

  /** A coach's hourly rate, evening or day, from the Coaches tab. */
  function rateFor(name, evening) {
    var row = state.rates[nameKey(name)];
    if (!row) return 0;
    var r = num(evening ? row.hourly_rate : (row.day_rate || row.hourly_rate));
    return r === null ? 0 : r;
  }

  /**
   * Split each session's coach cost between the people on it, in proportion
   * to what they are paid. Hours divide by the groups sharing the slot, so a
   * coach covering four classes in one hour is credited with one hour.
   */
  function coachRows() {
    var m = {};
    coachRows.noHours = 0;
    function slot(n) {
      if (!m[n]) m[n] = { name: n, hoursWk: 0, sessions: 0,
        monthly: { evening: 0, day: 0, total: 0 },
        weekly:  { evening: 0, day: 0, total: 0 } };
      return m[n];
    }
    state.sessions.forEach(function (s) {
      var f = state.financials && state.financials[s.id];
      if (!f) return;
      var ev = !isDay(s);
      var cost = num(f.coach_cost) || 0;
      var per = String(f.period || "").toLowerCase();
      var toM = per === "weekly" ? WEEKS : 1;
      var toW = per === "monthly" ? 1 / WEEKS : 1;
      var groups = num(f.coach_groups) || 1;
      var raw = num(f.hours);
      if (raw === null || raw === 0) coachRows.noHours++;
      var hrs = Math.max(raw || 0, 1) / (groups || 1);

      var rates = s.coaches.map(function (c) { return rateFor(c, ev); });
      var tot = rates.reduce(function (a, b) { return a + b; }, 0);

      s.coaches.forEach(function (c, i) {
        var share = tot > 0 ? rates[i] / tot : 1 / s.coaches.length;
        var r = slot(c);
        r.sessions++;
        r.hoursWk += hrs;
        r.monthly.total += cost * share * toM;
        r.weekly.total  += cost * share * toW;
        r.monthly[ev ? "evening" : "day"] += cost * share * toM;
        r.weekly[ev ? "evening" : "day"]  += cost * share * toW;
      });
    });
    return Object.keys(m).map(function (k) { return m[k]; })
      .sort(function (a, b) { return b.monthly.total - a.monthly.total; });
  }

  function renderCoaches() {
    fv.detail.innerHTML = "";
    var rows = coachRows();
    var basis = fv.basis;
    var grand = rows.reduce(function (a, r) { return a + r[basis].total; }, 0);
    var hours = rows.reduce(function (a, r) { return a + r.hoursWk; }, 0);

    var panel = document.createElement("section");
    panel.className = "level";
    var h = document.createElement("h2"); h.textContent = "Coach costs";
    panel.appendChild(h);
    var crumb = document.createElement("p");
    crumb.className = "crumb";
    crumb.textContent = rows.length + " coaches \u00b7 figures " +
      (basis === "monthly" ? "per month" : "per week");
    panel.appendChild(crumb);

    var grid = document.createElement("div");
    grid.className = "level-grid";
    grid.appendChild(statCell("Total coach cost", cash(grand)));
    grid.appendChild(statCell("Hours a week", hours.toFixed(2)));
    grid.appendChild(statCell("Average rate",
      hours ? cash(grand / (basis === "monthly" ? hours * WEEKS : hours)) + "/hr" : "\u2014"));
    grid.appendChild(statCell("Coaches", String(rows.length)));
    panel.appendChild(grid);
    if (coachRows.noHours) {
      var warn = document.createElement("p");
      warn.className = "fin-note";
      warn.textContent = coachRows.noHours + " session" +
        (coachRows.noHours === 1 ? " has" : "s have") + " no hours on the " +
        "Financials tab, so they are counted as one hour each and these " +
        "totals are low.";
      panel.appendChild(warn);
    }
    fv.detail.appendChild(panel);

    var wrap = document.createElement("div");
    wrap.className = "level";
    var h2 = document.createElement("h2");
    h2.textContent = "Where it goes";
    h2.style.fontSize = "1.05rem";
    wrap.appendChild(h2);

    var scroll = document.createElement("div");
    scroll.className = "bd-wrap";
    var t = document.createElement("table");
    t.className = "bd";
    t.innerHTML = "<thead><tr><th>Coach</th><th>Hrs/wk</th><th>Sessions</th>" +
      "<th>Evening</th><th>Day</th><th>Total</th><th>Share</th></tr></thead>";
    var tb = document.createElement("tbody");
    var peak = Math.max.apply(null, rows.map(function (r) { return r[basis].total; }).concat([1]));

    rows.forEach(function (r) {
      var tr = document.createElement("tr");
      tr.className = "is-link";
      var td = document.createElement("td");
      td.className = "name";
      td.textContent = r.name;
      var sub = document.createElement("span");
      sub.className = "sub";
      var row = state.rates[nameKey(r.name)];
      sub.textContent = row
        ? cash(num(row.hourly_rate) || 0) + "/hr evening \u00b7 " +
          cash(num(row.day_rate || row.hourly_rate) || 0) + "/hr day"
        : "no rate on the Coaches tab";
      td.appendChild(sub);
      var bar = document.createElement("span");
      bar.className = "bar";
      bar.style.width = Math.max(2, r[basis].total / peak * 100) + "%";
      td.appendChild(bar);
      tr.appendChild(td);

      [r.hoursWk.toFixed(2), String(r.sessions),
       cash(r[basis].evening), cash(r[basis].day)].forEach(function (v) {
        var c = document.createElement("td"); c.textContent = v; tr.appendChild(c);
      });
      var tc = document.createElement("td");
      tc.textContent = cash(r[basis].total);
      tc.style.fontWeight = "600";
      tr.appendChild(tc);
      var sc = document.createElement("td");
      sc.textContent = grand ? (r[basis].total / grand * 100).toFixed(1) + "%" : "\u2014";
      tr.appendChild(sc);

      tr.addEventListener("click", function () { selectNode("c:" + r.name); });
      tb.appendChild(tr);
    });
    t.appendChild(tb);
    scroll.appendChild(t);
    wrap.appendChild(scroll);
    fv.detail.appendChild(wrap);
  }

  /** One coach: their cost, and the sessions it comes from. */
  function renderCoachDetail(name) {
    fv.detail.innerHTML = "";
    var me = coachRows().filter(function (r) { return nameKey(r.name) === nameKey(name); })[0];
    if (!me) { selectNode("coaches"); return; }
    var basis = fv.basis;

    var panel = document.createElement("section");
    panel.className = "level";
    var h = document.createElement("h2"); h.textContent = me.name;
    panel.appendChild(h);
    var crumb = document.createElement("p");
    crumb.className = "crumb";
    crumb.textContent = me.sessions + " sessions \u00b7 " + me.hoursWk.toFixed(2) +
      " hours a week \u00b7 figures " + (basis === "monthly" ? "per month" : "per week");
    panel.appendChild(crumb);

    var grid = document.createElement("div");
    grid.className = "level-grid";
    grid.appendChild(statCell("Evening cost", cash(me[basis].evening)));
    grid.appendChild(statCell("Day cost", cash(me[basis].day)));
    grid.appendChild(statCell("Total cost", cash(me[basis].total)));
    var row = state.rates[nameKey(me.name)];
    grid.appendChild(statCell("Evening rate", row ? cash(num(row.hourly_rate) || 0) : "\u2014"));
    grid.appendChild(statCell("Day rate",
      row ? cash(num(row.day_rate || row.hourly_rate) || 0) : "\u2014"));
    panel.appendChild(grid);
    fv.detail.appendChild(panel);

    // Which sessions that time goes into, and whether those sessions earn.
    var mine = state.sessions.filter(function (s) {
      return s.coaches.some(function (c) { return nameKey(c) === nameKey(me.name); });
    });
    var wrap = document.createElement("div");
    wrap.className = "level";
    var h2 = document.createElement("h2");
    h2.textContent = "Sessions " + me.name + " is on";
    h2.style.fontSize = "1.05rem";
    wrap.appendChild(h2);

    var scroll = document.createElement("div");
    scroll.className = "bd-wrap";
    var t = document.createElement("table");
    t.className = "bd";
    t.innerHTML = "<thead><tr><th>Session</th><th>Day</th>" +
      "<th>" + me.name + "'s cost</th><th>Session profit</th></tr></thead>";
    var tb = document.createElement("tbody");

    mine.map(function (s) {
      var f = state.financials[s.id] || {};
      var ev = !isDay(s);
      var per = String(f.period || "").toLowerCase();
      var to = basis === "monthly" ? (per === "weekly" ? WEEKS : 1)
                                   : (per === "monthly" ? 1 / WEEKS : 1);
      var rates = s.coaches.map(function (c) { return rateFor(c, ev); });
      var tot = rates.reduce(function (a, b) { return a + b; }, 0);
      var i = 0;
      s.coaches.forEach(function (c, k) { if (nameKey(c) === nameKey(me.name)) i = k; });
      var share = tot > 0 ? rates[i] / tot : 1 / s.coaches.length;
      return { s: s, cost: (num(f.coach_cost) || 0) * share * to,
               profit: (num(f.profit) || 0) * to };
    }).sort(function (a, b) { return b.cost - a.cost; }).forEach(function (r) {
      var tr = document.createElement("tr");
      var td = document.createElement("td");
      td.className = "name"; td.textContent = r.s.name;
      tr.appendChild(td);
      var dd = document.createElement("td");
      dd.textContent = r.s.day + " " + r.s.time;
      dd.style.textAlign = "left";
      tr.appendChild(dd);
      var cc = document.createElement("td");
      cc.textContent = cash(r.cost); cc.style.fontWeight = "600";
      tr.appendChild(cc);
      var pc = document.createElement("td");
      pc.textContent = cash(r.profit);
      pc.className = r.profit >= 0 ? "pos" : "neg";
      tr.appendChild(pc);
      tb.appendChild(tr);
    });
    t.appendChild(tb);
    scroll.appendChild(t);
    wrap.appendChild(scroll);
    fv.detail.appendChild(wrap);
  }

  function selectNode(key) {
    if (key === "coaches" || key.indexOf("c:") === 0) {
      fv.node = { key: key, label: "By coach", coachView: true };
      renderPickers(fv.node);
      renderHeadCards();
      if (key === "coaches") renderCoaches();
      else renderCoachDetail(key.slice(2));
      return;
    }
    var node = fv.nodes[key] || fv.nodes.all;
    fv.node = node;
    renderPickers(node);
    renderHeadCards();
    renderLevel(node);
  }

  function renderFinView() {
    buildTree();
    renderPeriodPanel();
    renderFilterPanel();
    selectNode(fv.node && (fv.node.coachView || fv.nodes[fv.node.key])
                 ? fv.node.key : "all");
  }

  Array.prototype.forEach.call(document.querySelectorAll(".seg-btn"), function (b) {
    b.addEventListener("click", function () {
      fv.basis = b.getAttribute("data-basis");
      Array.prototype.forEach.call(document.querySelectorAll(".seg-btn"), function (o) {
        o.classList.toggle("is-on", o === b);
      });
      if (fv.node) selectNode(fv.node.key);
      renderFilterResult();
    });
  });

  /* ====================================================================== *
   * Hub - home, venues, handbook
   * ====================================================================== */

  function mk(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function hasTab(url) { return !!url && !looksUnset(url); }

  function slugify(s) {
    return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "section";
  }

  /** One quiet line, so sample wording is never mistaken for the real thing. */
  function demoNote(parent, what) {
    if (!CFG.demoContent) return;
    parent.appendChild(mk("p", "demo-note",
      "Sample " + what + ", here so the layout can be judged. The real words " +
      "will come from the sheet."));
  }

  /* ------------------------------- home ------------------------------- */

  var ICONS = {
    schedule: '<rect x="2.5" y="4" width="15" height="13.5" rx="2.5"/><path d="M2.5 8.5h15M6.5 2.5v3M13.5 2.5v3"/>',
    venues:   '<path d="M10 17.5s6-5.1 6-9.2a6 6 0 10-12 0c0 4.1 6 9.2 6 9.2z"/><circle cx="10" cy="8.2" r="2.2"/>',
    handbook: '<path d="M4 3.5h8.5a2.5 2.5 0 012.5 2.5v10.5H6.5A2.5 2.5 0 014 14z"/><path d="M4 14a2.5 2.5 0 012.5-2.5H15"/>',
    resources: '<rect x="2.5" y="4" width="15" height="12" rx="2.5"/><path d="M2.5 12.5l4-3.5 3.5 3 3-2.5 4 3.5"/><circle cx="7" cy="7.5" r="1.2"/>',
    financials: '<path d="M6 8.5V6a4 4 0 018 0v2.5"/><rect x="3.8" y="8.5" width="12.4" height="8" rx="2"/>'
  };

  var TILES = [
    { view: "schedule", title: "Schedule",
      blurb: "Find any coach and see every session they run this week." },
    { view: "venues", title: "Venues",
      blurb: "Addresses, directions and what to expect when you get there." },
    { view: "handbook", title: "Handbook",
      blurb: "Kit, absence, who to call — the things worth knowing.",
      needs: function () { return hasTab(CFG.infoCsvUrl); } },
    { view: "resources", title: "Resources",
      blurb: "Term plans, session themes and anything else worth having on your phone.",
      needs: function () { return hasTab(CFG.resourcesCsvUrl); } },
    { view: "financials", title: "Financials", owner: true,
      blurb: "Revenue, cost and profit by programme, session and coach. Password needed." }
  ];

  function firstName(n) { return String(n || "").trim().split(/\s+/)[0]; }

  /** Hours a coach is down for, split where a session runs several groups. */
  function myHours(coach) {
    var total = 0;
    coach.sessions.forEach(function (s) {
      var f = state.financials && state.financials[s.id];
      var raw = f ? num(f.hours) : null;
      var groups = f ? (num(f.coach_groups) || 1) : 1;
      total += Math.max(raw || 0, 1) / (groups || 1);
    });
    return total;
  }

  function renderHome() {
    var me = state.me;
    var days = {}, stats;

    if (me) {
      /* Their week, not the business's week. */
      var mine = me.coach.sessions;
      mine.forEach(function (s) { if (s.day) days[s.day] = 1; });
      var venues = {};
      mine.forEach(function (s) { venues[venueKey(canonicalVenue(s.venue))] = 1; });
      stats = [
        [mine.length, mine.length === 1 ? "session a week" : "sessions a week"],
        [Object.keys(days).length, Object.keys(days).length === 1 ? "day a week" : "days a week"],
        [Object.keys(venues).length, Object.keys(venues).length === 1 ? "venue" : "venues"]
      ];
      hub.title.textContent = "Hello, " + firstName(me.name);
      hub.blurb.textContent = me.owner
        ? "Everything the coaching team needs, in one place. You can see the whole team."
        : "Your week, where you are coaching it, and everything else worth having to hand.";
    } else {
      /* A hub that opens on an empty menu feels dead, so show the week's shape. */
      state.sessions.forEach(function (s) { if (s.day) days[s.day] = 1; });
      stats = [
        [state.sessions.length, state.sessions.length === 1 ? "session a week" : "sessions a week"],
        [state.coaches.length, "coaches"],
        [venueGroups().length, "venues"],
        [Object.keys(days).length, "days a week"]
      ];
      hub.title.textContent = "Josh Evans Soccer School";
      hub.blurb.textContent = "Everything the coaching team needs, in one place. " +
        "The schedule comes straight from the office spreadsheet, so what you see here is what is booked.";
    }

    hub.stats.innerHTML = "";
    stats.forEach(function (row) {
      var d = mk("div", "hero-stat");
      d.appendChild(mk("strong", null, String(row[0])));
      d.appendChild(mk("span", null, row[1]));
      hub.stats.appendChild(d);
    });

    hub.tiles.innerHTML = "";
    TILES.forEach(function (t) {
      if (t.needs && !t.needs()) return;
      if (t.owner && isMine()) return;   // not their part of the hub
      var b = mk("button", "tile" + (t.owner ? " tile-owner" : ""));
      b.type = "button";
      b.setAttribute("data-view", t.view);
      var icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      icon.setAttribute("viewBox", "0 0 20 20");
      icon.setAttribute("class", "tile-icon");
      icon.setAttribute("aria-hidden", "true");
      icon.innerHTML = ICONS[t.view];
      b.appendChild(icon);
      b.appendChild(mk("h3", null, t.view === "schedule" && state.me ? "My week" : t.title));
      b.appendChild(mk("p", null,
        t.view === "schedule" && isMine()
          ? "Every session you are down for this week, and where."
          : t.blurb));
      if (t.owner) b.appendChild(mk("span", "tile-flag", "Owners"));
      hub.tiles.appendChild(b);
    });

    renderSignIn();
  }

  /* --------------------------- the code box --------------------------- */

  function renderSignIn() {
    hub.signin.innerHTML = "";

    if (state.me) {
      var who = mk("p", "whoami");
      who.appendChild(document.createTextNode("Signed in as "));
      who.appendChild(mk("strong", null, state.me.name));
      who.appendChild(document.createTextNode(
        state.me.owner ? " — you can see the whole team. " : ". "));
      var out = mk("button", "linkish", "Not you?");
      out.type = "button";
      out.addEventListener("click", forgetCode);
      who.appendChild(out);
      hub.signin.appendChild(who);
      return;
    }

    var box = mk("div", "signin");
    box.appendChild(mk("h3", null, "Got a code?"));
    box.appendChild(mk("p", null,
      "Put in the code you were sent and the hub opens on your week instead " +
      "of the whole team's. It only has to be done once on this phone."));

    var form = mk("form", "signin-form");
    var input = mk("input", "signin-input");
    input.type = "text";
    input.placeholder = "Your code";
    input.autocomplete = "off";
    input.setAttribute("aria-label", "Your code");
    input.spellcheck = false;
    var go = mk("button", "btn btn-primary", "Open my week");
    go.type = "submit";
    form.appendChild(input);
    form.appendChild(go);

    var err = mk("p", "pw-error", "That code was not recognised.");
    err.hidden = !hub.badCode;

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var who = lookUpCode(input.value);
      if (!who) { err.hidden = false; input.select(); return; }
      rememberCode(input.value.trim().toUpperCase());
      state.me = who;
      state.selected = who.owner ? state.selected : who.coach;
      hub.badCode = false;
      applyIdentity();
      setView("schedule");
    });

    box.appendChild(form);
    box.appendChild(err);
    hub.signin.appendChild(box);
  }

  /* ------------------------------ venues ------------------------------ */

  function venueKey(v) { return String(v || "").toLowerCase().replace(/\s+/g, " ").trim(); }

  /** Every venue named in the schedule, with the sessions that run there. */
  /**
   * One place can appear under more than one name on the schedule - a school
   * we coach for and the same school's pitches we hire in the evening are two
   * different pieces of business, so they are two different strings, and the
   * financial formulas depend on them staying that way. Here a venue is only
   * somewhere to drive to, so the aliases fold them into one card.
   *
   * Nothing is renamed: s.venue keeps exactly what the sheet says.
   */
  function canonicalVenue(name) {
    var aliases = hub.venueAliases;
    return (aliases && aliases[venueKey(name)]) || name;
  }

  function venueGroups() {
    var by = Object.create(null);
    state.sessions.forEach(function (s) {
      var name = canonicalVenue(s.venue || "Venue not set");
      var k = venueKey(name);
      if (!by[k]) by[k] = { name: name, address: "", sessions: [] };
      if (!by[k].address && s.address) by[k].address = s.address;
      by[k].sessions.push(s);
    });
    return Object.keys(by).map(function (k) { return by[k]; })
      .sort(function (a, b) { return a.name.localeCompare(b.name, "en-GB"); });
  }

  /** Aliases named in config.js, for before any tab is published. */
  function seedVenueAliases() {
    var map = Object.create(null);
    Object.keys(CFG.venueAliases || {}).forEach(function (from) {
      map[venueKey(from)] = CFG.venueAliases[from];
    });
    return map;
  }

  /**
   * The Venue info tab, if one is published. Extra detail, never required.
   * Its `also_known_as` column is comma-separated, the same as `coaches` on
   * the Sessions tab, and merges on top of anything in config.js.
   */
  function ensureVenueInfo() {
    if (hub.venueInfo) return Promise.resolve();
    if (!hasTab(CFG.venueInfoCsvUrl)) {
      hub.venueInfo = Object.create(null);
      hub.venueAliases = seedVenueAliases();
      return Promise.resolve();
    }
    return fetchCsv(CFG.venueInfoCsvUrl, "Venue info").then(function (rows) {
      var map = Object.create(null);
      var aliases = seedVenueAliases();
      toObjects(rows, ["venue"], "Venue info").forEach(function (r) {
        var name = String(r.venue || "").trim();
        if (!name) return;
        map[venueKey(name)] = r;
        String(r.also_known_as || "").split(",").forEach(function (other) {
          var o = other.trim();
          if (o && venueKey(o) !== venueKey(name)) aliases[venueKey(o)] = name;
        });
      });
      hub.venueInfo = map;
      hub.venueAliases = aliases;
    }).catch(function (e) {
      console.warn("Venue detail could not be loaded:", e);
      hub.venueInfo = Object.create(null);   // carry on with the schedule alone
      hub.venueAliases = seedVenueAliases();
    });
  }

  var VENUE_FACTS = [
    ["postcode",      "Postcode"],
    ["parking",       "Parking"],
    ["meeting_point", "Meet at"],
    ["access",        "Access"],
    ["notes",         "Notes"]
  ];

  function venueCard(g) {
    var card = mk("article", "vcard");
    var head = mk("div", "vcard-head");
    var t = mk("div", "vcard-title");
    t.appendChild(mk("h3", null, g.name));

    var info = hub.venueInfo ? hub.venueInfo[venueKey(g.name)] : null;
    /* The postcode is what people actually need, so it rides on the address
       line rather than sitting in the detail list below. */
    var addr = [(info && info.address) || g.address || "", (info && info.postcode) || ""]
      .map(function (x) { return String(x).trim(); })
      .filter(Boolean).join(", ");
    if (addr) t.appendChild(mk("p", "vcard-addr", addr));
    head.appendChild(t);

    var query = addr ? addr + ", " + g.name : g.name;
    if (query) {
      var a = mk("a", "vcard-map", "Directions");
      a.href = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(query);
      a.target = "_blank";
      a.rel = "noopener";
      head.appendChild(a);
    }
    card.appendChild(head);

    if (info) {
      var facts = mk("div", "card-facts");
      VENUE_FACTS.forEach(function (f) {
        var v = String(info[f[0]] || "").trim();
        if (!v || f[0] === "postcode") return;      // postcode rides on the address
        var row = mk("div");
        row.appendChild(mk("span", "k", f[1]));
        row.appendChild(mk("span", "v", v));
        facts.appendChild(row);
      });
      if (facts.children.length) card.appendChild(facts);
    }

    /* What runs here belongs to the Schedule section - repeating it makes
       this a second timetable to keep straight rather than a place list. */
    return card;
  }

  function renderVenues() {
    hub.venueList.innerHTML = "";
    demoNote(hub.venueList, "arrival detail on a few venues");
    var groups = venueGroups();
    if (!groups.length) {
      hub.venueList.appendChild(mk("p", "empty", "No venues are listed on the schedule yet."));
      return;
    }
    groups.forEach(function (g) { hub.venueList.appendChild(venueCard(g)); });
  }

  function showVenues() {
    renderVenues();
    hub.venues.hidden = false;
  }

  /* ----------------------------- handbook ----------------------------- */

  function ensureInfo() {
    if (hub.info) return Promise.resolve();
    if (!hasTab(CFG.infoCsvUrl)) { hub.info = []; return Promise.resolve(); }
    return fetchCsv(CFG.infoCsvUrl, "Info").then(function (rows) {
      hub.info = toObjects(rows, ["title"], "Info");
    }).catch(function (e) {
      hub.info = [];
      hub.infoError = e;
    });
  }

  /**
   * Plain text from a spreadsheet cell, rendered readably: blank lines split
   * paragraphs, lines starting "- " become a list, and anything that looks
   * like a link, an email or a phone number becomes tappable.
   */
  var LINKISH = /(https?:\/\/[^\s<>]+|www\.[^\s<>]+|[\w.+-]+@[\w-]+\.[\w.-]+|(?:\+44|0)\s?\d[\d\s]{7,11}\d)/g;

  function linkify(parent, text) {
    var parts = String(text).split(LINKISH);
    parts.forEach(function (part, i) {
      if (!part) return;
      if (i % 2 === 0) { parent.appendChild(document.createTextNode(part)); return; }
      var a = mk("a", null, part);
      if (part.indexOf("@") > -1 && part.indexOf("/") === -1) a.href = "mailto:" + part;
      else if (/^(?:\+44|0)/.test(part)) a.href = "tel:" + part.replace(/\s+/g, "");
      else a.href = /^https?:/.test(part) ? part : "https://" + part;
      if (a.href.indexOf("http") === 0) { a.target = "_blank"; a.rel = "noopener"; }
      parent.appendChild(a);
    });
  }

  function renderProse(parent, raw) {
    String(raw || "").replace(/\r/g, "").split(/\n\s*\n/).forEach(function (block) {
      var lines = block.split("\n").map(function (l) { return l.trim(); })
                       .filter(function (l) { return l.length; });
      if (!lines.length) return;

      if (lines.every(function (l) { return /^[-•*]\s+/.test(l); })) {
        var ul = mk("ul", "prose-list");
        lines.forEach(function (l) {
          var li = mk("li");
          linkify(li, l.replace(/^[-•*]\s+/, ""));
          ul.appendChild(li);
        });
        parent.appendChild(ul);
        return;
      }

      var pEl = mk("p");
      lines.forEach(function (l, i) {
        if (i) pEl.appendChild(mk("br"));
        linkify(pEl, l);
      });
      parent.appendChild(pEl);
    });
  }

  function renderHandbook() {
    hub.handbookBody.innerHTML = "";
    demoNote(hub.handbookBody, "wording throughout");

    if (hub.infoError) {
      var warn = mk("div", "notice is-error");
      warn.appendChild(mk("h2", null, "The handbook could not be loaded"));
      warn.appendChild(mk("p", null, hub.infoError.message || String(hub.infoError)));
      hub.handbookBody.appendChild(warn);
      return;
    }
    if (!hub.info || !hub.info.length) {
      hub.handbookBody.appendChild(mk("p", "empty",
        "Nothing here yet. Add rows to the Info tab of the sheet and they appear here."));
      return;
    }

    /* Group by section, first appearance wins the order. */
    var order = [], bySection = Object.create(null);
    hub.info.forEach(function (r) {
      var sec = String(r.section || "General").trim() || "General";
      if (!bySection[sec]) { bySection[sec] = []; order.push(sec); }
      bySection[sec].push(r);
    });

    /* A jump link per section, built from whatever sections actually exist -
       add a section in the sheet and it gets a link here for free, nothing
       to keep in sync by hand. Not worth it for a single section. */
    if (order.length > 1) {
      var jump = mk("nav", "hb-jump");
      jump.setAttribute("aria-label", "Jump to section");
      order.forEach(function (sec) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "hb-jump-btn";
        b.textContent = sec;
        b.addEventListener("click", function () {
          var target = document.getElementById("hb-" + slugify(sec));
          if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
        });
        jump.appendChild(b);
      });
      hub.handbookBody.appendChild(jump);
    }

    order.forEach(function (sec) {
      var rows = bySection[sec].slice().sort(function (a, b) {
        return (num(a.order) || 0) - (num(b.order) || 0);
      });
      var group = mk("section", "hb-group");
      group.id = "hb-" + slugify(sec);
      group.appendChild(mk("h3", "hb-section", sec));
      rows.forEach(function (r) {
        if (!String(r.title || "").trim() && !String(r.body || "").trim()) return;
        var item = mk("article", "hb-item");
        item.appendChild(mk("h4", null, String(r.title || "").trim()));
        renderProse(item, r.body);
        group.appendChild(item);
      });
      hub.handbookBody.appendChild(group);
    });
  }

  function showHandbook() {
    hub.handbook.hidden = false;
    ensureInfo().then(function () {
      if (state.view === "handbook") renderHandbook();
    });
  }

  /* ----------------------------- resources ----------------------------- */

  function ensureResources() {
    if (hub.res) return Promise.resolve();
    if (!hasTab(CFG.resourcesCsvUrl)) { hub.res = []; return Promise.resolve(); }
    return fetchCsv(CFG.resourcesCsvUrl, "Resources").then(function (rows) {
      hub.res = toObjects(rows, ["title"], "Resources");
    }).catch(function (e) {
      hub.res = [];
      hub.resError = e;
    });
  }

  function resourceCard(r) {
    var link = String(r.url || "").trim();
    var img  = String(r.image_url || "").trim();
    var href = link || img;

    /* A card with somewhere to go is a link; one without is just a card. */
    var card = mk(href ? "a" : "div", "rcard");
    if (href) {
      card.href = href;
      if (/^https?:/i.test(href)) { card.target = "_blank"; card.rel = "noopener"; }
    }

    if (img) {
      var fig = mk("div", "rcard-img");
      var im = mk("img");
      im.src = img;
      im.alt = String(r.title || "");
      im.loading = "lazy";
      /* A link to an image that has moved or gone private should leave a
         usable card behind, not a broken icon. */
      im.addEventListener("error", function () { fig.remove(); });
      fig.appendChild(im);
      card.appendChild(fig);
    }

    var body = mk("div", "rcard-body");
    body.appendChild(mk("h4", null, String(r.title || "").trim()));
    var desc = String(r.description || "").trim();
    if (desc) body.appendChild(mk("p", null, desc));
    if (link) body.appendChild(mk("span", "rcard-go", "Open"));
    card.appendChild(body);
    return card;
  }

  function renderResources() {
    hub.resourceBody.innerHTML = "";
    demoNote(hub.resourceBody, "resources");

    if (hub.resError) {
      var warn = mk("div", "notice is-error");
      warn.appendChild(mk("h2", null, "The resources could not be loaded"));
      warn.appendChild(mk("p", null, hub.resError.message || String(hub.resError)));
      hub.resourceBody.appendChild(warn);
      return;
    }
    if (!hub.res || !hub.res.length) {
      hub.resourceBody.appendChild(mk("p", "empty",
        "Nothing here yet. Add rows to the Resources tab of the sheet."));
      return;
    }

    var order = [], bySection = Object.create(null);
    hub.res.forEach(function (r) {
      if (!String(r.title || "").trim()) return;
      var sec = String(r.section || "General").trim() || "General";
      if (!bySection[sec]) { bySection[sec] = []; order.push(sec); }
      bySection[sec].push(r);
    });

    order.forEach(function (sec) {
      var rows = bySection[sec].slice().sort(function (a, b) {
        return (num(a.order) || 0) - (num(b.order) || 0);
      });
      var group = mk("section", "hb-group");
      group.appendChild(mk("h3", "hb-section", sec));
      var grid = mk("div", "rgrid");
      rows.forEach(function (r) { grid.appendChild(resourceCard(r)); });
      group.appendChild(grid);
      hub.resourceBody.appendChild(group);
    });
  }

  function showResources() {
    hub.resources.hidden = false;
    ensureResources().then(function () {
      if (state.view === "resources") renderResources();
    });
  }

  /* ------------------------------ views ------------------------------ */

  var VIEWS = { home:1, schedule:1, venues:1, handbook:1, resources:1, financials:1 };

  /** Which section a link is asking for. Old #coach=... links still work. */
  function viewFromHash() {
    var h = (location.hash || "").replace(/^#/, "");
    var first = h.split("&")[0].split("=")[0];
    if (VIEWS[first]) return first;
    if (/(?:^|&)coach=/.test(h)) return "schedule";
    return null;
  }

  /**
   * Moving between sections pushes a history entry, so the phone back button
   * walks back through them. Changing coach inside the schedule replaces it
   * instead - nobody wants to press back eleven times to leave a dropdown.
   */
  function writeHash(name, isNewSection) {
    var h = (name === "schedule" && state.selected)
      ? "#coach=" + encodeURIComponent(state.selected.name)
      : "#" + name;
    if (location.hash === h) return;
    if (isNewSection) history.pushState(null, "", h);
    else history.replaceState(null, "", h);
  }

  function setView(name, opts) {
    opts = opts || {};
    if (!VIEWS[name]) name = "home";
    var changed = state.view !== name;
    state.view = name;

    Array.prototype.forEach.call(document.querySelectorAll(".view-btn"), function (b) {
      b.classList.toggle("is-on", b.getAttribute("data-view") === name);
    });

    /* One place that hides everything, so a new section can never be left
       showing underneath another one. */
    hub.home.hidden = true;
    hub.venues.hidden = true;
    hub.handbook.hidden = true;
    hub.resources.hidden = true;
    el.picker.hidden = true;
    el.results.hidden = true;
    el.status.hidden = true;
    fv.view.hidden = true;

    if (name === "home")            { renderHome(); hub.home.hidden = false; }
    else if (name === "venues")     { showVenues(); }
    else if (name === "handbook")   { showHandbook(); }
    else if (name === "resources")  { showResources(); }
    else if (name === "financials") { renderFinView(); fv.view.hidden = false; }
    else                            { showSchedule(); }

    if (!opts.silent) writeHash(name, changed);
    if (!opts.keepScroll) window.scrollTo(0, 0);
  }

  /* Nav buttons and home tiles both carry data-view, so one handler serves
     both - and any section added later. */
  document.addEventListener("click", function (e) {
    var t = e.target && e.target.closest ? e.target.closest("[data-view]") : null;
    if (!t) return;
    var name = t.getAttribute("data-view");
    if (name === "financials" && !state.financials) {
      askPassword().then(function (ok) { if (ok) setView("financials"); });
      return;
    }
    setView(name);
  });

  /* ====================================================================== */

  loadSchedule();
})();
