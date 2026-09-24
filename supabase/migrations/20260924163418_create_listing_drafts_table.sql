-- Listing Agent (Fase 5, parte 1): guarda el Listing Draft generado por candidato y,
-- opcionalmente, la Competitor Comparison de la misma corrida. Una fila por candidato
-- (unique en product_candidate_id) — cada regeneración hace upsert y reemplaza la
-- fila anterior por completo (ver data-model.md, FR-015).

create table public.listing_drafts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  product_candidate_id uuid not null unique
    references public.product_candidates(id) on delete cascade,

  -- Listing Draft (siempre presente)
  title text not null,
  bullets jsonb not null,
  description text not null,
  item_highlights text not null default '',
  backend_search_terms jsonb not null,
  missing_elements jsonb not null default '[]',
  a_plus_content jsonb not null,

  -- Competitor Comparison (null si no se pidió, FR-004)
  competitor_asins_requested jsonb,
  competitor_asins_resolved jsonb,
  comparison_status text
    check (comparison_status in ('complete', 'sin_fuente_datos')),
  keyword_gaps jsonb,
  missing_attributes jsonb,
  structural_differences jsonb,

  nota_metodologica text not null
);

alter table public.listing_drafts enable row level security;

create index listing_drafts_product_candidate_id_idx
  on public.listing_drafts (product_candidate_id);

revoke all on public.listing_drafts from anon, authenticated;
grant all on public.listing_drafts to service_role;
