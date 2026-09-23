# Okara components (React)

The Okara Design System as React components, for the React rewrite of the tracker.
Figma: Okara Design System `7glNMA9d7iVJFf2CvyrzAb`, screens in Cost-tracker `jHurei4Bb53jEqSosr1Vt5`.

**Rule for the rewrite:** the components render the same markup and class names as the legacy page
(`src/legacy/tracker.template.html`), so `okara.css` styles both and nothing moves by a pixel.
Design changes come after the switch, one Figma frame at a time.

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
- `npm run parity` (gallery running on port 3300): every case marked "parity" is compared with the
  same component on the legacy page, DOM and pixels. 21/21 match as of Sept 23, 2026.
- `npm run visual` then `npm run visual:compare -- <new dir>`: whole-page screenshots, 38 states x desktop/mobile.

## Known design-system gaps (not fixed on purpose, the rewrite keeps parity)

1. The Add entry panel resizes components through page CSS (`#add-panel .ds-dd--md` is 48px tall, 40px
   elsewhere; the panel hint is 14px, 12px elsewhere). In the DS these should be Size variants.
2. A removed row's amount is meant to be struck through, but the line doesn't show: `.money` is inline-flex,
   and text-decoration doesn't reach inside it.
3. Year budget amounts show in US format (`1163.59`) instead of European.
4. The year-delete button (Micro round button) is clipped at the top by the tab row.
5. The closed side panel's shadow shows on the right edge of the page.
