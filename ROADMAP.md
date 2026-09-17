# Team Hub — what's done, what's next, what's still a question

Kept current as we go. The point of it is that nothing agreed in a
conversation gets lost, and that anyone picking this up later — David, Josh,
or me in a fresh session — can see where things stand without re-reading
everything.

Last updated: 17 September 2026

---

## Done and live

**Promoted from `preview/` to the live site on 17 September 2026** — the
Coaches Hub layout below, and everything built on top of it since, is now
what the team actually sees. `preview/` stays in place as the staging area
for whatever gets built next (see its README).

One thing deliberately not turned on as part of this promotion: **coach
codes**. `coachCodes` in `config.js` ships empty, so nobody has a
personalised `#me=` link yet — everyone lands on the whole-team view and
picks their name from the dropdown, exactly as before. Nothing is broken
by this; it's a genuinely separate, later step. Generating and handing out
real codes (via `addCoachCodes` in `Add hub tabs.gs`) is next.

- Coach schedule — look up any coach, see their week, read live from the sheet
- Financials behind a password: summary, cascading drill-down, by-coach costs
- Sheet rebuilt so it calculates: Prices, Venues, Coaches as reference tabs,
  `coach_groups` and `venue_groups` derived, Josh and David's rates from
  salary ÷ tracked hours
- Brand applied, logo in the masthead
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
- Overheads — company-wide costs (admin, insurance, payment fees) as a
  third cost category alongside coach and venue cost. Shows on the
  Combined financials card only, as "net profit after overheads", with
  one-offs called out separately rather than blended in. First pass, not
  production-secure yet — see the security note in config.js and README.
- Masthead renamed **"Coaches Hub"**
- Sample handbook, venue, resource, calendar, change and overheads data so
  the empty sections can be judged
- Custom filter on the Financials page — day of the week, time window,
  venue, any combination, sitting above the programme tree and independent
  of it. Reads the raw `venue` column, never the Venues-page alias, so the
  Freemen's evening club and the Freemen's school coaching contract stay
  two different answers, on purpose — see the roadmap entry further down
  for why.
- Real handbook and venue content filled in (Info, Venue info, Resources,
  Calendar, Changes, Terms tabs all published and wired in)
- Per-category `Themes` tab — Pre Academy/TDC/Academy each get their own
  weekly theme, shown on each session's own card rather than one week-wide
  banner
- Session cards: the old category/programme tags (U10, Academy, Evening)
  replaced with the week's theme in blue near the title, age-group tag
  kept
- **Financial accuracy work**, all reading `Terms`/`Changes` so the
  schedule and the money can never disagree:
  - "This week (actual)" on the head cards — a real, term-aware figure
    alongside (never replacing) the typical weekly/monthly one.
    `monthly`-billed sessions smooth revenue through a mid-season gap
    like half term (only stopping outside the whole season); `weekly`
    sessions are pay-as-you-go, gated exactly like cost. Coach/venue cost
    always drops to £0 for a week that isn't genuinely happening,
    whatever the billing period.
  - **The P&L archive** — a permanent, write-once weekly record
    (`Weekly P&L archive.gs`, delivered separately, not in this repo).
    Archives one real, finished week at a time, on a Monday trigger;
    `backfillArchive()` catches up any weeks that happened before the
    archive was first set up. A price or headcount change later can never
    reshape a week already archived — confirmed directly with David as
    the whole point of it.
  - **Period totals** on the Financials page — pick any date range, see
    Actual (locked, from the archive) + Scheduled (a live projection for
    this week and beyond) + Total, never blended.

## Next — tomorrow, at the laptop

1. **Tidy the just-backfilled P&L archive** — a few schools were included
   in the 31 Aug / 7 Sept archived weeks before they'd actually started.
   Delete just those specific rows by hand, and fix their real start dates
   on the `Terms` tab so future weeks archive correctly on their own.
2. **Run `addCoachCodes`** in `Add hub tabs.gs` — adds `code` and `owner`
   columns to the Coaches tab and fills in a code for everyone. Put YES
   against David and Josh. Then each coach's link is the site address plus
   `#me=THEIRCODE`. Deliberately deferred out of the promotion — the site
   works fine without it, coaches just pick their name from the dropdown
   until this is done.
3. **Add an `Ideas` tab** and show it in the hub behind the Financials
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

