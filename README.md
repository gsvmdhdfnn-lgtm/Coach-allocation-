# Coach Schedule

A single-page site that lets you pick a coach and see every session they run
that week. The schedule itself is open to anyone with the link; the money sits
behind a password.

No build step, no framework — plain HTML, CSS and JavaScript. It reads its data
straight from the coaching spreadsheet, so **changing the schedule means editing
the Google Sheet, nothing else**.

| File | What it is |
| --- | --- |
| `index.html` | The page |
| `style.css` | All the styling |
| `app.js` | Fetching, filtering, rendering, the password gate |
| `config.js` | **The only file you edit.** Sheet links, password, aliases |
| `setup.html` | Run once to switch on the financial layer |
| `je-logo.png` | The Josh Evans Soccer School logo in the header |

---

## 1. The sheet needs three flat tabs

The workbook is laid out for *reading* — merged cells, header rows, formulas.
That is hard to parse reliably, so the app reads three plain tabs instead: one
row per record, no formulas, no merged cells.

Add them to the same file (`Josh_Evans_Coaching_PL_and_Schedule`). The
`Add tabs to sheet.gs` script sent alongside this project creates all three
already filled in:

> In the sheet: **Extensions → Apps Script**, paste the script over whatever is
> there, press **Run**, and approve the permission prompt. It adds the three
> tabs and leaves your existing eight untouched. You only ever run it once.

Alternatively import `Sessions.csv`, `Financials.csv` and `Coaches.csv` by hand
(**File → Import → Upload → Insert new sheet(s)**), then rename the tabs to
`Sessions`, `Financials` and `Coaches`.

### Sessions

One row per session. `E01`–`E23` are the evening sessions, `D01`–`D28` the
school ones.

`session_id` · `programme` · `category` · `session_name` · `age_group` ·
`day` · `time` · `venue` · `address` · `coaches`

- `coaches` holds one or more names, comma-separated — `Josh, Tom`. The app
  splits on the comma, so that session shows up under Josh *and* Tom.
- `age_group` is deliberately blank on school sessions.
- `address` is optional and mostly blank; when it is filled in, the card shows it.

### Financials

One row per session, keyed by `session_id`.

`session_id` · `participants` · `price_per_participant` · `revenue_gross` ·
`revenue_net` · `coach_cost` · `venue_cost` · `profit` · `period`

`period` is `monthly` for evening sessions and `weekly` for school ones,
because that is how the two programmes are actually billed. The app prints the
period on every card and never adds the two together.

### Coaches

`coach_name` · `hourly_rate` · `day_rate` · `basis` · `aliases`

`aliases` is how one person with two names gets folded into one. `Jacko` carries
the alias `Jack`, so a session that says `Jack` still appears under Jacko and
`Jack` never shows up as a separate coach in the dropdown. Add more as
comma-separated values.

---

## 2. Publish the tabs as CSV

For each of the three tabs:

1. **File → Share → Publish to web**
2. In the first dropdown pick the tab (**not** "Entire Document")
3. In the second dropdown pick **Comma-separated values (.csv)**
4. **Publish**, then copy the link

Publish the tabs one at a time rather than the whole document — that way
nothing else in the workbook is exposed.

The links look like this, and are not the same as the link in your address bar:

```
https://docs.google.com/spreadsheets/d/e/2PACX-1vT…/pub?gid=123456789&single=true&output=csv
```

Google refreshes a published tab every few minutes, so edits show up on the site
shortly after you save them.

---

## 3. Point the site at the sheet

Open `config.js` and paste in the two public links:

```js
sessionsCsvUrl: "https://docs.google.com/…&output=csv",
coachesCsvUrl:  "https://docs.google.com/…&output=csv",
```

Then set up the financial layer. Open `setup.html` in a browser (over `https`
or `http://localhost` — encryption is unavailable on a `file://` page), paste in
the **Financials** link, choose a password, and press Generate. It hands you a
block like this to paste over the `financials:` line in `config.js`:

```js
financials: {
  salt: "…",
  iv: "…",
  ciphertext: "…",
  iterations: 250000
},
```

