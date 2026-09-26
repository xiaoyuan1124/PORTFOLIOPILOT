-- PortfolioPilot user-owned cloud sync schema.
-- No market data or AI tables are created in this migration.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.portfolio_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  usd_twd numeric(12,4) not null default 31.8 check (usd_twd > 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.holdings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null,
  symbol text not null check (char_length(symbol) between 1 and 32),
  name text not null check (char_length(name) between 1 and 160),
  market text not null check (market in ('TW', 'US')),
  asset_type text not null check (asset_type in ('stock', 'etf', 'cash')),
  quantity numeric(24,8) not null check (quantity >= 0),
  price numeric(24,8) not null check (price >= 0),
  average_cost numeric(24,8) not null check (average_cost >= 0),
  currency text not null check (currency in ('TWD', 'USD')),
  sector text not null default '未分類',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, client_id)
);

create table if not exists public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null,
  entry_date date not null,
  symbol text not null default '',
  title text not null check (char_length(title) between 1 and 200),
  thesis text not null,
  invalidation text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, client_id)
);

alter table public.profiles enable row level security;
alter table public.portfolio_preferences enable row level security;
alter table public.holdings enable row level security;
alter table public.journal_entries enable row level security;

create policy "profiles_select_own" on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);

create policy "profiles_insert_own" on public.profiles
  for insert to authenticated
  with check ((select auth.uid()) = id);

create policy "preferences_all_own" on public.portfolio_preferences
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "holdings_all_own" on public.holdings
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "journal_all_own" on public.journal_entries
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.portfolio_preferences to authenticated;
grant select, insert, update, delete on public.holdings to authenticated;
grant select, insert, update, delete on public.journal_entries to authenticated;

create or replace function public.handle_new_portfoliopilot_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_portfoliopilot_user_created on auth.users;
create trigger on_portfoliopilot_user_created
after insert on auth.users
for each row execute function public.handle_new_portfoliopilot_user();

create or replace function public.replace_portfolio_state(
  p_usd_twd numeric,
  p_holdings jsonb,
  p_journal jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_usd_twd is null or p_usd_twd <= 0 then
    raise exception 'Invalid USD/TWD rate';
  end if;

  insert into public.portfolio_preferences (user_id, usd_twd, updated_at)
  values (v_user_id, p_usd_twd, now())
  on conflict (user_id) do update
    set usd_twd = excluded.usd_twd,
        updated_at = now();

  delete from public.holdings where user_id = v_user_id;

  insert into public.holdings (
    user_id, client_id, symbol, name, market, asset_type,
    quantity, price, average_cost, currency, sector
  )
  select
    v_user_id,
    item->>'id',
    item->>'symbol',
    item->>'name',
    item->>'market',
    item->>'type',
    (item->>'quantity')::numeric,
    (item->>'price')::numeric,
    (item->>'averageCost')::numeric,
    item->>'currency',
    coalesce(nullif(item->>'sector', ''), '未分類')
  from jsonb_array_elements(coalesce(p_holdings, '[]'::jsonb)) as item;

  delete from public.journal_entries where user_id = v_user_id;

  insert into public.journal_entries (
    user_id, client_id, entry_date, symbol, title, thesis, invalidation
  )
  select
    v_user_id,
    item->>'id',
    (item->>'date')::date,
    coalesce(item->>'symbol', ''),
    item->>'title',
    item->>'thesis',
    coalesce(item->>'invalidation', '')
  from jsonb_array_elements(coalesce(p_journal, '[]'::jsonb)) as item;
end;
$$;

revoke all on function public.replace_portfolio_state(numeric, jsonb, jsonb) from public;
grant execute on function public.replace_portfolio_state(numeric, jsonb, jsonb) to authenticated;
