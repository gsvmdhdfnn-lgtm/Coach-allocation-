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
5. **Decide whether to promote the preview** over the live site
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
9. **Add an `Ideas` tab** and show it in the hub behind the Financials
   password — agreed. Same pattern as the Handbook, just gated, so David can
   add a row from his phone in the Sheets app and both he and Josh see the
   list. Replaces this file as the place ideas get captured; this file stays
   as the record of what is decided and built.

## Next — the parked build

**The calendar and the change log.** The *reading* half is built and in the
preview: the week picker, the theme, and cancellations, cover and one-offs
applied to a coach's week. What is left is the financial half — using the
same calendar so monthly figures stop assuming 4.33 weeks of everything, and
the coach hours report that reads the same change log.

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
- The week picker runs **this week forward only**. Should coaches be able to
  look back at past weeks? Left out for now; nothing depends on it until the
  hours report, which reads the sheet rather than the picker.

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