**Camps and tours — a fourth kind of thing, not a bent version of a
session.** David's examples: half-term camps, tours. Genuinely different
economics from a term-time session, not just a scheduling variation -
specific dates rather than a weekly pattern, coaches paid a flat day fee
regardless of headcount rather than by hours/participants, parents paying
per day rather than a termly fee. Forcing this into the existing
Sessions/Financials machinery would produce numbers that are subtly wrong,
not a clean fit - so it gets its own tab.

Proposed: an `Events` tab, not `Camps` - a `type` column (camp/tour/
whatever comes next) means tours and future things share one tab rather
than needing a new one each time.

  name, type, venue, day_time, starts, ends, coaches, price_per_day,
  coach_day_fee, note

Reuses existing conventions rather than inventing new ones: `coaches`
comma-separated exactly like Sessions, `starts`/`ends` exactly like Terms.
Each row expands into one schedule entry per day in its range, shown on a
coach's week with its own coloured badge - same visual language as the
existing "One-off" badge, its own colour.

Financially: coach cost = coaches x coach_day_fee x days (flat, not
derived from hours/participants). Revenue = bookings x price_per_day x
days. This is its own small P&L, becoming a FOURTH component of Combined
alongside Evening, Day and Overheads - Combined becomes Evening + Day +
Events - Overheads, not just the first two minus the third as it is today.
Deliberately kept separate from Overheads: Overheads is fixed cost that
exists whether or not a camp runs; Events is its own income-generating
activity with its own coaches and its own prices.

Not built - a design for whenever this is wanted, following the same
"reuse the pattern that already exists" principle as everything else on
this list.

**Participant history — the same "spans of time" pattern as Terms, applied
to headcount.** David's own example, kept as the reference case: Academy
U9 goes from 11 to 14 participants on 01/10/26. A date-range query should
price weeks before that date at 11 and weeks from that date at 14,
automatically.

  `Participant history`: session_id, participants, starts

Genuinely simpler than Terms in one respect, worth being clear about so
the two don't get confused: NO `ends` column. Terms needs closed spans
because a school can have a gap (half term - not running at all between
two active periods). A participant count never has a gap; there is always
some number of kids. So the rule is just "the newest row that has started
wins" - unlike Terms, you never close off the old row when adding a new
one.

