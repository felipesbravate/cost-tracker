# Decisions

- **Real data stays out of Git**, even encrypted: Git history is permanent, a future key leak would expose it forever.
  Real data lives in the encrypted database and is loaded by `npm run import` from an ignored folder.
- **Server-side envelope encryption** over browser-side E2EE, so receipts can be read by Claude and accounts can be recovered.
- **Service-role-only database access**: the browser never queries Supabase, so RLS misconfiguration cannot leak rows.
- **Legacy UI kept as a served template** with a shim, to preserve the design system and behaviour. Two behaviour
  changes for multi-user: new accounts start with the current year (no sheet history) and an item exists once an entry
  is logged for it.
- **Logic in dependency-free ESM** (`src/lib`) so it is unit-tested without installing anything; framework glue (`app/`, `src/server`) is thin.
