-- The whole ledger schema, created once: people and entries, each row owned by the
-- account that created it. Ownership lives here and nowhere else: the bundle never
-- sends or filters by user_id, so dropping a policy below makes the acceptance run
-- fail instead of a client-side filter quietly hiding a leak.

create table public.people (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  -- The normalised name an account may hold only once, so a person is typed once
  -- and chosen thereafter.
  name_key text generated always as (lower(btrim(regexp_replace(name, '\s+', ' ', 'g')))) stored,
  created_at timestamptz not null default now(),
  unique (user_id, name_key),
  -- Lets entries point at a person of the SAME account through a composite key.
  unique (id, user_id)
);

create table public.entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('send', 'receive')),
  currency text not null check (currency in ('USD', 'MVR')),
  -- US cents for USD, laari for MVR.
  amount_minor bigint not null check (amount_minor > 0),
  -- Rufiyaa per one US dollar.
  rate numeric(12, 4) null,
  usd_cents bigint not null check (usd_cents > 0),
  entry_date date not null,
  saved_at timestamptz not null default now(),
  note text null,
  person_id uuid null references public.people (id) on delete set null,
  person_name text null,
  -- A rate belongs to an MVR entry and only to an MVR entry.
  constraint entries_rate_matches_currency check (
    (currency = 'MVR' and rate is not null and rate > 0)
    or (currency <> 'MVR' and rate is null)
  ),
  -- A send names who was paid; a repayment from Abbaas names nobody.
  constraint entries_send_names_a_person check (kind <> 'send' or person_name is not null),
  constraint entries_receive_names_nobody check (
    kind <> 'receive' or (person_id is null and person_name is null)
  ),
  -- Same-account reference: the pair, not the id alone, must exist in people.
  constraint entries_person_is_same_account foreign key (person_id, user_id)
    references public.people (id, user_id) on delete set null (person_id)
);

create index entries_user_order_idx on public.entries (user_id, entry_date desc, saved_at desc);
create index entries_person_idx on public.entries (person_id);

alter table public.people enable row level security;
alter table public.entries enable row level security;

create policy people_select_own on public.people
  for select to authenticated using (auth.uid() = user_id);
create policy people_insert_own on public.people
  for insert to authenticated with check (auth.uid() = user_id);
create policy people_update_own on public.people
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy people_delete_own on public.people
  for delete to authenticated using (auth.uid() = user_id);

create policy entries_select_own on public.entries
  for select to authenticated using (auth.uid() = user_id);
create policy entries_insert_own on public.entries
  for insert to authenticated with check (auth.uid() = user_id);
create policy entries_update_own on public.entries
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy entries_delete_own on public.entries
  for delete to authenticated using (auth.uid() = user_id);

revoke all on public.people from anon;
revoke all on public.entries from anon;
grant select, insert, update, delete on public.people to authenticated;
grant select, insert, update, delete on public.entries to authenticated;
grant all on public.people to service_role;
grant all on public.entries to service_role;
