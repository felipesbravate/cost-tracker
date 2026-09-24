# Okara components (React)

The Okara Design System as React components, for the React rewrite of the tracker.
Figma: Okara Design System `7glNMA9d7iVJFf2CvyrzAb`, screens in Cost-tracker `jHurei4Bb53jEqSosr1Vt5`.

The components render the markup and class names the legacy page used, so `okara.css` (moved from it) styles them
unchanged. Design changes happen here, one Figma frame at a time.

| Component | Figma | File |
|---|---|---|
| Icon (145 icons, tree-shaken named exports in `icons.js`) | Icons 85:1268 | `Icon.jsx` |
| Money (Value: Euro icon + figure) | Value | `Money.jsx` |
| Button (primary / secondary / tertiary; medium / small / tiny), Round button, Action link | 41:119, 52:629, 106:3611 | `Button.jsx` |
| Segments / Sub-segments | 30:98, 69:900 | `Segments.jsx` |
| Year add button, Tab (year), Month selector | 59:850, 53:801, 4:171 | `Nav.jsx` |
| Label (neutral chip; positive / negative / warning with icon) | 211:859 | `Label.jsx` |
| Entry counter, Tooltip entry item, Entries tooltip | 146:5252, 144:4426 | `Entries.jsx` |
| Card, Divider, KPI card, Expense card, Meter, Breakdown row | 28:68, 130:3844, 124:3667 | `Data.jsx` |
| Toast + `useToast()` | 173:6658 | `Toast.jsx` |
| Dropdown (trigger, grouped list, keyboard, hidden native select) | 182:6851, 183:6858, 182:6850 | `Dropdown.jsx` |
| Field, Field group | Input 71:1093 | `Field.jsx` |
| Panel header | 52:3443 | `Panel.jsx` |

## Checking them

- Gallery: `npx next dev`, then open `/dev/components` (404 in production).
- During the rewrite, a parity test compared 21 components with the legacy page (DOM and pixels): 21/21 matched.
  It was removed with the legacy page (see git history, `tests/ui/parity.py`).
- `npm run visual` then `npm run visual:compare -- <new dir>`: whole-page screenshots, 38 states x desktop/mobile.

## Known design-system gaps

1. The Add entry panel resizes components through page CSS (`#add-panel .ds-dd--md` is 48px tall, 40px
   elsewhere; the panel hint is 14px, 12px elsewhere). In the DS these should be Size variants.

Fixed Sept 23, 2026: Year budget amounts in European format, the year-delete button no longer clipped, no panel
shadow on the page edge when the panels are closed, strike-through on removed rows.

## Okara Illustrations

`illustrations.js` is the Okara Illustrations library: all 109 drawings of the Figma Illustrations file
(ksgSp0pN0PrjODsWy1q1se), one colour, drawn with `currentColor` (surface/dark). It is generated. Don't edit it by hand:
`node scripts/sync-illustrations.mjs <combined-export.svg>` (the header of that script explains how the export is made).
Import only what a screen uses (`import { trashCan } from '../ui/illustrations.js'`), so the rest stays out of the bundle.
Render with `<Illustration art={trashCan} width={64} />` (the height follows the drawing's proportions).
The gallery (`/dev/components`, case `illustrations`) shows them all with their code names.
