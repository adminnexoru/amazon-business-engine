# Quickstart: Listing Agent (Fase 5, parte 1)

Guía de validación end-to-end una vez implementado (`/speckit-tasks` +
`/speckit-implement`). No incluye código de implementación — ver
[data-model.md](./data-model.md) y
[contracts/listing-agent-api.md](./contracts/listing-agent-api.md) para las
formas exactas.

## Prerrequisitos

- Migración `listing_drafts` aplicada (`supabase db push`).
- Variables de entorno ya existentes (`SCOUT_AUTH_USER`/`PASSWORD`,
  `ANTHROPIC_API_KEY`, credenciales SP-API) — esta feature no agrega
  variables nuevas.
- Un `product_candidate` con `raw_data.catalog` ya poblado (creado vía el
  Scout Agent). Ejemplos reales usados en Fases anteriores de este repo:
  `c569d3b3-8402-464a-a4c6-1ddc6cb71036` (café, ASIN B077HFMK1Z) o
  `e5d485e3-b4e4-4eab-af8f-f1df2d98a0c4` (auriculares JKMX, ASIN
  B0DK8X1WWV, veredicto `test`).

## Escenario 1 — Generar el Listing Draft sin comparación (User Story 1)

```bash
curl -s -u "$SCOUT_AUTH_USER:$SCOUT_AUTH_PASSWORD" \
  -X POST "https://abe.nexoru.ai/api/agents/listing" \
  -H "Content-Type: application/json" \
  -d '{ "product_candidate_id": "<uuid con raw_data.catalog>" }'
```

**Esperado**: `200`, `listing.title`/`bullets` (≥5)/`description`/
`backendSearchTerms` poblados, `comparison: null` (FR-004, ningún
`competitor_asins` enviado).

## Escenario 2 — Comparar contra competidores reales (User Story 2)

```bash
curl -s -u "$SCOUT_AUTH_USER:$SCOUT_AUTH_PASSWORD" \
  -X POST "https://abe.nexoru.ai/api/agents/listing" \
  -H "Content-Type: application/json" \
  -d '{
    "product_candidate_id": "<uuid con raw_data.catalog>",
    "competitor_asins": ["ASIN1", "ASIN2", "ASIN3"]
  }'
```

**Esperado**: `200`, `comparison.status: 'complete'`,
`competitorAsinsResolved` con los ASINs que sí devolvieron catálogo,
`keywordGaps`/`missingAttributes`/`structuralDifferences` cada uno con
`confianza` calculada (verificar a mano: un gap sustentado por 3 de 3
competidores resueltos debe salir `alta`; por 1 de 3, `media` — FR-014).

## Escenario 3 — Candidato sin dato de catálogo (Edge Case, FR-017)

```bash
curl -s -u "$SCOUT_AUTH_USER:$SCOUT_AUTH_PASSWORD" \
  -X POST "https://abe.nexoru.ai/api/agents/listing" \
  -H "Content-Type: application/json" \
  -d '{ "product_candidate_id": "<uuid de un candidato creado a mano sin raw_data.catalog>" }'
```

**Esperado**: `422` con mensaje explícito. Verificar en Supabase que
**no** se creó ninguna fila nueva en `agent_runs` para esta llamada
(mismo patrón que el rechazo por veredicto del Supplier Agent).

## Escenario 4 — Regenerar (verificar upsert, FR-015)

Repetir el Escenario 1 sobre el mismo `product_candidate_id` una segunda
vez con datos distintos (p. ej. después de que el Analyst corrió de nuevo).

**Esperado**: sigue existiendo una sola fila en `listing_drafts` para ese
`product_candidate_id` (`select count(*) from listing_drafts where
product_candidate_id = '<uuid>'` → `1`), con `updated_at` más reciente y el
contenido reemplazado, no una fila adicional.

## Escenario 5 — Falla total de la fuente de competidores (FR-016)

Requiere simular una falla de SP-API (p. ej. correr sin credenciales
`SP_API_*` válidas) mientras se piden ≥1 `competitor_asins`.

**Esperado**: `200` (no `500`) — `listing` se entrega igual,
`comparison.status: 'sin_fuente_datos'`, `keywordGaps`/`missingAttributes`/
`structuralDifferences` vacíos.

## Verificación de traza (Principio 7 de la constitución)

Para cada escenario que llegue a `200`/`422` con éxito de negocio, confirmar
una fila nueva en `agent_runs` con `agent_name: 'listing_agent'`:

```sql
select agent_name, status, input, output, created_at
from agent_runs
where agent_name = 'listing_agent'
order by created_at desc
limit 5;
```
