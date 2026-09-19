-- Supplier Agent (Fase 3): guarda cada corrida de búsqueda de proveedores para un
-- product_candidate ya validado con veredicto 'test' por el Product Analyst Agent.

create table public.supplier_searches (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  -- A diferencia de review_insights, aquí SIEMPRE hay un candidato — no hay
  -- modo standalone (ver plan.md: el Supplier Agent exige veredicto 'test').
  product_candidate_id uuid not null references public.product_candidates(id) on delete cascade,

  search_query jsonb not null,      -- searchTerms realmente usados
  status text not null default 'pending'
    check (status in ('pending', 'running', 'complete', 'error', 'sin_fuente_datos')),

  raw_results jsonb,                -- snapshot crudo de Apify (products + leads)
  options jsonb,                    -- salida normalizada de Claude (2-4 opciones)
  nota_metodologica text,
  error_message text,

  -- Selección del usuario. No dispara ninguna acción — solo se registra.
  selected_supplier_id text,
  selected_at timestamptz
);

alter table public.supplier_searches enable row level security;

create index supplier_searches_product_candidate_id_idx
  on public.supplier_searches (product_candidate_id);

revoke all on public.supplier_searches from anon, authenticated;
grant all on public.supplier_searches to service_role;
