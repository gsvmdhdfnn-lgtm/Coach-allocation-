# Team Hub — what's done, what's next, what's still a question

Kept current as we go. The point of it is that nothing agreed in a
conversation gets lost, and that anyone picking this up later — David, Josh,
or me in a fresh session — can see where things stand without re-reading
everything.

Last updated: 16 September 2026

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
- Sample handbook and venue text so the empty sections can be judged

## Next — tomorrow, at the laptop

1. **Run `Add hub tabs.gs`** — creates the `Info` and `Venue info` tabs
2. **Publish both as CSV**, links into `config.js`
3. **Write the handbook** — the non-negotiables first, then the rest
4. **Fill in `Venue info`** — the Freemen's alias, then addresses and postcodes
   (without them, Directions is a name search and is weak for the
   single-word venues like Milbourne and Parkside)
5. **Decide whether to promote the preview** over the live site

## Next — the parked build

**The calendar and the change log.** Agreed in principle, not started. The
strongest item on the list, because everything financial gets more accurate
and two later features depend on it.

- A `Calendar` tab: which weeks each session actually runs (half term, term
  dates), so monthly figures stop assuming 4.33 weeks of everything
- A `Changes` log: the exceptions only — a night off, a swap, a cover, a
  one-off like the school asking for 1–2pm this week
- An optional `date` column on Sessions for genuine one-offs

The principle we settled on: **log the exceptions, not everything.** There is
a base schedule and it is mostly right.

## After that, in order

1. **Coach hours report** — what each coach actually worked, for checking
   invoices. Needs the calendar and change log first.
2. **Coach identity** — a code each. Small, but it is the hinge: it turns
   "the schedule" into "my week" and it is a hard requirement for feedback.
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
