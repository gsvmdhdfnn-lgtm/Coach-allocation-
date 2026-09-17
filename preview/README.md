# Preview — where the next change gets built

This folder is a **complete second copy of the site**, served at
`…/Coach-allocation-/preview/`. The live site at the root is untouched by
anything in here, so this can be poked at, broken and changed without any
risk to what the team is using.

As of the last promotion, the two copies are identical — everything below
is already live. This folder stays around as the staging area for whatever
gets built next; once it's signed off, `index.html`, `app.js` and
`style.css` get copied up to the root again (see the root `README.md`'s
"Building the next change" section for the exact steps), and this folder
moves ahead of live again.

Both copies share `../config.js` and `../je-logo.png`, so there is one set of
sheet links and one password — no duplication of the encrypted block.

## Sections

| Section | Where its content comes from |
| --- | --- |
| Home | Counts from the Sessions tab |
| Schedule | Sessions + Coaches tabs — unchanged from the live site |
| Venues | The venue names on the Sessions tab, plus the optional **Venue info** tab |
| Handbook | The optional **Info** tab |
| Resources | The optional **Resources** tab |
| The week picker | The optional **Calendar**, **Changes** and **Terms** tabs |
| Financials | The Financials tab, behind the password — unchanged |

Financials sits apart from the others in the nav, with a padlock, and is
still never fetched until the password has been accepted.

Sections are linkable: `#venues`, `#handbook`, `#schedule`. Old
`#coach=Name` links still work and still land on that coach's week, so
anything already shared with a coach keeps working.

## Turning on the two new sections

Both are optional and both are hidden until their tab is published, so
nobody ever sees an empty page.

1. Run **Add hub tabs.gs** in the spreadsheet. It creates an `Info` tab and a
   `Resources` tab with starter rows to edit, and a `Venue info` tab
   pre-filled with every venue already on the schedule.
2. **File → Share → Publish to web**, publish each tab as CSV.
3. Paste the links into `../config.js` as `infoCsvUrl`, `venueInfoCsvUrl`
   and `resourcesCsvUrl`.

### What the Resources tab looks like

| section | order | title | description | url | image_url |
| --- | --- | --- | --- | --- | --- |
| Session plans | 1 | Second Half, weeks 8–14 | The theme each week. | | …/poster.jpg |

`url` is what the card opens when tapped; `image_url` puts a picture on it.
Either, both or neither — a row with no link is still a readable card.

For a picture to show, `image_url` has to be something a browser can load
directly. **A normal Google Drive sharing link will not work.** If the file
is in Drive and set to "Anyone with the link", take the ID out of the
sharing link and use `https://drive.google.com/thumbnail?id=THE_ID&sz=w1200`.
An image hosted on joshevans.co.uk works as-is and is steadier.

A card whose image fails to load drops the picture and keeps the card, so a
moved or re-privatised file leaves something usable rather than a broken
icon.

## The week picker

`My week` carries a dropdown: this week and the next three. Picking a week
rebuilds it from the base schedule plus whatever the `Changes` tab says
happened that week, and shows the week's theme from `Calendar`.

**`Calendar`** — one row per week. `week_commencing` is the Monday.
`running` set to `NO` closes the whole business (Christmas); a single
school's half term is a `Changes` row instead, because it only affects them.
`theme` is what the term poster says that week is about.

**`Changes`** — the exceptions, and only the exceptions. `type` is
`cancelled`, `cover` or `extra`. Fill in **one** target and leave the rest
blank — whichever is filled in is what the row applies to:

| target | applies to |
| --- | --- |
| `session_id` | just that session |
| `venue` | everything at that place that week |
| `client` | everything for that school that week |
| `coach_out` | everything that coach was down for that week |

So a coach away for a week is **one row**, not eight, and a school's half
term is one row, not five. That is the whole design: a row nobody can be
bothered to write is a week the hub gets confidently wrong, which is worse
than a blank page — so the rows have to be cheap.

