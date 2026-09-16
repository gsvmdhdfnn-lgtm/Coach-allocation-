# Team Hub — what's done, what's next, what's still a question

Kept current as we go. The point of it is that nothing agreed in a
conversation gets lost, and that anyone picking this up later — David, Josh,
or me in a fresh session — can see where things stand without re-reading
everything.

Last updated: 16 September 2026 (late — a long session)

---

## Done and live

- Coach schedule — look up any coach, see their week, read live from the sheet
- Financials behind a password: summary, cascading drill-down, by-coach costs
- Sheet rebuilt so it calculates: Prices, Venues, Coaches as reference tabs,
  `coach_groups` and `venue_groups` derived, Josh and David's rates from
  salary ÷ tracked hours
- Brand applied, logo in the masthead

## Done, sitting in the preview

At `…/Coach-allocation-/preview/`. Not promoted to the live site yet.

- Home page and section nav — Home, Schedule, Venues, Handbook, Financials
- Venues section, built from the schedule
- Handbook section, driven from an `Info` tab
- Venue aliasing, so one place named twice on the schedule is one card
- Resources section — term plans and session posters as image cards, plus
  links out to forms and the website
- Coach codes — a coach's link opens on their own week, Schedule becomes
  "My week", the home page shows their numbers, the financial side
  disappears. Owners keep everything. Running on sample codes in
  `config.js` until the Coaches tab has a `code` column.
- Week picker on "My week" — this week plus three, with the week's theme,
  and cancellations, cover and one-offs applied from a `Changes` tab.
  3 weeks ahead and cancellations stay visible, both David's call.
- `Terms` tab — a school's own calendar: a different start date, and a
  half term, represented as two spans for the same school rather than a
  cancelled row. Revised after David pointed out that "Cancelled" is the
  wrong word for a week that was never scheduled in the first place — a
  school on a break gets the same quiet treatment as one that hasn't
  started, never a red banner.
- Status banners across the top of a card — red *Cancelled*, amber *Sam is
  covering · You are not needed*, lime *Covering for Tom*, blue *One-off*.
  Signed off: "they all look great". The headline carries the fact, not the
  label, and covered sessions are not faded — a coach glancing at a phone
  reads four words and needs them to answer "do I turn up?".
- Sample handbook, venue, resource, calendar and change data so the empty
  sections can be judged

## Next — tomorrow, at the laptop

1. **Run `Add hub tabs.gs`** — creates the `Info` and `Venue info` tabs
2. **Publish both as CSV**, links into `config.js`
3. **Write the handbook** — the non-negotiables first, then the rest
4. **Fill in `Venue info`** — the Freemen's alias, then addresses and postcodes
   (without them, Directions is a name search and is weak for the
   single-word venues like Milbourne and Parkside)
5. **Decide whether to promote the preview** over the live site — does
   NOT require any of the other steps on this list first. Every new section
   checks whether its tab is configured and quietly stays hidden if not, so
   promoting today with nothing else done would just look like a cleaner
   version of the current live site: Schedule as now, Venues working
   already (it builds from Sessions.csv alone), Handbook/Resources/the week
   picker simply absent from the nav, everyone seeing the whole-team view
   with an empty "got a code?" box. Nothing half-finished, nothing broken.
   The one thing worth sequencing deliberately is `addCoachCodes` - not
   needed to promote the site, but needed before handing an actual coach a
   personal link, since until then there is nothing for the link to point
   to. Everything else can be filled in at whatever pace suits, each
   feature switching on the moment its CSV link lands in config.js.
6. **Fill in the `Resources` tab** — the term posters. Needs somewhere the
   images can be loaded from directly; a plain Drive sharing link will not
   do it (the script's note on the `image_url` header explains the
   workaround).
7. **Run `addCoachCodes`** in the same script — adds `code` and `owner`
   columns to the Coaches tab and fills in a code for everyone. Put YES
   against David and Josh. Then each coach's link is the site address plus
   `#me=THEIRCODE`.
8. **Fill in `Calendar` and `Changes`** — the script creates both with the
   next twelve weeks seeded and three example rows to delete.
   Also creates **`Terms`** — leave it empty unless a specific school's term
   genuinely differs from the rest; most schools will never need a row.
9. **Add an `Ideas` tab** and show it in the hub behind the Financials
   password — agreed. Same pattern as the Handbook, just gated, so David can
   add a row from his phone in the Sheets app and both he and Josh see the
   list. Replaces this file as the place ideas get captured; this file stays
   as the record of what is decided and built.

## Next — the parked build

**The calendar and the change log.** The *reading* half is built and in the
preview: the week picker, the theme, cancellations/cover/one-offs from
`Changes`, and per-school term windows from `Terms` (St Peter's on from the
8th, Dane's Hill not until the 15th — genuinely different plans, not an
exception either side). What is left is the financial half — using
`Calendar` and `Terms` together so monthly figures stop assuming 4.33 weeks
of everything a school never actually ran, and the coach hours report that
reads the same two tabs to only count weeks a session genuinely happened.

