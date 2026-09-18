-- Review Intelligence Agent (Fase 2): guarda cada corrida de análisis de reviews de
-- competidores, opcionalmente vinculada a un product_candidate.

create table public.review_insights (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  product_candidate_id uuid references public.product_candidates(id) on delete set null,
  competitor_asins jsonb not null,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'complete', 'error', 'sin_fuente_datos')),
  reviews_source text,
  raw_reviews jsonb,
  insights jsonb,
  prd_document text,
  confianza_general text check (confianza_general in ('alta', 'media', 'sin_dato')),
  nota_metodologica text,
  error_message text
);

alter table public.review_insights enable row level security;

create index review_insights_product_candidate_id_idx
  on public.review_insights (product_candidate_id);

revoke all on public.review_insights from anon, authenticated;
grant all on public.review_insights to service_role;
