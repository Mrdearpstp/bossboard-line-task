create table if not exists public.linetask_state (
  name text primary key,
  payload jsonb not null default 'null'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.linetask_state enable row level security;

drop policy if exists "Backend service role can manage app state" on public.linetask_state;

create policy "Backend service role can manage app state"
on public.linetask_state
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

grant select, insert, update, delete on public.linetask_state to service_role;
