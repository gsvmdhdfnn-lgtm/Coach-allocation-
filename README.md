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

One row per session, keyed by `session_id`. The tab calculates: the money
columns are formulas, and only the shaded columns are typed in. Google
publishes the calculated values rather than the formulas, so the site just
sees numbers.

The site reads these, by heading rather than position:

`session_id` · `participants` · `price_per_participant` · `revenue_gross` ·
`revenue_net` · `coach_cost` · `venue_cost` · `profit` · `period`

Alongside them the tab carries `session_name`, `day`, `time`, `venue` and
`coaches`, looked up live from the Sessions tab so a row is readable without
cross-referencing, plus the inputs the formulas work from. The site ignores
every column it does not recognise, so extra ones are free.

**What you type in:**

| Column | |
| --- | --- |
| `participants`, `price_per_participant` | any session with children in it |
| `rate`, `units` | the eleven schools billed per coach hour (D01-D09, D26, D27), where `rate` is GBP per coach hour and `units` is billable hours |
| `venue_cost` | negotiated per session, so not derivable from a rate |
| `coach_groups` | how many classes share the coaches and venue in that slot |
| `coach_rate_total` | the coaches' combined hourly rate for that session |

**What calculates itself:** revenue gross and net (VAT handled per the `vat`
column — `inclusive` for evening and per-player schools, `added` for
per-coach-hour ones), coach cost (`coach_rate_total` × hours ÷ `coach_groups`,
converted to monthly for evening rows), and profit.

So dropping a class from a shared slot means changing `coach_groups` on the
others, and the cost re-splits across them on its own.

`period` is `monthly` for evening sessions and `weekly` for school ones,
because that is how the two programmes are actually billed. The app prints the
period on every card and never adds the two together. The TOTAL row at the
bottom of the tab sums both together, so treat it as a checksum rather than a
business figure.

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

## The Financials view

A second view, reached by the **Financials** button and behind the same
password as the session cards. It answers "how are we doing" rather than
"where is Danny on Thursday".

Three headline cards — evening, day, combined — then dropdowns that cascade,
each appearing only once the one before it has somewhere to go:

```
1. Pre Academy          categories on the evening side,
                        schools on the day side

2. Pre Academy U8       All Pre Academy, then each class

3. Wednesday            All Pre Academy U8, then each time it runs
```

Stop at any level for its P&L, plus a table of what sits inside it ranked by
profit with a bar for relative size. Clicking a row drills in.

The middle level groups by `session_name`, which is what makes this worth
having: Pre Academy U8 runs three times a week and the three are not alike.
Rolled up they look healthy; split out, one of them is carrying the others.

Where a name would say nothing the level is skipped — most day schools name
every session after the school, so Daneshill goes straight to its days rather
than through a pointless 'Daneshill → Daneshill' step.

**Both periods are always available.** Evening sessions are billed monthly and
school sessions weekly, so every figure is converted to whichever basis the
Per month / Per week toggle is set to, and the headline cards print the other
one underneath. Combined is only ever a sum of two figures on the same basis —
the mixed number that would result from adding a monthly total to a weekly one
is never shown.

Per-coach-hour schools have no participants, so they show `n/a` rather than
`0` — otherwise a school billed by the hour looks empty.

The grouping in the middle layer is `category` for evening rows and `client`
for day rows. That is why `client` exists: City of London Freemen's is both a
venue for the evening Academy and a separate day-school customer, and grouping
by venue would silently merge them.

## Replacing the logo

Drop a new `je-logo.png` in beside the others, keeping the name. The header
sizes it by height, so any width works.

The header bar is white in both light and dark mode, deliberately. The supplied
artwork is navy-on-white; against the brand blue the wordmark sits at about
1.3:1, which is not readable. The logo is matted onto pure white rather than
cut out, because the source was a JPEG and keying its compression ringing left
a visible haze around the letters - matting keeps the anti-aliasing clean, and
the bar behind it is white anyway.

If you ever get a vector (SVG/EPS) or a knocked-out white version, send it over:
the bar could then go brand blue, which is the stronger look.

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
`Financials` with the same `session_id` — copy an existing row of a similar
session and paste it, so the formulas come with it, then change the id and the
inputs. Typing into a blank row leaves empty cells where the calculations
should be. Without a Financials row at all, the card opens and says so rather
than showing blanks.

**Changing participant numbers** — the `participants` column on `Financials`.
Revenue and profit follow, and the site picks it up within a few minutes.

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
