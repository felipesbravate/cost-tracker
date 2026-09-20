-- Costs Tracker: schema.
-- Security model: the browser NEVER talks to these tables. All access goes through the Next.js
-- server using the service-role key. RLS is enabled with NO policies, so the public (anon) and
-- signed-in (authenticated) keys can read and write nothing, even if they leak.
-- Document contents are additionally encrypted by the server (AES-256-GCM, per-user key), so a
-- database dump or a Supabase dashboard user sees only ciphertext.

create table if not exists public.profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  status     text not null default 'pending' check (status in ('pending','approved','blocked')),
  created_at timestamptz not null default now()
);

create table if not exists public.user_keys (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  kek_version text not null,
  wrapped     text not null,             -- per-user data key, wrapped by the master key (env, never stored here)
  created_at  timestamptz not null default now()
);

create table if not exists public.documents (
  user_id    uuid not null references auth.users(id) on delete cascade,
  collection text not null check (collection in ('entries','years','overrides','budgets','budgetDefaults','settings')),
  doc_id     text not null check (doc_id ~ '^[A-Za-z0-9_.~:@+-]{1,200}$'),
  payload    text not null,              -- base64 AES-256-GCM ciphertext; no plaintext columns on purpose
  updated_at timestamptz not null default now(),
  primary key (user_id, collection, doc_id)
);

create table if not exists public.usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day     date not null,
  reads   integer not null default 0,
  primary key (user_id, day)
);

alter table public.profiles  enable row level security;
alter table public.user_keys enable row level security;
alter table public.documents enable row level security;
alter table public.usage     enable row level security;
alter table public.profiles  force row level security;
alter table public.user_keys force row level security;
alter table public.documents force row level security;
alter table public.usage     force row level security;

-- No policies are created on purpose. Belt and braces: also remove table privileges.
revoke all on public.profiles, public.user_keys, public.documents, public.usage from anon, authenticated;
grant  all on public.profiles, public.user_keys, public.documents, public.usage to service_role;

-- Atomic daily counter used for the document-reading cap.
create or replace function public.increment_usage(p_user uuid, p_day date)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  insert into public.usage (user_id, day, reads) values (p_user, p_day, 1)
  on conflict (user_id, day) do update set reads = public.usage.reads + 1
  returning reads into n;
  return n;
end $$;
revoke all on function public.increment_usage(uuid, date) from public, anon, authenticated;
grant execute on function public.increment_usage(uuid, date) to service_role;

create index if not exists documents_user_collection_idx on public.documents (user_id, collection);
