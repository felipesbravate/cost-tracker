# Decisions

- **Real data stays out of Git**, even encrypted: Git history is permanent, a future key leak would expose it forever.
  Real data lives in the encrypted database and is loaded by `npm run import` from an ignored folder.
- **Server-side envelope encryption** over browser-side E2EE, so receipts can be read by Claude and accounts can be recovered.
- **Service-role-only database access**: the browser never queries Supabase, so RLS misconfiguration cannot leak rows.
- **Legacy UI kept as a served template** with a shim, to preserve the design system and behaviour. Two behaviour
  changes for multi-user: new accounts start with the current year (no sheet history) and an item exists once an entry
  is logged for it.
- **Logic in dependency-free ESM** (`src/lib`) so it is unit-tested without installing anything; framework glue (`app/`, `src/server`) is thin.
- **The document reader always proposes a category, and says how sure it is.** Each row carries `certainty` ("sure" or "guess").
  Anything that is not "sure", or that had to be moved to another group, shows a "?" chip in the review and a count under the
  list. Guesses do not block Submit; choosing a category (even the proposed one) clears the mark. The mark is display-only and
  is never saved with the entry. Revisit if wrong categories still get through: the next step would be to block Submit until each guess is confirmed.
- **From the 25th of December, January of the next year is open for entries.** The date field then allows dates up to 31 January
  of a year that does not exist yet, and the first entry dated there creates the year (currency of the latest year, categories copied
  from the nearest year, no starting budget). Only that January is opened; any other date in a missing year is still refused, and
  "+ Add year" with its starting budget stays the way to plan a year ahead. Within existing years, any month was already allowed.
- **"Month and year" picks the month an entry is booked in; the date only has to not be later than it.** Manual entries and document
  reviews both have a Month and year dropdown (every month of every existing year, plus January of the next year from 25 December).
  An entry dated after the month it is added to is refused ("the date of the entry doesn't match the month and year selected", e.g.
  13/09/2026 into August 2026). Dated in that month or an earlier one is accepted, so a month counted from the 25th, 28th or 30th
  works without a fixed rule (25 Sep into October). The entry keeps its own date; only its month and year come from the dropdown.
  Until the person picks a month by hand, the dropdown follows the date, so nothing changes for anyone who ignores it. In a
  document review the dropdown starts on the latest month among the dates read, and one line under the list says how many entries
  are dated in another month. Revisit if entries dated several months before the selected one turn out to be picked by mistake: the next
  step would be to accept only the same or the next month.
- **The Add entry panel follows the Figma frame exactly.** An earlier commit swapped the Type controller (Segments + Sub-segments) for
  a dropdown; that was a deviation and is reversed. The manual form now reads: Type controller (Income, Savings/Investment, Expenses,
  then Fixed, Variable, Additional, Extra for expenses), Month and year, Description, Category | Sub-category, Date | Amount, 8 apart (Cost-tracker 174:15081).
  "Type" in the form is the item (Rent, Salary...). Income and Savings/Investment have no Category, so their Type dropdown takes the full width
  (the frames only show Expenses; check that with the designs).
- **A category with a single sub-category selects it for you.** Labels follow Cost-tracker 174:15087: "Month and year" (was "Add to") and "Sub-category" (the item dropdown, was "Type"); the label above the switchers stays "Type". Auto-select applies to expense categories only; Income and Savings/Investment have no Category level, so their list is left for the person to pick.
