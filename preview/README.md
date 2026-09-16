# Preview — the Team Hub layout

This folder is a **complete second copy of the site**, served at
`…/Coach-allocation-/preview/`. The live site at the root is untouched by
anything in here, so this can be poked at, broken and changed without any
risk to what the team is using.

Both copies share `../config.js` and `../je-logo.png`, so there is one set of
sheet links and one password — no duplication of the encrypted block.

## What is different from the live site

The live site opens straight into a coach dropdown. This one opens on a
**home page** and treats the schedule as one section among several:

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

`coachCodes` in `config.js` does the same thing without the sheet, which is
what the preview is using at the moment.

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

## Promoting it to the live site

When the layout is signed off, move these three files up a level, delete the
folder and drop the preview banner:

```
git mv preview/index.html preview/app.js preview/style.css .
git rm -r preview
# then remove the .preview-flag div from index.html
```

The paths `../config.js` and `../je-logo.png` become `config.js` and
`je-logo.png` again.