**Locked design decision, so it never drifts:** there is exactly ONE
`Terms` tab. The hub, the financial formulas and the coach hours report all
read it — none of them ever gets its own copy of a school's dates. David
asked directly whether this could be one source rather than two, and the
answer is yes, that was always the intent; worth spelling out so it stays
true when someone else builds the financial half. Concretely, when that
gets built: a Financials row looks up its school in `Terms` the same way it
already looks up venue/day/time via `INDEX/MATCH`, counts how many
`Calendar` weeks fall inside the start/end, and uses that instead of the
flat `weeksPerMonth` constant. The hours report does the identical lookup
before counting an hour worked.

**How to represent a gap inside a term (e.g. half term) — CORRECTED.**
The first version of this decision (above, superseded) said half term
should be a `Changes` "cancelled" row. David caught the problem with that:
"Cancelled" means something was due to happen and didn't; half term was
never scheduled, so calling it cancelled tells a coach something went
wrong when nothing did.

The fix: `Terms` allows **more than one row per school**. Half term is not
a hole punched in a single date range, it is two ordinary spans — one up
to the break, one starting again after it. No new column, no new
mechanism, just "a school can appear more than once":
  `Terms`: Daneshill, starts 2026-09-12, ends 2026-10-16
  `Terms`: Daneshill, starts 2026-11-02, ends 2026-12-12, note "Back after half term"
