-- Procurement Agent (Fase 4, parte 1): extiende supplier_searches con la captura manual
-- de landed cost real (1:1 con la búsqueda de proveedor ya hecha en Fase 3) y agrega
-- procurement_documents para los RFQ/PO generados sobre el proveedor seleccionado.

alter table public.supplier_searches
  add column landed_cost_mxn_manual numeric,
  add column landed_cost_source text check (landed_cost_source in ('manual')),
  add column landed_cost_notes text,
  add column landed_cost_captured_at timestamptz;

-- RFQ y PO pueden regenerarse varias veces sobre la misma búsqueda de proveedor (a
-- diferencia del landed cost, que es 1:1) — por eso viven en su propia tabla en vez de
-- mergearse en una columna de supplier_searches (ver plan.md, "Decisiones y su razón").
create table public.procurement_documents (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  supplier_search_id uuid not null references public.supplier_searches(id) on delete cascade,
  document_type text not null check (document_type in ('rfq', 'po')),
  content jsonb not null
);

alter table public.procurement_documents enable row level security;

create index procurement_documents_supplier_search_id_idx
  on public.procurement_documents (supplier_search_id);

revoke all on public.procurement_documents from anon, authenticated;
grant all on public.procurement_documents to service_role;
