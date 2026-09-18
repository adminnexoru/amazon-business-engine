<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Amazon Business Engine

Autonomous Amazon Business Engine: a system of agents that scouts, evaluates, and
tracks decisions about candidate products to sell on Amazon, with a human in the
loop for final BUY/TEST/REJECT calls.

## Estado del proyecto (actualizado)

### Fases completadas

- **Fase 0** — arquitectura, hosting en Vercel, dominio `abe.nexoru.ai`, conexión a Supabase.
- **Fase 1** — Scout Agent (SP-API Catalog Items + Claude), protegido con Basic Auth en
  `/scout` y `/api/agents/scout` (variables `SCOUT_AUTH_USER`/`SCOUT_AUTH_PASSWORD`; ver
  "Agents" y "Protected routes" más abajo).
- **Fase 1.5** — Product Analyst Agent: evalúa 12 variables (Precio, BSR, Reviews, Rating,
  Competencia, Trend, Sales estimate, Revenue estimate, Amazon fees, Cost, Margin,
  Differentiation), cada una con nivel de confianza (alta/media/sin_dato). Usa SP-API
  Pricing API + Product Fees API (FBA y FBM). Costo manual opcional para calcular Margin.
  Veredicto: test/reject/necesita_mas_datos. Endpoint protegido igual que Scout (ver
  "Agents" más abajo para el detalle completo).

### Variables de entorno usadas (nombres, sin valores)

