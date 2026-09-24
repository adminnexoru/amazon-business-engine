# Plan: Procurement Agent (Fase 4, parte 1)

## Stack
- Motor de redacción: Claude, vía nueva función `generateRfqDraft()` y
  `generatePoTemplate()` en `src/lib/claude-analysis.ts` (mismo patrón
  `messages.parse` + `zodOutputFormat` que el resto de las funciones de
  análisis del proyecto).
- Persistencia de documentos generados: tabla nueva `procurement_documents`
  (RLS activo, `service_role`).
- Persistencia de la captura manual de landed cost: columnas nuevas en la
  tabla existente `supplier_searches` (migración `ALTER TABLE`), no una
  tabla aparte — es una relación 1:1 por búsqueda de proveedor, a diferencia
  de RFQ/PO que pueden regenerarse varias veces.
- Exposición: `POST /api/agents/procurement/rfq`,
  `PATCH /api/agents/supplier/[id]/landed-cost`,
  `POST /api/agents/procurement/po` — mismo Basic Auth que el resto.

## Migración — extensión de `supplier_searches`

```sql
alter table public.supplier_searches
  add column landed_cost_mxn_manual numeric,
  add column landed_cost_source text check (landed_cost_source in ('manual')),
  add column landed_cost_notes text,
  add column landed_cost_captured_at timestamptz;
```

## Migración — tabla `procurement_documents`

```sql
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
```

## Esquema de salida del RFQ (Zod)

```typescript
const rfqDraftSchema = z.object({
  asunto: z.string(),
  cuerpo: z.string(), // el mensaje completo, listo para copiar
  campos_solicitados: z.array(z.string()), // lo que se le pide al proveedor
});
```

## Esquema de salida de la PO (Zod)

```typescript
const poTemplateSchema = z.object({
  asunto: z.string(),
  cuerpo: z.string(), // incluye item, cantidad, precio acordado, condiciones,
                       // lugar de entrega, y una nota explícita de que NO es
                       // un documento legal vinculante
});
```

## Flujo

1. `POST /api/agents/procurement/rfq` — body `{ supplier_search_id }`.
   - Rechaza si `selected_supplier_id` es null.
   - Arma el contexto: specs del candidato (`raw_data.catalog`), y los datos
     de la opción seleccionada dentro de `options` (precio, MOQ, price
     breaks, señales del proveedor).
   - Llama a `generateRfqDraft()`, inserta en `procurement_documents`
     (`document_type: 'rfq'`), loggea en `agent_runs`
     (`agent_name: 'procurement_agent'`).
2. `PATCH /api/agents/supplier/[id]/landed-cost` — body
   `{ landed_cost_mxn: number, notes?: string }`. Actualiza las columnas
   nuevas de `supplier_searches` con `landed_cost_source: 'manual'` y
   `landed_cost_captured_at: now()`. Rechaza si `landed_cost_mxn` no es un
   número positivo.
3. `POST /api/agents/procurement/po` — body
   `{ supplier_search_id, quantity: number, unit_price_usd: number, notes?: string }`
   (cantidad y precio confirmados manualmente por el usuario tras recibir la
   respuesta real del proveedor — no se asumen del listado original de
   Alibaba). Llama a `generatePoTemplate()`, inserta en
   `procurement_documents` (`document_type: 'po'`), loggea en `agent_runs`.

## Decisiones y su razón

- **El RFQ se redacta en inglés, no en español.** Los proveedores de
  Alibaba operan predominantemente en inglés — ya lo confirmamos
  indirectamente en Fase 3 (T8: la búsqueda en español perdió el
  diferenciador del producto). Si las specs del candidato vienen en
  español (como suele pasar, ver `raw_data.catalog`), `generateRfqDraft()`
  debe traducir los puntos clave al armar el `cuerpo`, no copiarlos tal
  cual — mismo problema de idioma que T8, resuelto aquí en el lado de
  redacción en vez de búsqueda.
- **Landed cost como columnas en `supplier_searches`, no tabla aparte**:
  es un dato 1:1 con la decisión de proveedor ya tomada, y vivir en la
  misma fila facilita que el Buy Simulator lo lea con una sola consulta.
- **La PO exige cantidad y precio como input manual explícito**, no los
  toma de `options` — porque el precio/cantidad reales después de una
  cotización formal casi siempre difieren del listado original de Alibaba
  (coherente con la regla de Fase 3 de que el precio de Alibaba es un
  punto de partida, nunca el final).
- **Nada se envía automáticamente en ningún punto de este flujo** — ni el
  RFQ ni la PO tocan ninguna API externa de mensajería o email.