Same "one source of truth" principle already locked in for Terms: the
LIVE participants figure shown today should be looked up from this same
history (whichever row's `starts` covers today), not kept as a second,
independently-editable number that could quietly disagree with the log.

**Real complexity, flagged rather than glossed over:** `coach_groups` and
`venue_groups` already derive from participant count via `COUNTIFS` - how
many groups a school's kids split into. Once that count can change
mid-term, those formulas need to become date-aware too, not just headline
revenue. This is not separate work from the date-range financial engine
already logged below - it is one more thing that engine has to account
for, not a second project.

**Coach rate history - same pattern again, raised by David's own example
(Sam to £17/hr): a past session's cost should reflect the rate that was
actually in force then, not get rewritten every time someone gets a rise.**

  `Coach rates`: coach_name, rate_type (hourly/day), amount, starts

Same rule as Participant history, no `ends`: the newest row for a coach
and rate_type that has started wins. A rate never has a gap either - there
is always some number a coach is paid - so this is the same shape, not a
new one to learn.

**Why this cannot be "right" from a formula alone, whichever tab it lives
on - worked through properly, not glossed over.** The Coaches tab
(`hourly_rate`/`day_rate`) and the Financials tab (`coach_cost`) are both
LIVE snapshots: whatever they say is what they say right now, today, full
stop. A live formula has no memory - it cannot know what Sam's rate was in
September once October's rate has overwritten it, no matter which tab it
reads from. So a `Coach rates` log fixes half the problem (there is now
somewhere a date-aware calculation CAN look up "what was Sam paid on this
date") but not the other half: nothing today writes a session's cost down
permanently at the rate in force when it happened.

The other half is the coach hours report, already above, which was already
going to need this exact property for a different reason - "the report
must WRITE somewhere durable, not just display a number." The same
archive that stops the week picker's reconstruction being the only record
is the thing that has to freeze each period's coach cost at the rate that
applied then. Once that report exists and reads `Coach rates` (rather than
"whatever the Coaches tab says today") when it archives a month, a later
rate change can never retroactively change an already-archived period -
because it is no longer a live number, it is a written fact.

**What is actually achievable before that report exists:** the `Coach
rates` tab itself - cheap, useful on its own, and the thing everything
else will read from later. The CURRENT week/month figures the web app
shows are correctly the CURRENT rate (same as everything else "live" in
this app - a snapshot is meant to reflect now, not preserve history), so
raising Sam's rate today is still the right, one-place edit for today's
numbers. What is not achievable yet, and needs the coach hours report
first, is a *guarantee* that a future rate change never quietly reshapes a
month that has already closed.

**Overheads — a third cost category, alongside coach and venue cost.
BUILT AND IN THE PREVIEW**, as a first pass David can see the shape of, not
the final production version. David's own examples: admin, payment
processing fees, insurance. These do not belong to a session the way coach
and venue cost do - insurance is not a fact about Tuesday at Freemen's, it
is a fact about the business - so it lives in its own tab, not bolted onto
Sessions or Financials as another per-session column.

What's actually built: `overheadsCsvUrl` (optional, like everything else),
loaded only after the Financials password succeeds. The Combined card in
the Financials summary gains "Session profit" and "Overheads" lines and a
new headline - net profit after overheads, captioned so it's never
mistaken for the old figure. Evening and Day cards are untouched, since
overheads are a whole-business fact, not a programme one. A one-off due
this period is shown as its own line, not folded into the monthly average
- "Plus one-off this month: New laptop (£650) - not included in the figure
above" - same reasoning as everywhere else in this app: a snapshot and a
total are different questions, don't blend them.

**Real gap, flagged plainly, not fixed:** `overheadsCsvUrl` is NOT
encrypted the way `financials` is - it is only ever fetched after the real
password succeeds, which is the app's behaviour, not actual protection.
The URL itself would sit in config.js in the clear. Before this carries
real numbers it needs the same AES-GCM treatment as `financials` - a
second encrypted blob (same password, its own salt/iv/ciphertext), not a
change to the existing one. Written in a comment above `overheadsCsvUrl`
in config.js too, so it can't be missed by whoever wires up the real tab.

One row shape for both one-off and regular, reusing the convention already
established on `Terms` (blank end = still going, so it is one rule to learn
across the whole workbook, not a new one per tab):

  `Overheads`: item, category, amount, repeats, starts, ends, note

`repeats` blank = a one-off, counted once on `starts`. `repeats` set to
monthly/quarterly/annually = recurring from `starts` until `ends` (blank =
ongoing).

**Flagged, not yet decided:** payment processing fees are not a fixed
amount like insurance - they are a percentage of revenue collected, so they
move with how much money actually came in rather than sitting still like a
subscription. Two honest options when this gets built: model it properly
as a percentage of revenue for the period (more setup, exact), or enter a
rough average monthly figure (simpler, approximate). David's call, not
mine, when the time comes.

**David and Josh's own pay belongs in Overheads too, not per session -
agreed, not yet built.** Both are full-time salaried, not paid per
session, so giving them an hourly rate on the Coaches tab and letting that
get divided across whatever sessions they happen to run produces a false
per-session cost - David's words: "doesn't seem fair to have a false
representation of a session due to inflated hourly." Same reasoning as
insurance or admin: their pay is a fact about the business, not about
Tuesday at Freemen's.

**Correction, worked out when David asked exactly which cell to change:**
the Coaches tab rate is NOT what drives a session's headline Coach cost -
every Coach cost figure on the Financials page (the head cards, Custom
filter, the breakdown tables, a single session's own card) reads the
`coach_cost` column straight off the **Financials tab**, per session_id,
regardless of who is on the Coaches tab or what their rate says. The
Coaches tab's `hourly_rate`/`day_rate` only feeds the separate **By coach**
report, where it splits an already-given session `coach_cost` between
however many coaches are on that session.

So the actual two-part plan:
1. **Financials tab** - for every session_id where David or Josh coaches,
   set `coach_cost` to 0. This is the one that changes what the web app
   shows everywhere. If `profit` on that row is typed rather than a
   formula, add the removed coach_cost back into it so profit stays right.
2. **Coaches tab** - zero or blank their `hourly_rate`/`day_rate` too,
   for the same reason as before but a smaller one: it keeps the By coach
   report's own numbers honest, and if either of them ever co-coaches a
   session with someone else, a zero rate correctly shifts that session's
   whole coach_cost onto the co-coach's total rather than splitting it.

Either way, the real figure sits once, correctly, at the business level in
Overheads, exactly like the Overheads work already built.

Trade-off, flagged so it isn't a surprise later: a session where one of
them is the ONLY coach on it will then look artificially cheap - its true
cost is being carried by the Overheads line elsewhere on the page, not
hidden, just living somewhere else. Not worth solving now (would mean
splitting salary back out proportionally by hours worked, real
complexity); only worth building if the simple version turns out to
actually mislead in practice.

**Where it lands:** whole-company profit becomes session profit (revenue
minus coach cost minus venue cost, already correct) MINUS whatever
Overheads says for that period - applied once at the business level, never
per session. This is not a separate build from the financial forecast
below - a forecast that only counts coach and venue cost while ignoring
insurance and admin overstates what the business actually brings in, so
the two land together.

**Flexible financial filtering — David's follow-up, BUILT in the preview.**
Two examples he gave: "all afterschool clubs, 3-4:30pm" and "Monday evening
at Freemen's" (one venue, several different sessions running there).

Built as a "Custom filter" panel on the Financials page, sitting above the
existing programme tree and independent of it: day of the week, a time
window, a venue, any combination. Not a dropdown to drill into like the
tree - a set of filters that combine, so "Monday" + "Freemen's" together is
one query, not two separate views.

**The venue here is deliberately the raw `venue` column, never the
Venues-page alias.** David was explicit about this one: he wants "the
Monday session hosted on the venue Freemen's, not the coaching done at the
school Freemen's" kept apart, not folded together. That is exactly what
`canonicalVenue`/`venueAliases` were already built NOT to do to the
financial formulas (see "One place, two names on the schedule" further
down) - the filter reads `s.venue` straight off the Sessions tab, so the
evening club and the school coaching contract stay two different answers
even though they share a car park. Confirmed working end to end with a
local test fixture: filtering to "City of London Freemen's" finds only the
two evening club sessions there, never the school's PE lesson.

Time-of-day works as a genuine overlap check (a session counts if any part
of it falls in the window), not just a start-time match, so "3-4:30pm"
correctly catches a session that starts at 3:00 as well as one running
3:15-4:15.

**Not yet included: a date range.** "This term", "this year", a custom
date span - that is still the date-range forecast entry below, not built
yet, and still worth keeping as one shared idea: whenever that gets built,
a date range becomes a fifth filter on this same panel rather than a
separate tool, for the same "one mechanism, not two" reason this was
designed this way in the first place.

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

**Confirmed with David directly, worth having in his own words:** if prices
go up in week 10, "banked so far" for weeks 1-9 must NOT move - only the
scheduled remainder should. Without the archive above, "banked so far"
would just be a live recalculation from today's Financials numbers and
would silently reshape past weeks every time a figure changes, which is
the exact false representation he is trying to avoid. So the archive is
not an enhancement to build later - the forecast is not accurate without
it, full stop.

**Same archive as the coach rate history entry above, not a second one.**
Both need the identical thing: write a period's real numbers down once
that period closes, so nothing live can reshape it afterwards. Build the
archive mechanism once, and both the yearly forecast and the coach hours
report read from and write to it - not two separate archives that could
drift apart from each other.

**Revenue and cost run on two different calendars - confirmed directly
with David, and it is NOT the obvious answer, so worth getting precisely
right wherever "this week" or "this term" gets calculated (the head
cards' this-week figure, and later the archive itself).** A family's
monthly subscription is billed the same whether that month's weeks were
3-on-1-off or 4-on - **revenue never drops for a term break or a
cancellation, it always counts at the typical rate.** Coach cost and
venue cost DO drop to zero for a week that genuinely is not happening -
nobody is coaching, no venue is being paid for. Consequence worth stating
plainly since it looks wrong at a glance and is not: a genuine break week
correctly shows HIGHER profit than a normal week, because full revenue
still lands with nothing paid out against it. Already built this way on
the head cards' "This week (actual)" figure (`sessionRunsThisWeek()` now
gates coach/venue cost only, never revenue; `thisWeek.profit` is derived
from revenue minus THIS WEEK's actual costs, not copied from the sheet's
flat profit column). The archive, when built, has to write revenue and
cost through this same split, not treat a session as one on/off switch.

**Overheads do NOT need their own archive - worked through with David,
better than my first suggestion.** A session's Financials figures have no
memory of their own, which is why they need a weekly archive at all.
Overheads is different: it already carries its own `starts`/`ends` per
row, so a term or year total can just sum each overhead's real
contribution against its own dates, directly, with no separate write-once
mechanism needed. Confirmed this avoids the trap of David's own proposed
shortcut ("just subtract at the end") - using TODAY's figure smeared
across a whole year would wrongly apply a rate to months that were
actually charged differently, e.g. a salary rise in January should not
count for the September figure. Fixed shape, reusing the existing "two
spans, no gap needed" pattern already used for Terms and coach rates:

- An ongoing cost that never changes: ONE row, `repeats` set, `starts`
  filled in, `ends` left blank ("still going"). Never re-entered monthly.
- A cost that changes partway through (a pay rise, a renewed premium at a
  new price): close the old row off with `ends`, add a new row from the
  change date, `ends` blank again. Two rows, not a rewrite of the old one.

So the only archive this build needs is the session-level one below -
Overheads is accurate by construction already, once entered this way.

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
6. **Documents to fill in and send back — David's idea, same write door as
   above, not a separate build.** A form attached to something on
   Handbook/Resources (a kit order, a DBS check, whatever needs collecting)
   that a coach fills in and submits, ticks off against their name once
   done, and David gets a copy of. Mechanically the same as feedback and
   holiday requests above - a coach-submitted message through the `doPost`
   door - so it slots in alongside them rather than needing its own
   plumbing. Cheap stopgap available right now, no build needed: a Google
   Form linked from Resources, with an email-a-copy rule turned on, does
   most of this today - it just lives outside the hub's own look rather
   than inside it.

   **The mechanism, worked out so it isn't lost:** a form built into the
   hub submits via `fetch()` to the `doPost` door rather than a normal
   HTML form post (that only works talking to Google's own Forms). Apps
   Script appends the submission as a row on its own tab - one tab per
   form (`Conduct forms`, `New starters`) - which IS David's copy, not a
   copy of one; an email-on-submit rule can also be added so he knows
   without checking. The "ticked off" state is the hub reading that same
   tab back and checking whether a row already matches the coach - present
   means done.

   **A new starter form is a different shape, not a variant of the
   above.** Everything else here ticks off against a coach who already
   exists and has a code; a new starter has neither yet, so their form
   has to be reachable without one (a plain link, not gated behind
   `#me=`), and there is nothing to tick against - the row that lands is
   simply what David reads and acts on afterwards (add them to Coaches,
   run `addCoachCodes` to give them a real link).

   **DECIDED - David's chosen shape: fill in on the hub, PDF lands with
   him automatically.** Of the two levels described (manual copy vs.
   automatic PDF), he wants the automatic one - "that would be ideal."
   So the build target is: coach submits -> Apps Script writes the row
   (the durable record, same tab as always) AND generates a PDF of that
   submission AND emails it to David, all in the same `doPost` call, not
   three separate steps to wire up later.

   OneDrive stays the one caveat: Apps Script cannot write into OneDrive
   directly - different company, no native bridge - so the PDF arrives by
   email, and getting it INTO OneDrive automatically from there is an
   Outlook rule (no code, a few minutes in Outlook's own settings) that
   auto-saves attachments from that sender into a folder. Worth setting up
   once the emails start arriving, not part of the hub/Apps Script build
   itself.

## Open questions

Things I picked or guessed that are David's call:

- ~~Masthead name~~ DECIDED: **"Coaches Hub"**. Done.
- Home opens with **sessions / coaches / venues / days** counts. David:
  happy with the Home section as a concept, still thinking about whether
  these specific stats are the right ones - not a "fix this", a "give me
  a minute".
- ~~Nav order~~ DECIDED: happy with it as is.
- Coach side is **open to anyone with the link**. Fine for now; changes when
  coach codes arrive. **Raised by David, not yet decided:** should the BASE
  link (no code) show only Home and nothing else - Schedule, Venues,
  Handbook, Resources all hidden until a code is entered - rather than
  today's fallback of the whole-team view plus a "got a code?" box?
  Technically simple either way, it is only a change to which nav buttons
  render before identity resolves, not a new mechanism. The trade-off to
  weigh: a coach who has not entered their code yet (new, forgot it, on a
  borrowed phone) currently still has a working schedule to look at; lock
  it to Home-only and they see nothing until they sign in. Same honest
  caveat as always either way - hiding the nav buttons is not real
  security, the published CSVs are still fully readable underneath, it
  only changes what the hub SHOWS. David's separate two points already
  match what is built: entering a code gives that person their own app
  (My week), and an owner code keeps everything - the whole team, every
  schedule, Financials - never narrowed to "my week". No change needed for
  those two.
- Venues: bare name and a Directions button for venues with no detail.
  DECIDED - "should all get address and information eventually." Not a
  quick fill-in job (16 venues), but the direction is settled.
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