That block **is** the Financials link, encrypted with your password. The link
never appears in the site's source, and the app cannot request the financial
figures until someone types the password correctly. To change the password,
run `setup.html` again and paste in the new block.

Commit and push, and the site picks it all up.

---

## 4. Put it on GitHub Pages

In the repository: **Settings → Pages → Build and deployment**, source
**Deploy from a branch**, branch `claude/coach-schedule-web-app-lu94l7` (the
repository's default branch), folder `/ (root)`, **Save**. A minute later the
site is at:

```
https://gsvmdhdfnn-lgtm.github.io/Coach-allocation-/
```

The repository is public, so Pages works on a free plan. Nothing financial
lives in it — only the code that goes and fetches the figures — so public is
safe here.

One consequence to keep in mind: the site is a set of static files with no
server behind it, so anything the page can read, a visitor can read too. That
shapes the section below.

---

## Replacing the logo

Drop a new `je-logo.png` in beside the others, keeping the name. The header
sizes it by height, so any width works.

It sits on a white bar in both light and dark mode, deliberately: the artwork
is navy-on-white, and on the brand blue the wordmark all but disappears. If you
ever get a white or knocked-out version, the bar can become blue instead -
change `background: #ffffff` on `.masthead` in `style.css`.

## How safe is the password, really?

Honestly: it stops people wandering in, and that is all it is meant to do.

What it does do:

- The Financials link is encrypted with your password using PBKDF2
  (250,000 rounds) and AES-GCM. It is not sitting in the source in readable
  form, and there is no password check to skip past — get the password wrong and
  there is no link to fetch.
- Nothing financial is requested until the password is accepted. Watching the
  network tab on page load shows the schedule being fetched and nothing else.
- The unlocked state is held in memory only. Closing the tab re-locks it.
  Nothing is written to a cookie or to local storage.

What it does not do:

- Someone determined, with the password, can read the Financials link out of
  memory and share it directly. Anyone who has that link can then read the tab
  without the password. If that happens, un-publish and re-publish the
  Financials tab — Google issues a new link — and re-run `setup.html`.
- A published tab's link is a long random string, not a login. Treat it as a
  password in its own right.
- Because everything runs in the browser, the password can in principle be
  attacked offline by someone who has the site. 250,000 PBKDF2 rounds makes that
  slow rather than impossible, so **pick a password you don't use anywhere
  else**, and make it long.

If the figures ever need real protection, that means a server that checks the
password before handing anything over — which is a different kind of project
from a static page.

---

## Day-to-day

**Adding or changing a session** — edit the `Sessions` tab. A new session needs
a `session_id` nobody else is using. If you want figures on it too, add a row to
`Financials` with the same `session_id`; without one, the card opens and says so
rather than showing blanks.

**A coach not appearing** — check the spelling in the `coaches` column. A name
spelled differently is treated as a different person, which is exactly what the
`aliases` column on the `Coaches` tab is for.

**Sharing a link to one coach** — the address updates as you pick, so
`…/#coach=Danny` opens straight onto Danny.

---

## Where the school figures came from

The evening numbers are taken straight from the `Evening P&L` tab, one row per
session, unchanged.

The school programme is billed per school, not per session, so the `Day P&L -
Schools` weekly totals had to be spread across each school's sessions:

- **Schools billed per coach hour** (City of London Freemen's, Downsend,
  St Annes PPA, Walton on the Hill) — revenue follows billable coach hours
  exactly, so the split is not an estimate.
- **Schools billed per player** (the rest) — the school's player count is
  divided between its sessions in proportion to coach hours, then revenue is
  players × the per-player rate. The player split is the one genuine estimate
  here: the workbook records a total per school, not a register per session. If
  you know the real numbers, type them into the `Financials` tab and they will
  be used instead.
- **Coach cost** is exact in both cases, straight from `Day Coach Cost`.
- Every school's sessions add back up to that school's row on
  `Day P&L - Schools`, and the programme totals match the `Summary` tab:
  £14,478 evening gross per month, £3,933 invoiced to schools per week.

Two smaller notes: school sessions carry no venue cost, because they run on
school sites; and `St Annes (PPA)` has no clock time in the workbook, so its
card reads "PPA cover (4h paid)" and sorts to the end of its day.
