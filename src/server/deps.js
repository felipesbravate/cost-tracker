// Builds the production dependencies once per server instance. Server-only: never import from client code.
import { createClient } from '@supabase/supabase-js';
import { handle } from '../lib/api.js';
import { anthropicClient } from '../lib/anthropic.js';
import { loadMasterKeys } from '../lib/keyring.js';
import { RateLimiter, parseAdminEmails } from '../lib/security.js';
import { supabaseStores } from '../lib/supabase-stores.js';
import { Vault } from '../lib/vault.js';

function need(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name} (see .env.example)`);
  return v;
}

let cached;
export function getDeps() {
  if (cached) return cached;
  const sb = createClient(need('SUPABASE_URL'), need('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
  const stores = supabaseStores(sb);
  cached = {
    vault: new Vault({ master: loadMasterKeys(process.env), keys: stores.keys, docs: stores.docs }),
    profiles: stores.profiles,
    usage: stores.usage,
    ai: anthropicClient({ apiKey: need('ANTHROPIC_API_KEY'), model: need('ANTHROPIC_MODEL') }),
    admins: parseAdminEmails(process.env.ADMIN_EMAILS),
    appOrigin: need('APP_ORIGIN'),
    limiter: new RateLimiter(30, 60_000),
    loginLimiter: new RateLimiter(5, 10 * 60_000),
    dailyReadCap: Number(process.env.DAILY_READ_CAP || 30),
  };
  return cached;
}
export { handle };
