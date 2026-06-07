create table if not exists public.resident_tips (
  id text primary key,
  region text,
  place_hint text,
  linked_content_id text,
  area_code text,
  sigungu_code text,
  canonical_place text,
  anchor_confidence numeric,
  quality_score numeric,
  validation_status text not null,
  source text not null,
  sensibility jsonb not null default '[]'::jsonb,
  companion jsonb not null default '[]'::jsonb,
  local_observation text,
  best_time text,
  mission_seed text,
  caution text,
  plan_b text,
  mission_action text,
  clear_condition_seed text,
  time_modifier text,
  difficulty_hint text,
  companion_fit jsonb not null default '[]'::jsonb,
  plan_b_seed text,
  etiquette_rule text,
  local_power_score numeric,
  influence_scope text,
  contributor_profile jsonb not null default '{}'::jsonb,
  intake_metadata jsonb not null default '{}'::jsonb,
  raw_json jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists resident_tips_created_at_idx
  on public.resident_tips (created_at desc);

create index if not exists resident_tips_region_idx
  on public.resident_tips (region);

alter table public.resident_tips enable row level security;
