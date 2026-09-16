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
    selected: null,
    view: "home"
  };

  var el = {
    main:    document.getElementById("main"),
    picker:  document.getElementById("picker"),
    status:  document.getElementById("status"),
    results: document.getElementById("results"),
    summary: document.getElementById("summary"),
    days:    document.getElementById("days"),
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
    venues:      document.getElementById("venues"),
    venueList:   document.getElementById("venue-list"),
    handbook:    document.getElementById("handbook"),
    handbookBody:document.getElementById("handbook-body"),
    navHandbook: document.getElementById("nav-handbook"),
    venueInfo:   null,   // venue key -> row from the Venues tab, once fetched
    info:        null,   // rows from the Info tab, once fetched
    infoError:   null
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

    var wanted = coachFromHash();
    if (wanted) {
      state.selected = findCoach(wanted);
      if (state.selected) el.input.value = state.selected.name;
    }

    var view = viewFromHash() || (state.selected ? "schedule" : "home");
    if (view === "financials" && !state.financials) {
      setView("home", { silent: true });
      askPassword().then(function (ok) { if (ok) setView("financials"); });
      return;
    }
    setView(view, { silent: true });
  }

  /** The coach picker plus either their week or a prompt to choose one. */
  function showSchedule() {
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

    // Summary line
    var days = [];
    coach.sessions.forEach(function (s) { if (days.indexOf(s.day) === -1) days.push(s.day); });
    var h2 = document.createElement("h2");
    h2.textContent = coach.name;
    var meta = document.createElement("span");
    meta.className = "meta";
    meta.textContent = coach.sessions.length +
      (coach.sessions.length === 1 ? " session" : " sessions") +
      " · " + days.length + (days.length === 1 ? " day" : " days") + " a week";
    el.summary.appendChild(h2);
    el.summary.appendChild(meta);

    // Group by day, in weekday order
    var groups = [];
    coach.sessions.forEach(function (s) {
      var g = groups.filter(function (x) { return x.day === s.day; })[0];
      if (!g) { g = { day: s.day, items: [] }; groups.push(g); }
      g.items.push(s);
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
      g.items.forEach(function (s) { cards.appendChild(buildCard(s, coach)); });
      wrap.appendChild(cards);

      el.days.appendChild(wrap);
    });
  }

  function buildCard(session, coach) {
    var card = document.createElement("article");
    card.className = "card";

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

    // Age group, then category, then programme - skipping any that would
    // only repeat what a tag already said ("School" alongside "Day").
    var tags = document.createElement("div");
    tags.className = "tags";
    var shown = Object.create(null);
    [[session.ageGroup, true], [session.category, false], [session.programme, false]]
      .forEach(function (pair) {
        var text = pair[0];
        if (!text) return;
        var k = nameKey(text);
        if (shown[k]) return;
        if (k === "day" && shown["school"]) return;
        shown[k] = true;
        tags.appendChild(tag(text, pair[1]));
      });
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

    var others = session.coaches.filter(function (c) { return nameKey(c) !== nameKey(coach.name); });
    facts.appendChild(fact("With", others.length ? others.join(", ") : "On their own"));
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
      });
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
    basis:  "monthly",
    nodes:  {},
    node:   null
  };

  /** Totals for a set of sessions, expressed in BOTH bases. */
  function agg(list) {
    var a = { participants: 0, missing: 0, counted: 0,
      monthly: { gross:0, net:0, coach:0, venue:0, profit:0 },
      weekly:  { gross:0, net:0, coach:0, venue:0, profit:0 } };
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

  function headCard(title, a, isTotal) {
    var c = document.createElement("div");
    c.className = "hcard" + (isTotal ? " is-total" : "");
    var h = document.createElement("h3"); h.textContent = title; c.appendChild(h);

    var other = fv.basis === "monthly" ? "weekly" : "monthly";
    var big = document.createElement("div");
    big.className = "big " + (a[fv.basis].profit >= 0 ? "pos" : "neg");
    big.textContent = cash(a[fv.basis].profit);
    c.appendChild(big);

    var alt = document.createElement("div");
    alt.className = "alt";
    alt.textContent = (fv.basis === "monthly" ? "per month" : "per week") +
      " · " + cash(a[other].profit) +
      (other === "monthly" ? " per month" : " per week");
    c.appendChild(alt);

    var rows = document.createElement("div");
    rows.className = "rows";
    [["Revenue (net)", a[fv.basis].net], ["Coach cost", a[fv.basis].coach],
     ["Venue cost", a[fv.basis].venue]].forEach(function (r) {
      var d = document.createElement("div");
      var k = document.createElement("span"); k.textContent = r[0];
      var v = document.createElement("span"); v.textContent = cash(r[1]);
      d.appendChild(k); d.appendChild(v); rows.appendChild(d);
    });
    c.appendChild(rows);
    return c;
  }

  function renderHeadCards() {
    fv.cards.innerHTML = "";
    var ev = state.sessions.filter(function (s) { return !isDay(s); });
    var dy = state.sessions.filter(isDay);
    fv.cards.appendChild(headCard("Evening programme", agg(ev), false));
    fv.cards.appendChild(headCard("Day programme", agg(dy), false));
    fv.cards.appendChild(headCard("Combined", agg(state.sessions), true));
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

  /* ------------------------------- home ------------------------------- */

  var ICONS = {
    schedule: '<rect x="2.5" y="4" width="15" height="13.5" rx="2.5"/><path d="M2.5 8.5h15M6.5 2.5v3M13.5 2.5v3"/>',
    venues:   '<path d="M10 17.5s6-5.1 6-9.2a6 6 0 10-12 0c0 4.1 6 9.2 6 9.2z"/><circle cx="10" cy="8.2" r="2.2"/>',
    handbook: '<path d="M4 3.5h8.5a2.5 2.5 0 012.5 2.5v10.5H6.5A2.5 2.5 0 014 14z"/><path d="M4 14a2.5 2.5 0 012.5-2.5H15"/>',
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
    { view: "financials", title: "Financials", owner: true,
      blurb: "Revenue, cost and profit by programme, session and coach. Password needed." }
  ];

  function renderHome() {
    /* A hub that opens on an empty menu feels dead, so show the week's shape. */
    var days = {};
    state.sessions.forEach(function (s) { if (s.day) days[s.day] = 1; });
    var stats = [
      [state.sessions.length, state.sessions.length === 1 ? "session a week" : "sessions a week"],
      [state.coaches.length, "coaches"],
      [venueGroups().length, "venues"],
      [Object.keys(days).length, "days a week"]
    ];
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
      var b = mk("button", "tile" + (t.owner ? " tile-owner" : ""));
      b.type = "button";
      b.setAttribute("data-view", t.view);
      var icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      icon.setAttribute("viewBox", "0 0 20 20");
      icon.setAttribute("class", "tile-icon");
      icon.setAttribute("aria-hidden", "true");
      icon.innerHTML = ICONS[t.view];
      b.appendChild(icon);
      b.appendChild(mk("h3", null, t.title));
      b.appendChild(mk("p", null, t.blurb));
      if (t.owner) b.appendChild(mk("span", "tile-flag", "Owners"));
      hub.tiles.appendChild(b);
    });
  }

  /* ------------------------------ venues ------------------------------ */

  function venueKey(v) { return String(v || "").toLowerCase().replace(/\s+/g, " ").trim(); }

  /** Every venue named in the schedule, with the sessions that run there. */
  function venueGroups() {
    var by = Object.create(null);
    state.sessions.forEach(function (s) {
      var name = s.venue || "Venue not set";
      var k = venueKey(name);
      if (!by[k]) by[k] = { name: name, address: "", sessions: [] };
      if (!by[k].address && s.address) by[k].address = s.address;
      by[k].sessions.push(s);
    });
    return Object.keys(by).map(function (k) { return by[k]; })
      .sort(function (a, b) { return a.name.localeCompare(b.name, "en-GB"); });
  }

  /** The Venues tab, if one is published. Extra detail, never required. */
  function ensureVenueInfo() {
    if (hub.venueInfo || !hasTab(CFG.venueInfoCsvUrl)) return Promise.resolve();
    return fetchCsv(CFG.venueInfoCsvUrl, "Venue info").then(function (rows) {
      var map = Object.create(null);
      toObjects(rows, ["venue"], "Venue info").forEach(function (r) {
        map[venueKey(r.venue)] = r;
      });
      hub.venueInfo = map;
    }).catch(function (e) {
      console.warn("Venue detail could not be loaded:", e);
      hub.venueInfo = Object.create(null);   // carry on with the schedule alone
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
    var groups = venueGroups();
    if (!groups.length) {
      hub.venueList.appendChild(mk("p", "empty", "No venues are listed on the schedule yet."));
      return;
    }
    groups.forEach(function (g) { hub.venueList.appendChild(venueCard(g)); });
  }

  function showVenues() {
    renderVenues();                       // schedule data alone is enough
    hub.venues.hidden = false;
    ensureVenueInfo().then(function () {  // then fill in the arrival detail
      if (state.view === "venues" && hub.venueInfo) renderVenues();
    });
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

    order.forEach(function (sec) {
      var rows = bySection[sec].slice().sort(function (a, b) {
        return (num(a.order) || 0) - (num(b.order) || 0);
      });
      var group = mk("section", "hb-group");
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

  /* ------------------------------ views ------------------------------ */

  var VIEWS = { home:1, schedule:1, venues:1, handbook:1, financials:1 };

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
    el.picker.hidden = true;
    el.results.hidden = true;
    el.status.hidden = true;
    fv.view.hidden = true;

    if (name === "home")            { renderHome(); hub.home.hidden = false; }
    else if (name === "venues")     { showVenues(); }
    else if (name === "handbook")   { showHandbook(); }
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
