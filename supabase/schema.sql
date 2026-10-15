create table if not exists public.rubbersync_app_state (
  id text primary key check (id = 'main'),
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.rubbersync_app_state enable row level security;

revoke all on table public.rubbersync_app_state from anon, authenticated;
grant select, insert, update, delete on table public.rubbersync_app_state to service_role;
