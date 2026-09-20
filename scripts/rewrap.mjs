// After adding a new master key version and switching MASTER_KEY_ACTIVE, re-wrap every user's data key.
// Data rows are untouched. Once it reports 0 remaining old wraps you may remove the old key version.
import { createClient } from '@supabase/supabase-js';
import { loadMasterKeys } from '../src/lib/keyring.js';
import { supabaseStores } from '../src/lib/supabase-stores.js';
import { Vault } from '../src/lib/vault.js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const stores = supabaseStores(sb);
const vault = new Vault({ master: loadMasterKeys(process.env), keys: stores.keys, docs: stores.docs });
let done = 0, kept = 0;
for (const p of await stores.profiles.list()) (await vault.rewrapUser(p.user_id)) ? done++ : kept++;
console.log(`re-wrapped ${done}, already current ${kept}`);
