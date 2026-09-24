# Implementation Plan: Listing Agent (Fase 5, parte 1)

**Branch**: `008-listing-agent` | **Date**: 2026-09-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/008-listing-agent/spec.md`

## Summary

Agrega un Listing Agent que, dado un `product_candidate` existente, genera un
Listing Draft (título, bullets, descripción, backend search terms, y
sugerencias de A+ Content) usando el mismo patrón de análisis con Claude que
ya usan los otros cinco agentes del sistema, y opcionalmente compara ese
draft contra hasta 10 ASINs competidores obtenidos vía la misma Catalog
Items API que ya usa el Scout Agent — señalando gaps de keywords, atributos
faltantes y diferencias de estructura, cada uno con su propio nivel de
confianza calculado de forma determinística (no confiado a Claude). Nunca
publica al listing real de Amazon; PPC/Advertising queda explícitamente
bloqueado por falta de acceso a Amazon Ads API.

## Technical Context

**Language/Version**: TypeScript (Next.js 16 App Router), igual que el resto del repo.

**Primary Dependencies**: `@anthropic-ai/sdk` (`messages.parse` + `zodOutputFormat`,
mismo patrón que las 5 funciones de análisis existentes en
`src/lib/claude-analysis.ts`); `@supabase/supabase-js` vía
`src/lib/supabase-admin.ts`; `zod`; `src/lib/sp-api.ts` reutilizado sin
cambios (`getCatalogItem`, ya usado por el Scout Agent) para leer el
catálogo de los competidores.

**Storage**: Supabase Postgres — una tabla nueva, `listing_drafts`, con RLS
activo y restringida a `service_role` (mismo patrón que las demás tablas de
agentes).

**Testing**: Sin suite automatizada — el proyecto no tiene una (ver
`package.json`: solo `lint`/`build`, sin `test`). Validación vía
`tsc --noEmit` + `eslint` + `next build` limpios, más una corrida real
end-to-end contra producción, mismo patrón usado para validar Fases 1-4.

**Target Platform**: Vercel (Next.js Functions), igual que el resto del sistema.

**Project Type**: Web service — proyecto único Next.js (no hay frontend/backend separados).

**Performance Goals**: Ninguno definido explícitamente en el resto del
proyecto; no aplica un objetivo nuevo aquí.

**Constraints**: Reutiliza el throttling ya existente de la Catalog Items
API (`CATALOG_MIN_INTERVAL_MS` ≈ 600ms/llamada) en `src/lib/sp-api.ts` — con
hasta 10 ASINs competidores + el ASIN propio, una comparación completa puede
tomar hasta ~7s de llamadas secuenciales a SP-API antes de la llamada a
Claude. El endpoint debe quedar protegido con el mismo Basic Auth que el
resto (`src/proxy.ts`).

**Scale/Scope**: Herramienta interna de un solo operador, volumen de
solicitudes bajo — igual que el resto del sistema.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Evaluado contra los 11 principios de `.specify/memory/constitution.md`:

| # | Principio | Evaluación |
|---|---|---|
| 1 | Cada agente es módulo independiente | ✅ PASS — módulo nuevo (`src/lib/claude-analysis.ts` extendido + rutas nuevas bajo `src/app/api/agents/listing/`), no modifica agentes existentes. |
| 2 | Toda escritura pasa por Supabase con RLS activo | ✅ PASS — tabla nueva con RLS, acceso solo vía `service_role`/`supabase-admin.ts`. |
| 3 | Schema vía Supabase CLI, nunca a mano | ✅ PASS — migración se crea con `supabase migration new` en la fase de implementación (`/speckit-tasks` + `/speckit-implement`), no en este plan. |
| 4 | Infraestructura base (Fase 0) | N/A — esta feature no toca hosting/dominio/conexión base. |
| 5 | Nunca inventar datos | ✅ PASS — FR-002/FR-003/FR-017 lo exigen explícitamente; ver decisión de "elementos faltantes señalados" en research.md. |
| 6 | Confianza junto al valor para todo ítem con nivel de confianza | ✅ PASS — FR-014 exige confianza (`alta`/`media`/`sin_dato`) por cada gap reportado, calculada de forma determinística (ver research.md) en vez de confiar en que Claude haga bien el cálculo de porcentaje. |
| 7 | Toda corrida se registra en `agent_runs` | ✅ PASS — FR-010; `agent_name: 'listing_agent'`. |
| 8 | Endpoints que consumen cuota de APIs de pago, protegidos | ✅ PASS — FR-012; se agrega a `src/proxy.ts`. |
| 9 | Comprar vs. construir para fuentes de terceros | N/A — no se introduce ninguna fuente de terceros nueva; se reutiliza la Catalog Items API ya integrada. |
| 10 | Output consumible por humano y por el siguiente agente | ✅ PASS — se persiste como JSON estructurado en Supabase, consumible por la UI y por agentes futuros (Fase 7). |
| 11 | Autonomía en 3 niveles, nunca automatizar 🔴 | ✅ PASS — FR-013: nunca publica al listing real de Amazon automáticamente; el agente opera en nivel 🟢 (generar + comparar), la publicación queda 100% humana. |

**Resultado**: sin violaciones. No se requiere `Complexity Tracking`.

**Re-check post-diseño (tras Fase 1 — data-model.md, contracts/,
quickstart.md)**: el diseño de `listing_drafts` como tabla única con upsert
(Principio 2/3), el cálculo determinístico de confianza en código en vez de
en el prompt (Principio 6), y el contrato de API que nunca escribe al
listing real de Amazon (Principio 11) confirman las evaluaciones de arriba
sin introducir violaciones nuevas. Sin cambios a este gate.

## Project Structure

### Documentation (this feature)

```text
specs/008-listing-agent/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   └── listing-agent-api.md
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── lib/
│   ├── claude-analysis.ts   # extender: generateListingDraft(), compareListingToCompetitors()
│   ├── sp-api.ts            # sin cambios — getCatalogItem() reutilizado para ASINs competidores
│   └── supabase-admin.ts    # sin cambios — mismo cliente service_role
└── app/
    └── api/
        └── agents/
            └── listing/
                └── route.ts   # POST /api/agents/listing — genera/regenera el Listing Draft
                                # y, si se dan competitor_asins, la Competitor Comparison

supabase/
└── migrations/
    └── <timestamp>_create_listing_drafts_table.sql   # se crea en /speckit-implement, no aquí
```

**Structure Decision**: Option 1 (proyecto único) — sigue exactamente el
layout ya usado por Scout/Analyst/Review Intelligence/Supplier/Procurement:
lógica de negocio en `src/lib/`, un endpoint HTTP bajo
`src/app/api/agents/<agent>/route.ts`, sin separación frontend/backend. No
se agrega UI en esta fase (fuera del spec — el spec no pide pantalla nueva,
a diferencia de Scout/Review Intelligence que sí tienen UI dedicada).

## Complexity Tracking

*Sin violaciones — tabla no aplica.*
