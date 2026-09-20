# Security notes

## What is protected, and from whom

| Threat | Protection |
|---|---|
| Database dump, backup or Supabase dashboard access | Documents are AES-256-GCM ciphertext; keys are wrapped by a master key that is not in the database |
| Leaked Supabase anon key / another user's session | RLS enabled and forced with no policies; table privileges revoked from `anon` and `authenticated` |
| One user reading another's data | Every query is scoped by the verified user id; ciphertext is bound to (user, collection, id) via AAD, so moved rows fail to decrypt |
| Copy of the repository | No real data or secrets in Git; `npm run scan` and a pre-commit hook enforce it |
| XSS via stored text | Script CSP with a per-response nonce, no inline handlers, no third-party script hosts |
| CSRF | Custom header + Origin check on API writes; Origin check on form posts; SameSite session cookies |
| Sign-up abuse and API cost | Admin approval, per-minute limiter, hard per-user daily cap on document reads |
| Account deletion | `Delete all my data` removes rows and the wrapped key (crypto-shredding) |

## What is NOT protected

- Someone with **both** the database and the master key (or who controls the running server) can read everything.
  This is server-side encryption: it protects stored data, not data from the operator. True end-to-end
  encryption (keys only in the browser) would make server-side receipt reading and recovery impossible.
- Lost master key = lost data. Back it up offline.
- Amounts and dates are inside the ciphertext, but **metadata is visible** to the database: which user has how
  many documents in which collection, and when they were last changed.
- Document text is sent to the Anthropic API when a user uploads a receipt. Tell users this.
- The in-memory rate limiter is per server instance; the daily cap in the database is the real limit.

## Key rotation

Add a new version to `MASTER_KEYS`, set `MASTER_KEY_ACTIVE`, run `npm run rewrap`, then remove the old version.

## Reporting

Open a private security advisory on the GitHub repository.
