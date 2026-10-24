create table if not exists public.halloween_votes (
  id bigint generated always as identity primary key,
  entry_id text not null,
  voter_id uuid not null,
  stars smallint not null check (stars between 1 and 5),
  created_at timestamptz not null default now(),
  constraint halloween_votes_one_per_voter unique (entry_id, voter_id)
);

create index if not exists halloween_votes_entry_id_idx
  on public.halloween_votes (entry_id);

alter table public.halloween_votes enable row level security;
revoke all on table public.halloween_votes from anon, authenticated;
grant all on table public.halloween_votes to service_role;