For `extra`, fill in `day`, `time`, `venue`, `session_name` and put the coach
in `coach_in`; there is no base session to point at.

### What a coach sees

Anything that is not simply "yours, as usual" gets a coloured banner across
the top of the card, before the session name. A small tag among the age
group and category tags got skimmed straight past, and for "do not turn up"
that is no good.

| | banner | the card |
| --- | --- | --- |
| **Cancelled** | red — *Cancelled — not happening*, with the reason | greyed, name and time struck through |
| **Covered** | amber — *Sam is covering · You are not needed* | red-free, full contrast, amber stripe |
| **Covering** | lime — *Covering for Tom* | lime stripe |
| **One-off** | blue — *One-off — not on the usual schedule* | blue stripe |

The headline carries the fact — "Sam is covering", not "Covered" — because a
coach skimming on a phone reads four words, and a label alone does not tell
them whether to turn up.

Covered sessions are deliberately **not** faded. Fading makes them harder to
read, which is the opposite of what "someone else has this" needs to be; a
stripe does that job instead. They stay on the list (vanishing reads as
"deleted") but do not count towards the coach's sessions for the week.

Without those two tabs there is no picker and no theme, and the schedule is
the plain base week exactly as before.

## Two schools, two calendars — the Terms tab

`Changes` is for something unpredictable: a coach's day off, a school
asking for a one-off, a hall being double-booked one week only. It is the
wrong tool for anything that is simply how a school's own calendar works,
known well in advance — a term starting on a different date to everyone
else's, or a half term. Both of those are calendar structure, not an
exception, and a coach should never see "Cancelled" for a week that was
never going to happen in the first place — that word means something was
due and didn't happen, and half term was never due.

**`Terms`** holds both: one row per span, and **a school can have more than
one row**.

| school | starts | ends | note |
| --- | --- | --- | --- |
| Dane's Hill | 2026-09-22 | 2026-10-16 | |
| Dane's Hill | 2026-11-02 | | Back after half term |

That is not two facts about Dane's Hill fighting each other — it is one
school with a gap in the middle. A half term is represented exactly the
same way a late start is: as the *absence* of a span, not as a special
column or a second mechanism. `school` matches a session's `client` column,
or its `venue` when `client` is blank — the normal case for a day school,
where the venue and the school are the same thing. A blank `ends` means
that span is still going. **A school with no row at all is not restricted**
— it runs whenever the base schedule already says, exactly as today. Most
schools will only ever need one row, if any.

### What a coach sees

A session outside every one of its school's spans does not appear as a
card — there is nothing to cancel, because it was never part of that
week's plan. Instead, one quiet line appears under the coach's summary,
worded from whatever the `note` column says:

> Not running this week: Daneshill — Back after half term — back 5 Oct

Deliberately **not** a banner. Cancelled and covered are alarms — something
that would normally happen isn't, and the coach needs to know why. A school
on a break, or not yet started, is not an alarm; it is simply not part of
the plan yet, the same as any other week without a Tuesday session. Once
the date passes, the session reappears on its own — no row to remember to
remove.

### Where this is going

The financial figures currently assume every session runs 4.3333 weeks a
month, every month. Once `Terms` exists, that stops being a flat assumption
and becomes actual weeks — a school that runs 34 weeks a year gets costed
as 34 weeks, not 52, with its half term correctly not counted either. The
coach hours report reads the same tab: hours for a week a school's term did
not cover are not counted, because the session never happened. Neither is
built yet; `Terms` is the piece both will read once they are.

## Overheads — costs that aren't a session's

Coach cost and venue cost belong to a session. Insurance, admin, payment
processing fees don't — they're facts about the business, not about
Tuesday at Freemen's. So they get their own tab rather than another column
bolted onto Sessions or Financials.

**`Overheads`** — one row shape covers both one-off and regular costs,
reusing the same "blank end = still going" rule already used on `Terms`:

