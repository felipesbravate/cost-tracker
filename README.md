# Cost tracker (multi-user)

Monthly earnings, spending, savings and investments, with per-user accounts, admin approval and end-to-end
encrypted storage. Next.js route handlers + Supabase (Auth + Postgres). EUR by default, European number format.

## How it works

- The tracker UI is React (`src/tracker/`, served at `/` by `app/page.jsx`), built from the Okara Design System
  components in `src/ui/`. It loads everything from `/api/*`; the page HTML carries no data.
- **Every document is encrypted on the server** with AES-256-GCM using a per-user key, and that key is itself
  wrapped by a master key that lives only in your host's environment. The database holds ciphertext only.
- The browser never talks to Supabase tables. RLS is on with no policies, so even the public keys can read nothing.
- New accounts are **pending** until an admin (`ADMIN_EMAILS`) approves them.
- Receipts and statements are read once by the Anthropic API and are **never stored**.

## Setup (about 20 minutes)

1. `npm install`   (also copies pdf.js into `public/vendor/pdfjs`)
2. Create a Supabase project. In the SQL editor run `supabase/migrations/0001_init.sql`.
   Authentication -> URL configuration: set the Site URL to your `APP_ORIGIN` and add `APP_ORIGIN/auth/callback` to the redirect URLs.
3. `npm run gen-key` and store the output as secrets. **Back the key up offline**: losing it makes all data unrecoverable.
4. Copy `.env.example` to `.env.local` and fill it in.
5. `npm run dev`, open the app, sign in with an `ADMIN_EMAILS` address.
6. Deploy (Vercel or any Node host) with the same environment variables.

## Loading your own history

Keep your export **outside Git** (the `/private` folder is ignored):

```
npm run import -- --user you@example.com --file ./private/monthly_costs_data.js --dry-run
npm run import -- --user you@example.com --file ./private/monthly_costs_data.js
```

Sign in once with that email first. Each non-zero month cell becomes one entry; per-item notes are not imported.

## Without Supabase (local development and tests)

```
npm run dev:mock        # http://127.0.0.1:3100, fake sign-in (any email; admin@example.com is admin), in-memory
npm test                # unit tests, no dependencies
python3 tests/e2e/e2e.py   # browser test against the mock server (needs Python Playwright + Chromium)
```

## Before every commit

`git config core.hooksPath scripts/hooks` installs a hook that runs `npm run scan` (blocks keys, personal emails,
`.env*`, the sheet export) and the unit tests.

See `SECURITY.md` for the threat model and what is and is not protected.

## Checking the UI

- `npm test`: unit tests.
- Start the app for the browser tests: `npx next build && npx next start -p 3300`, then
  `npm run e2e` (behaviour, against the in-memory mock backend) and
  `npm run visual -- /tmp/shots && npm run visual:compare -- /tmp/shots` (38 states x desktop/mobile against
  `tests/visual/reference`). Both need Python Playwright and Chromium.
- Component gallery: `npx next dev`, then `/dev/components` (404 in production).
