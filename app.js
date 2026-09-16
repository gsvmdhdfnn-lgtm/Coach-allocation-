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
    selected: null
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

  function ready() {
    el.picker.hidden = false;
    el.status.hidden = true;
    if (fv && fv.nav) fv.nav.hidden = false;

    var fromHash = coachFromHash();
    if (fromHash) select(fromHash, { silent: true });
    else {
      el.results.hidden = true;
      el.status.hidden = false;
      notice("Pick a coach",
        "<p>Choose a coach above to see every session they run this week — " +
        state.sessions.length + " sessions across " + state.coaches.length +
        " coaches are loaded.</p>", false);
    }
  }

  function coachFromHash() {
    var m = /(?:^|[#&])coach=([^&]+)/.exec(location.hash || "");
    if (!m) return null;
    var wanted = nameKey(decodeURIComponent(m[1].replace(/\+/g, " ")));
    var hit = state.coaches.filter(function (c) { return nameKey(c.name) === wanted; })[0];
    return hit ? hit.name : null;
  }

  function select(name, opts) {
    opts = opts || {};
    var coach = state.coaches.filter(function (c) { return nameKey(c.name) === nameKey(name); })[0];
    if (!coach) return;

    state.selected = coach;
    el.input.value = coach.name;

    if (!opts.silent || location.hash.indexOf("coach=") === -1) {
      var h = "#coach=" + encodeURIComponent(coach.name);
      if (location.hash !== h) history.replaceState(null, "", h);
    }
    render();
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

  window.addEventListener("hashchange", function () {
    var name = coachFromHash();
    if (name && (!state.selected || nameKey(name) !== nameKey(state.selected.name))) {
      select(name, { silent: true });
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
    var path = chain(node);
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

  function selectNode(key) {
    var node = fv.nodes[key] || fv.nodes.all;
    fv.node = node;
    renderPickers(node);
    renderHeadCards();
    renderLevel(node);
  }

  function renderFinView() {
    buildTree();
    selectNode(fv.node && fv.nodes[fv.node.key] ? fv.node.key : "all");
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

  /* ------------------------------ views ------------------------------ */

  function setView(name) {
    Array.prototype.forEach.call(document.querySelectorAll(".view-btn"), function (b) {
      b.classList.toggle("is-on", b.getAttribute("data-view") === name);
    });
    var fin = name === "financials";
    fv.view.hidden = !fin;
    el.picker.hidden = fin;
    if (fin) {
      el.results.hidden = true;
      el.status.hidden = true;
      renderFinView();
    } else {
      fv.view.hidden = true;
      if (state.selected) render(); else ready();
    }
  }

  Array.prototype.forEach.call(document.querySelectorAll(".view-btn"), function (b) {
    b.addEventListener("click", function () {
      var name = b.getAttribute("data-view");
      if (name === "financials" && !state.financials) {
        askPassword().then(function (ok) { if (ok) setView("financials"); });
        return;
      }
      setView(name);
    });
  });

  /* ====================================================================== */

  loadSchedule();
})();