| item | category | amount | repeats | starts | ends | note |
| --- | --- | --- | --- | --- | --- | --- |
| Public liability insurance | Insurance | 840 | annually | 2026-01-01 | | |
| Accounting software | Admin | 29 | monthly | 2026-01-01 | | |
| New laptop | Admin | 650 | | 2026-03-14 | | One-off |

`repeats` blank = a one-off, counted once on `starts`. Set to
weekly/monthly/quarterly/annually = a regular cost, converted to both
weekly and monthly figures the same way session revenue already is.

**Where it shows:** only on the **Combined** card in the Financials
summary, never on Evening or Day individually — overheads are a
whole-business fact, not a programme one. The card gains a "Session
profit" and "Overheads" line, and its headline figure becomes **net profit
after overheads**, captioned as such so it's never mistaken for the same
number as before.

**One-offs are shown, not blended in.** A one-off due this month appears
as its own line — "Plus one-off this month: New laptop (£650) — not
included in the figure above" — rather than silently folded into a
monthly average, which would turn a real event into a made-up number. Same
reasoning as keeping a snapshot distinct from a total everywhere else in
this app.

**Not yet decided, flagged for later:** payment processing fees aren't
really a fixed amount like insurance — they're a percentage of whatever
revenue came in, so they move rather than sit still. For now, enter a
rough average monthly figure. Modelling it properly as a true percentage
of revenue is a refinement for whenever the financial forecast work
happens, not something to guess at today.

**Security note, read before using real figures.** Unlike the Financials
URL itself, `overheadsCsvUrl` is **not** encrypted — it only happens to be
fetched after the Financials password succeeds, which is the app's
behaviour, not real protection. The URL would still sit in `config.js` in
the clear. Real overhead figures are exactly the kind of thing the
password exists to hide, so this wants the same AES-GCM treatment
`financials` already has before it carries real numbers — see the comment
above `overheadsCsvUrl` in `config.js`.

## "This week (actual)" — the head cards, made honest about right now

The main figure on each Financials head card (Evening, Day, Combined) has
always been, and still is, a **typical** figure - "what does this normally
bring in per week/month." That never changes with the calendar, on
purpose: it answers a steady-state question, not a this-instant one.

**"This week (actual)"** is a second, separate figure on the same card,
answering a genuinely different question: what does this actually bring
in *this real week*?

**Revenue and cost are NOT gated the same way - confirmed directly with
David, worth being precise about since it is not the obvious answer, and
it depends on `period`, not just on whether the session is running.**

- **`coach_cost` and `venue_cost` always drop to £0** for a week that is
  genuinely not happening, whatever the billing period - nobody is
  coaching and no venue is being paid for either way.
- **`monthly`** - a smoothed subscription, billed the same whether that
  month's actual weeks were 3-on-1-off or 4-on. Revenue keeps counting
  through a mid-season gap like half term. It only actually drops to £0
  outside the WHOLE season - before the school's first Terms span starts,
  or after its last one ends (with no span left open-ended).
- **`weekly`** - pay as you go, no smoothing at all. Revenue only counts
  for a week the session is genuinely running - same gating as coach and
  venue cost, not the smoothed monthly treatment.

So this figure's profit is not copied from the sheet's profit column - it
is worked out fresh as revenue minus THIS WEEK's actual costs, and a real
mid-season break week on a `monthly` session correctly shows a HIGHER
profit than usual: full revenue, nothing paid out. That is a true fact
about how the business runs, not a bug.

The two figures are never blended into one number - a coach or David
glancing at the page should never have to guess which question a figure
is answering. Always weekly, regardless of whether the card is showing
per-week or per-month, since "this week" isn't a monthly idea.

