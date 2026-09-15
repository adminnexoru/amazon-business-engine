-- Candidatos de producto encontrados por el Scout Agent
create table product_candidates (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  source text not null,
  title text not null,
  asin text,
  category text,
  estimated_price numeric,
  estimated_demand text,
  estimated_competition text,
  estimated_margin_pct numeric,
  raw_data jsonb,
  status text not null default 'pending'
);

-- Historial de ejecuciones de cada agente
create table agent_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  agent_name text not null,
  status text not null default 'running',
  input jsonb,
  output jsonb,
  error_message text,
  duration_ms integer
);

-- Decisiones humanas (BUY/TEST/REJECT, aprobaciones de inventario, etc.)
create table decisions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  product_candidate_id uuid references product_candidates(id),
  decision_type text not null,
  decision text not null,
  notes text,
  decided_by text
);

-- Row Level Security activado por defecto en las 3 tablas
alter table product_candidates enable row level security;
alter table agent_runs enable row level security;
alter table decisions enable row level security;