- Supabase: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`
- SP-API (LWA): `SP_API_CLIENT_ID`, `SP_API_CLIENT_SECRET`, `SP_API_REFRESH_TOKEN`
- Claude: `ANTHROPIC_API_KEY`
- Basic Auth de rutas protegidas: `SCOUT_AUTH_USER`, `SCOUT_AUTH_PASSWORD`

### Roles SP-API activos

Listing de producto, Precios (marketplace México). Agregar el rol correspondiente en
Seller Central antes de consumir una API nueva desde un agente (ver Fase 6 en el roadmap
para el próximo rol que hará falta).

### Principios de diseño establecidos

- Nunca inventar datos: una variable sin fuente confiable queda como `sin_dato`, nunca se
  estima por default.
- Cada variable de un análisis debe mostrar su nivel de confianza junto al valor, no solo
  el valor.
- RLS activado en toda tabla nueva desde su creación; cambios de schema siempre vía
  migraciones de Supabase CLI (ver "Migrations convention").
- Autonomía en 3 niveles: verde (autónomo), amarillo (autónomo + aprobación humana), rojo
  (solo humano) — nunca automatizar pagos, contratos o compras grandes.
- Rutas que consumen cuota de APIs pagadas siempre protegidas con auth (ver
  "Protected routes").

### Pendientes conocidos (no bloqueantes)

- Hazmat: el Product Analyst Agent detecta riesgo hazmat en texto libre (dentro de
  `nota_metodologica`/`differentiation`); falta capturarlo como campo estructurado
  (`hazmat_risk` boolean).
- Rotar `SP_API_CLIENT_SECRET` si se comparte en capturas de pantalla o chats.
- Migrar de Basic Auth a Supabase Auth cuando haya más de un usuario.

### Roadmap restante

- **Fase 2 — Review Intelligence Agent**: lee reviews de productos competidores (cuando
  haya fuente de datos disponible) y extrae: problemas reportados, deseos no satisfechos,
  características faltantes, motivos de compra, motivos de devolución. Genera un documento
  tipo "así debería ser nuestro producto" (Product Requirement Document preliminar).
- **Fase 3 — Supplier Agent**: busca y compara proveedores (vía plataformas como Alibaba u
  otras), compara precio/MOQ/tiempo de entrega entre opciones, calcula landed cost. Nivel
  de autonomía: 🟡 auto+aprobación en la selección final del proveedor.
- **Fase 4 — Procurement Agent + Buy Simulator**: una vez aprobado un proveedor, prepara
  RFQ, especificaciones, orden de compra — deja solo la autorización final de pago al
  humano (🟡). Incluye el "Buy Simulator": dado capital disponible, costo landed y precio
  de venta, simula distintos volúmenes de compra mostrando inversión, revenue esperado,
  profit, sell-through estimado y capital recovery, para decidir cuánto comprar, no solo
  si comprar.
- **Fase 5 — Listing + Marketing Agent**: genera título, bullets, descripción, backend
  keywords, A+ content; compara el listing propio vs. top 10 competidores. Gestiona PPC:
  analiza CTR/CVR/ACOS/TACOS y ajusta bids bajo límites definidos (🟢 autónomo dentro de
  límites; 🟡 cambios grandes de presupuesto requieren aprobación).
- **Fase 6 — Inventory Agent**: vigila inventory, sales velocity, lead time, MOQ, cash
  disponible y seasonality; calcula reorder point y PO recomendada. SIEMPRE requiere 🔐
  Human Approval antes de ejecutar una compra de inventario, porque compromete capital
  real. Requiere agregar el rol SP-API "Seguimiento de pedidos e inventario" cuando se
  llegue a esta fase.
- **Fase 7 — Autonomous Business Manager**: una vez que hay historial acumulado (productos
  analizados, comprados, rechazados, proveedores, precios, ventas reales, márgenes,
  returns, advertising, reviews, inventory, seasonality), el sistema puede responder
  preguntas como "tengo $300,000 MXN, ¿dónde los invertirías?" con explicación y
  escenarios, basado en datos reales de la propia tienda, no solo estimaciones de mercado.

## Stack

- Next.js 16 (App Router) + TypeScript
- Tailwind CSS v4
- Supabase (Postgres + Auth + Data API) via `@supabase/supabase-js`
- Package manager: pnpm
- Production domain: **abe.nexoru.ai**, deployed via Vercel (project `amazon-business-engine`)

## Database schema

Managed with the Supabase CLI under `supabase/migrations/`. Current tables (all in
`public`, all with Row Level Security enabled):

- **`product_candidates`** — product opportunities found by the Scout agent and enriched
  by the Product Analyst agent.
  `id`, `created_at`, `source`, `title`, `asin`, `category`, `estimated_price`,
  `estimated_demand`, `estimated_competition`, `estimated_margin_pct`, `raw_data`
  (jsonb; Scout writes `catalog`/`analysis`, Analyst writes `analyst`), `cost_manual`
  (numeric, nullable — human-entered unit cost when there's no real sourcing cost yet),
  `cost_source` (text, nullable — `'manual_estimate'` or `null`), `status` (default
  `'pending'`; one of `pending | analyzing | test | reject | necesita_mas_datos | error`).
- **`agent_runs`** — execution history for every agent run.
  `id`, `created_at`, `agent_name`, `status` (default `'running'`), `input` (jsonb),
  `output` (jsonb), `error_message`, `duration_ms`.
- **`decisions`** — human decisions tied to a candidate (BUY/TEST/REJECT, inventory
  approvals, etc.). `id`, `created_at`, `product_candidate_id` (FK →
  `product_candidates.id`), `decision_type`, `decision`, `notes`, `decided_by`.

`product_candidates` and `agent_runs` are restricted to the `service_role` (see
"Protected routes" below for why) — all reads/writes from the app go through
`src/lib/supabase-admin.ts` server-side, never the `anon` client, for these two tables.

## Migrations convention

Use the Supabase CLI, never hand-edit the remote schema:

```bash
supabase migration new <descriptive_name>   # creates supabase/migrations/<timestamp>_<name>.sql
supabase db push                            # applies pending migrations to the linked project
```

Migration files are timestamp-prefixed and immutable once pushed — to change a table,
add a new migration rather than editing an existing one. Keep each migration focused
(schema change, policy change, and grants can be separate files, as in the initial
3 migrations).

## Agents

### Scout Agent

`POST /api/agents/scout` — `{ inputs: string[] }` (ASINs or keywords, one per entry).
For each input, looks up the item via the Catalog Items API (`src/lib/sp-api.ts`),
runs a qualitative read with Claude (`analyzeCatalogItem` in `src/lib/claude-analysis.ts`),
and inserts a row into `product_candidates` with `status: 'pending'` and
`raw_data: { catalog, analysis }`. Every call is logged to `agent_runs` with
`agent_name: 'scout_agent'`. UI: `/scout` (`ScoutForm.tsx`).

### Product Analyst Agent

`POST /api/agents/analyst` — `{ product_candidate_id: string, manual_cost?: number }`.
Takes an existing candidate (created by the Scout Agent) and enriches it with live
pricing data before asking Claude for a BUY-adjacent verdict:

1. Sets the candidate's `status` to `'analyzing'`.
2. Calls `getCompetitivePricing(asin)` (Product Pricing API v0, `getCompetitivePricing`
   operation) for the Buy Box (New) price, active offer count, and sales rank.
3. If a Buy Box price was found, calls `getFeesEstimate(asin, price, isAmazonFulfilled)`
   (Product Fees API v0, `getMyFeesEstimateForASIN`) twice — once for FBA, once for FBM —
   since we don't yet know the fulfillment method for a candidate that isn't listed.
4. Calls `analyzeProductCandidate()` (`src/lib/claude-analysis.ts`) with the Scout's
   `raw_data`, the pricing/fees results, and the manual cost (if any). Claude returns
   the 12 tracked variables (Precio, BSR, Reviews, Rating, Competencia, Trend, Sales
   estimate, Revenue estimate, Amazon fees, Cost, Margin, Differentiation), each tagged
   with a confidence level (`alta | media | sin_dato`), plus a `veredicto`
   (`test | reject | necesita_mas_datos`), `justificacion`, and `nota_metodologica`.
   Reviews, Rating, Trend, Sales estimate, and Revenue estimate are always `sin_dato`
   in practice — there's no Keepa (or equivalent) integration yet, so nothing feeds
   those variables. Margin inherits the lowest confidence of Precio/Amazon fees/Cost, and
   is `sin_dato` whenever price or cost is missing. `veredicto: 'necesita_mas_datos'` is
   forced not only when Margin is `sin_dato`, but also when a manual cost was provided but
   looks implausible for the product type (e.g. too low given its materials/battery/size) —
   an arithmetically valid Margin isn't trusted if its cost input isn't.
5. Updates the candidate's `status` to the verdict, merges `raw_data.analyst` (verdict +
   raw pricing/fees results), and sets `cost_manual`/`cost_source` from the request.

Logged to `agent_runs` with `agent_name: 'analyst_agent'`. UI: the "Analizar" /
"Reanalizar" control on `/scout` (`AnalystPanel.tsx`), shown for candidates with
`status` `pending` or `necesita_mas_datos`.

## Protected routes

`src/proxy.ts` (the Next.js 16 successor to `middleware.ts` — see the breaking-changes
block at the top of this file) gates internal-only routes behind simple HTTP Basic Auth,
checked against the `SCOUT_AUTH_USER` / `SCOUT_AUTH_PASSWORD` env vars. It fails closed:
if those env vars aren't set, every matched route returns 401.

Currently protected: `/scout`, `/api/agents/scout`, and `/api/agents/analyst` (and their
subpaths). To protect another route, add it to the `matcher` array in `src/proxy.ts` — no
new auth logic needed,
the same check applies to everything in the matcher. If a route needs different
credentials or a different auth scheme, branch on `request.nextUrl.pathname` inside
`proxy()` rather than adding a second proxy file (only one is allowed per project).
