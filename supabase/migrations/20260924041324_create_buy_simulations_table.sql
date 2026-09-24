-- Buy Simulator (Fase 4, parte 2): guarda cada corrida de simulación de volumen de
-- compra para un product_candidate con landed cost real ya capturado (Procurement
-- Agent). No hay llamada a Claude aquí — es aritmética determinística (ver plan.md).

create table public.buy_simulations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  product_candidate_id uuid not null references public.product_candidates(id) on delete cascade,
  supplier_search_id uuid not null references public.supplier_searches(id) on delete cascade,
  capital_disponible_mxn numeric not null,
  unidades_por_mes_asumidas integer not null,
  escenarios jsonb not null
);

alter table public.buy_simulations enable row level security;

create index buy_simulations_product_candidate_id_idx
  on public.buy_simulations (product_candidate_id);

revoke all on public.buy_simulations from anon, authenticated;
grant all on public.buy_simulations to service_role;