**What it depends on:** `Terms` (a school's own term dates) and `Changes`
(this week's one-off cancellations) - the exact same data already used for
the Schedule page's week picker, nothing new to fetch or fill in. A venue
or school with no Terms rows is treated as always running, same as
everywhere else.

**What this is not:** the yearly/termly forecast David asked about
("£38,400 banked, £61,200 still to come") is a bigger, separate build -
this is the smaller foundation piece it sits on top of, not the forecast
itself.

## Period totals — pick any date range, honestly split

A new panel on the Financials page, above Custom filter: pick a from and
to date, and it shows what that period actually earned - split into two
figures that are never blended into one:

- **Actual** - weeks strictly before this real week, summed straight from
  the **P&L archive** (see below). Locked, permanent, never recalculated -
  a price rise or a headcount change next month cannot reach back and
  reshape a week that has already happened.
- **Scheduled** - this week and any future week inside the range, worked
  out fresh from today's Financials figures (today's participants,
  today's prices) - the exact same calculation the head cards' "This week
  (actual)" line already uses. An honest estimate, clearly labelled as
  such, not a promise - it becomes "Actual" on its own, automatically,
  once each of those weeks is archived for real.

Pick a range that's entirely in the past and Scheduled is naturally zero;
pick one stretching into next term and Scheduled naturally grows to cover
it. Nothing to configure - it works out which side each week falls on
from today's date alone.

## The P&L archive - a permanent weekly record

**`Weekly P&L archive.gs`** (delivered separately, not part of this repo -
kept out of a public repo the same way the other sheet-management scripts
are) writes one row per session, per week, once that week has genuinely
finished - never a guess, never backfilled. Run once by hand
(`archiveLastWeek`) to create the tab and archive the most recently
finished week, then run `setUpWeeklyArchiveTrigger` once - after that it
archives itself automatically every Monday morning, forever, with no
further action needed.

It applies the exact same rules as "This week (actual)" on the head
cards, so the two never disagree:

- Coach cost and venue cost drop to zero for a week a session was not
  actually happening - out of Terms, or cancelled via Changes.
- A `monthly`-billed session keeps its revenue through a mid-season gap
  like half term (smoothed subscription) - it only stops outside the
  WHOLE season, before the first Terms span starts or after the last one
  ends with nothing left open.
- A `weekly`-billed session is pay-as-you-go - revenue only counts for a
  week it actually ran, same as cost.

Columns: `week_commencing, session_id, session_name, venue, client,
category, programme, participants, revenue_gross, revenue_net,
coach_cost, venue_cost, profit`.

**Published as CSV like every other tab** (`archiveCsvUrl` in
`config.js`), fetched only after the Financials password succeeds, same
as Financials and Overheads. The web app only ever reads it - it never
writes to it, and never recalculates an already-archived week.

**Never reset or clear this tab**, including at a school-year boundary -
it is meant to accumulate forever, giving years of real history to look
back on. A new academic year just means adding the next set of Terms
rows before the old ones run out, same as any other year; the archive
carries straight across the boundary without any special handling.

## Custom filter — the Financials page, sliced any way

The programme tree above (Evening/Day → category or school → session name)
is one fixed way of grouping the same sessions. **Custom filter**, sitting
above it on the Financials page, is a second, independent tool for cutting
across that tree instead of following it: pick any day of the week, a time
window, a venue, or any combination, and it totals whatever matches.

It exists for questions the tree can't answer on its own — David's own
examples:

- *"How does Monday evening at Freemen's do?"* — a day plus a venue.
- *"How do all the afterschool clubs do, roughly 3-4:30pm?"* — a time
  window on its own, regardless of venue or school.

**The venue list here is deliberately the raw `venue` column, not the
Venues-page alias.** City of London Freemen's is two different pieces of
business on the Sessions tab — the school we coach for (`client`) and the
pitches we hire for the evening club (`venue`) — and the alias in
`venueAliases` that folds them into one Venues card on purpose does **not**
apply here, for the same reason it doesn't apply to the programme tree:
filtering by "venue" has to mean the evening club, not the school contract,
or the two get counted as one thing they aren't. See "One place, two names
on the schedule" below for the full story.

The result shows the same figures as everywhere else on this page — net
revenue, coach cost, venue cost, profit — plus the list of sessions that
matched, so it's obvious what got counted and what didn't.

## "Their own space" — coach codes

Each coach gets a six-character code. Their link is the site address plus
`#me=THEIRCODE`. Opening it:

- signs them in and **takes the code back out of the address bar**, so a
  screenshot of the page does not hand it to anyone
- remembers them on that phone, so the link is only needed once
- opens straight on **their week** — no dropdown of twelve names
- relabels Schedule as **My week**, shows their own counts on the home page,
  and drops the Financials button entirely

An `owner` (David, Josh) is greeted by name but keeps everything: the whole
team, the coach dropdown and the financial side. "Not you?" on the home page
clears it.

Someone with no code sees what the hub has always shown — the whole team —
plus a box to enter one.

Codes come from a `code` column on the **Coaches** tab, with `owner` beside
it. Run **addCoachCodes** in `Add hub tabs.gs` to create both columns and
fill in a code for anyone without one; existing codes are never overwritten,
so nobody's link breaks. The alphabet has no `0`, `O`, `1`, `I` or `L` in it,
and nothing is derived from the name — a coach should not be able to guess a
colleague's.

`coachCodes` in `config.js` does the same thing without the sheet. Not set
up yet — it currently ships empty, so everyone lands on the whole-team
view; see the root `README.md` for how this behaves until real codes are
added.

### What a code is not

It decides what the hub **shows**. It is not a lock. The schedule is a
published CSV, so a coach who went looking could read the whole thing —
same honest caveat as the financials password, only weaker.

For a rota that is fine; coaches cover for each other. Anything genuinely
private — feedback, most obviously — has to come through an Apps Script
`doGet` that checks the code server-side and returns only that person's
rows, which is a different piece of work and is on the roadmap.

### One place, two names on the schedule

City of London Freemen's appears twice: once as the school we coach for and
once as the pitches we hire in the evening. They are two different pieces of
business, so they are two different strings on the Sessions tab, and the
financial formulas depend on them staying that way.

For directions they are one car park. Put the spare spelling in the
canonical row's `also_known_as` cell (comma-separated if there are several)
and the two fold into one card:

| venue | also_known_as |
| --- | --- |
| City of London Freemen's School | City of London Freemen's |

Nothing is renamed. The Sessions tab, the Financials tab and every formula
see exactly what they saw before; only the Venues section groups them. The
same can be done in `../config.js` under `venueAliases` if you would rather
not publish the tab yet.

`Venue info` is deliberately a **separate tab from `Venues`**. The `Venues`
tab feeds the financial formulas and its column A holds composite keys, not
plain venue names — nothing here goes near it.

### What the Info tab looks like

| section | order | title | body |
| --- | --- | --- | --- |
| On the day | 1 | If you are running late | Call the office on 01234 567890. |

`section` groups the cards, `order` sorts within a section. In `body`, a
blank line starts a new paragraph, lines beginning with `-` become a
bulleted list, and phone numbers, email addresses and web links become
tappable.

## Promoting a change to the live site

When a change here is signed off, copy the three files up a level rather
than moving them — this folder stays in place as the staging area for
whatever comes next:

```
cp preview/index.html index.html
cp preview/app.js app.js
cp preview/style.css style.css
```

Then, in the copied `index.html`:

- remove the `.preview-flag` div
- remove the `demo-content.js` script tag (and don't copy the sample CSVs
  or sample poster — the real tabs are already wired into `config.js`)
- change `../je-logo.png` to `je-logo.png` and `../config.js` to
  `config.js`
- re-stamp the `?v=` query params on `style.css`, `config.js` and `app.js`
  to the current commit hash

Test the result before pushing — in particular that the site still works
sensibly with `coachCodes` empty (a coach picks their name from the
dropdown rather than landing on a personalised link).