A week that falls in neither span gets the same quiet treatment as a term
that hasn't started yet — no card, one grey line under the coach's summary,
never a red "Cancelled" banner. `Changes` still exists and is still right
for what it was always for: something genuinely unpredictable (a coach's
day off, a school's one-off ask) — not a school's own known calendar.
Built and tested in the preview; the reasoning above about a third
mechanism causing two places to disagree still holds, it was just aimed at
the wrong fix.

**The coach hours report — confirmed buildable both ways David asked for:**
on demand (a button/menu item in the spreadsheet, same pattern as every
other script delivered so far) and automatically at month-end (a Google
Apps Script time-based trigger — native to Apps Script, no new
infrastructure). Both run the identical report logic against Sessions +
Terms + Changes + Calendar; building one does not cost building the other
later, since only the trigger differs.

**Financial forecast / date-range P&L — new, well-specified, David's idea.**
Sits ON TOP of the term-accuracy fix above, not alongside it - only makes
sense once a session's real weeks-running is correct, so build it after,
not in parallel.

Three things David asked for turned out to be one feature:
- "A yearly forecast - based on the dates they run, how much does this
  bring in"
- "A breakdown of a date range"
- Confirmed understanding: a live weekly/monthly figure correctly drops to
  £0 for a week a school is not on - that is accuracy, not data loss. A
  month/term/year figure is a SUM of weeks, and a week that already
  happened stays counted in that sum forever; nothing is ever subtracted
  after the fact. Different question ("this week" vs "this year"),
  different answer - worth keeping distinct, it is an easy thing to
  conflate and alarm someone over nothing.

These are the same calculation with different start/end dates fed in -
build one range-based engine, not three separate features. "This week",
"this month", "this term", "this year" and a custom range are all presets
of it.

The useful shape for the year is not one blended number: **actual so far +
scheduled remainder = total**. "£38,400 banked, £61,200 still to come,
£99,600 for the year" tells you where you stand AND where you are headed,
which a single total hides.

Proposed home: a new page inside the existing password-gated Financials
section, alongside the by-coach view, reusing data the app already loads
for the schedule (Sessions, Financials, Terms, Calendar) - nothing new to
fetch.

**The report must WRITE somewhere durable, not just display a number.**
David wants years of history to look back on, and the live week picker is
the wrong tool for that: it reconstructs a week from whatever rows still
exist on `Changes`/`Calendar`/`Terms`, so it is only as reliable as "nobody
ever tidied up an old row" - not a promise worth relying on for real
record-keeping. The report has to append to a permanent archive (a new tab
per month, or rows on a running log) so the answer survives someone
cleaning up the working tabs later. The picker is for "what does this week
look like"; the archive is for "what actually happened in March 2027".

**How the rolling dropdown works, for the record (already built, needs
nothing further):** `weekChoices()` computes from `new Date()` - "right
now", read fresh on every page load, never a stored list. That is why it
never needs updating: it cannot go stale, because it never remembers what
it showed yesterday. What DOES need occasional upkeep is the content those
weeks describe - `Calendar` needs rows added periodically to keep themes
showing, and any `Terms` row with an `ends` date needs the next span added
before that date arrives, or a still-running school will wrongly read as
"ended" until someone notices. Practical rule: leave `ends` blank unless
the actual end date is known, rather than guessing and forgetting to
extend it.

- A `Calendar` tab: which weeks each session actually runs (half term, term
  dates), so monthly figures stop assuming 4.33 weeks of everything
- A `Changes` log: the exceptions only — a night off, a swap, a cover, a
  one-off like the school asking for 1–2pm this week
- An optional `date` column on Sessions for genuine one-offs

The principle we settled on: **log the exceptions, not everything.** There is
a base schedule and it is mostly right.

**Agreed outcome of this work: the week's theme on the session.** The term
posters already carry the dates — week 9 is w/c 9th November, and so on. Put
those weeks in the calendar tab and the hub can say what this week is about:

- On the home page — "Week 9 — Start Attacks" instead of a generic welcome
- On each session card in the schedule — so a coach checking where they are
  on Tuesday night also sees what they are coaching

It needs a `Themes` column or tab keyed by week number, which is a handful
of rows a term. The theme is a property of the week, not of the session, so
it costs nothing per session and nothing to maintain once a term is typed in.

David: "I like that calendar link with the session."

## After that, in order

1. **Coach hours report** — what each coach actually worked, for checking
   invoices. Needs the calendar and change log first.
2. **Coach identity — "their own space"** — a `code` column on the Coaches
   tab. Tom gets a link with his code in it, or types it once and his phone
   remembers. No passwords, no accounts, nothing to reset; someone leaves,
   clear their code.

   It turns "the schedule" into "my week": no dropdown of twelve names, and
   later his hours this month, his feedback, his sessions with the week's
   theme on them. David and Josh get a switcher and see everyone.

   **Showing each coach their own view and stopping them seeing others are
   two different jobs.** The first is easy and is most of the value. The
   second is not possible while the schedule is a published CSV — the whole
   file is in the browser on page load and the link to it is in the code, so
   changing `#coach=Tom` to `#coach=Sam` would work. Same honest caveat as
   the financials password, only weaker.

   For the schedule that is fine — a coach seeing the rota is not a problem,
   they cover for each other. Where it is not fine, the real fix is the write
   path below: `doGet` takes a code, checks it, returns only that person's
   rows, and the data never leaves Google unless the code is right. The cost
   is losing the published-CSV simplicity and depending on Apps Script being
   up.

   **So: personalised views for everything, and the locked-down version only
   for feedback** — the first thing where "someone could look" is genuinely
   unacceptable, and it needs that door anyway.

   Weakness to remember: a code in a link gets forwarded and lives in
   WhatsApp forever. Fine for a schedule. For feedback, make them type it.
3. **The write path** — an Apps Script web app (`doPost`, deployed as
   "Execute as me"). Prove it on something low-stakes where David sees the
   result, *not* on feedback: a note that silently fails to save is invisible
   to the person it was meant for.
4. **Feedback to coaches** — David and Josh writing to coaches, not coaches
   self-reflecting. Chosen deliberately: it flows from the two people
   motivated to give it to the eleven who benefit, and it leaves a record
   that a WhatsApp message does not.
5. **Holiday and cover requests** — same plumbing again, more edge cases.

## Open questions

Things I picked or guessed that are David's call:

- Masthead says **"Team Hub"** — right name?
- Home opens with **sessions / coaches / venues / days** counts — useful or
  noise?
- Section order puts **Home first**. Schedule is what people will open most —
  argument for making it the landing page and dropping Home
- Coach side is **open to anyone with the link**. Fine for now; changes when
  coach codes arrive
- Venues: bare name and a Directions button for venues with no detail. Enough,
  or should every venue get an address?
- **Past weeks on the live picker — David wants this.** Currently forward
  only (this week + 3). Extending it backward is simple and not yet built.
  Flagged so it doesn't get lost, but see the note below on what it can and
  can't reliably answer.

## Loose ends worth tidying

- **Freemen's alias** currently lives in `config.js`. Move it to the
  `Venue info` tab's `also_known_as` column once that tab exists, so it is
  editable without code.
- **Therfield** — the old £56 vs £90 card entry may still want tidying.
  Largely resolved by the rebuild.
- **Venues tab column H** (`booking_cost_per_week`) needs copying down when a
  venue row is added. Could be an ARRAYFORMULA. David: "not needed yet."
- **Only one Google account owns the spreadsheet.** Worth adding a second
  owner — if that account is lost, so is everything.
- **Custom domain** — ~£10–15/yr, optional, purely cosmetic.
- **Vector or white-knockout logo** would let the masthead go brand blue.
  The current artwork is navy on white, so the bar has to stay white.

## Things that stay true

Worth not re-litigating:

- **No Sheets API, no keys.** Published CSVs only — it has to work from a
  static page.
- **The Financials CSV is never fetched until the password is accepted.**
- **The client-side password is not real security.** Accepted trade-off:
  it stops casual snooping, not a determined person.
- **Changing the schedule means editing the sheet.** No code, no redeploy.
  Every feature since has been held to the same rule.
- **Prefer things that maintain themselves.** The Financials tab recalculates
  because it is derived. The old Evening P&L drifted within hours because it
  needed someone to remember. Features that depend on someone remembering are
  the ones that die.
