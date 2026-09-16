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
| Financials | The Financials tab, behind the password — unchanged |

Financials sits apart from the others in the nav, with a padlock, and is
still never fetched until the password has been accepted.

Sections are linkable: `#venues`, `#handbook`, `#schedule`. Old
`#coach=Name` links still work and still land on that coach's week, so
anything already shared with a coach keeps working.

## Turning on the two new sections

Both are optional and both are hidden until their tab is published, so
nobody ever sees an empty page.

1. Run **Add hub tabs.gs** in the spreadsheet. It creates an `Info` tab with
   starter rows to edit, and a `Venue info` tab pre-filled with every venue
   already on the schedule.
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
