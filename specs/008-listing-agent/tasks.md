# Tasks: Listing Agent (Fase 5, parte 1)

**Input**: Design documents from `/specs/008-listing-agent/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/listing-agent-api.md, quickstart.md — todos aprobados.

**Tests**: No se incluyen tareas de test automatizado — el spec no las pidió explícitamente y el repo no tiene una suite de tests (ver plan.md, Technical Context: "Sin suite automatizada"). La validación es `tsc --noEmit` + `eslint` + `next build` limpios, más las corridas reales de `quickstart.md` contra producción, mismo patrón usado para validar las Fases 1-4.

**Organization**: Tareas agrupadas por user story para permitir implementación y prueba independiente de cada una.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Puede correr en paralelo (archivos distintos, sin dependencias)
- **[Story]**: A qué user story pertenece (US1, US2, US3)
- Cada tarea incluye la ruta de archivo exacta

## Path Conventions

Proyecto único (Next.js App Router), según plan.md § Project Structure:

- Lógica de negocio: `src/lib/claude-analysis.ts` (extendido), `src/lib/sp-api.ts` (reutilizado sin cambios)
- Endpoint: `src/app/api/agents/listing/route.ts`
- Auth: `src/proxy.ts`
- Schema: `supabase/migrations/`
- Documentación: `AGENTS.md`

No hay separación frontend/backend ni UI nueva en esta fase (plan.md, Structure Decision).

---

## Phase 1: Setup

**Purpose**: Inicialización del schema de esta feature.

- [X] T001 Crear la migración `supabase/migrations/<timestamp>_create_listing_drafts_table.sql`
      con la tabla `listing_drafts` completa según `data-model.md`: 14 columnas, incluyendo
      `product_candidate_id uuid not null references public.product_candidates(id) on
      delete cascade` con constraint `unique` (relación 1:1 por candidato, FR-015), RLS
      activo (`alter table ... enable row level security`), y
      `revoke all on public.listing_drafts from anon, authenticated; grant all on
      public.listing_drafts to service_role;` — mismo patrón exacto que las demás
      tablas de agentes (ver `supabase/migrations/20260919192944_create_supplier_searches_table.sql`
      como referencia de estilo).
- [X] T002 Aplicar la migración con `supabase db push` y confirmar contra la base real
      (vía REST API o `supabase db diff`) que la tabla `listing_drafts` y el constraint
      `unique` en `product_candidate_id` existen antes de escribir cualquier código que
      dependa de ellos.

**Checkpoint**: Schema listo en la base real.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Infraestructura compartida que ambas user stories principales (US1, US2) usan
en el mismo endpoint — ninguna historia puede implementarse antes de esto.

**⚠️ CRITICAL**: No iniciar Phase 3 sin completar esta fase.

- [X] T003 Agregar `/api/agents/listing` y `/api/agents/listing/:path*` al array
      `matcher` de `src/proxy.ts` (FR-012) — mismo patrón que las demás entradas ya
      existentes en ese archivo.
- [X] T004 Crear el esqueleto de `src/app/api/agents/listing/route.ts`: parsear el body
      `{ product_candidate_id: string, competitor_asins?: string[] }`, hacer `fetch` del
      `product_candidate` por `id` (404 si no existe — mismo mensaje/formato que
      `src/app/api/agents/analyst/route.ts`), y validar que `raw_data.catalog` no sea
      `null`/`undefined` — si falta, responder 422 con el mensaje del contrato
      (`contracts/listing-agent-api.md`) y **NO** crear fila en `agent_runs` (FR-017,
      Clarifications Q5 — mismo patrón de rechazo temprano que el chequeo de veredicto
      en `src/app/api/agents/supplier/route.ts`).
- [X] T005 Dentro del mismo `route.ts`, agregar la creación de la fila en `agent_runs`
      (`agent_name: 'listing_agent'`, `status: 'running'`) inmediatamente después de que
      T004 confirma que el candidato es válido, y el bloque try/catch que la actualiza a
      `'completed'`/`'failed'` al final del handler (FR-010) — mismo patrón try/catch que
      `src/app/api/agents/procurement/rfq/route.ts`.

**Checkpoint**: Endpoint protegido, con manejo de candidato inválido y trazabilidad en
`agent_runs` — listo para que US1 y US2 agreguen su lógica específica.

---

## Phase 3: User Story 1 - Generar contenido de listing optimizado (Priority: P1) 🎯 MVP

**Goal**: Dado un `product_candidate` con `raw_data.catalog`, generar título, ≥5
bullets, descripción, backend search terms y propuesta de A+ Content, señalando
explícitamente cualquier elemento que no se pudo generar por falta de dato.

**Independent Test**: `quickstart.md` Escenario 1 — `POST /api/agents/listing` sin
`competitor_asins`, verificar que `listing.bullets.length >= 5` y `comparison: null`.

### Implementation for User Story 1

- [X] T006 [P] [US1] Definir `listingDraftSchema` (Zod) en `src/lib/claude-analysis.ts`:
      `title: z.string()`, `bullets: z.array(z.string())` (el system prompt de T007 debe
      exigir un mínimo de 5, FR-001), `description: z.string()`,
      `backendSearchTerms: z.array(z.string())`, `missingElements:
      z.array(z.string())` (señalización de FR-003), `itemHighlights: z.string()`
      (FR-018, máximo 125 caracteres — el system prompt de T007 debe exigir ese
      límite), `aPlusContent:
      z.array(z.object({ tema: z.string(), contenidoEsperado: z.string() }))` (FR-008)
      — mismos nombres de campo que `contracts/listing-agent-api.md` § `listing`, sin
      capa de traducción entre el schema Zod y la respuesta HTTP (I1 del reporte de
      `/speckit-analyze` — mismo patrón que `supplierPriceBreakSchema`/
      `supplierOptionSchema` en este mismo archivo, que ya usan camelCase para sus campos
      estructurales) — un solo schema que cubre tanto US1 como US3 en la misma llamada
      (research.md, Decisión 4 — no crear un schema separado para A+ Content).
- [X] T007 [US1] Escribir el system prompt de generación de listing en
      `src/lib/claude-analysis.ts` (constante `LISTING_DRAFT_SYSTEM_PROMPT`) que exige
      explícitamente: (a) basar todo el contenido únicamente en
      `raw_data.catalog`/`raw_data.analysis`/`raw_data.analyst`/`raw_data.review_intelligence`
      del candidato, nunca inventar atributos, certificaciones o afirmaciones no
      sustentadas (FR-002); (b) cuando falte un dato necesario para generar un elemento,
      agregarlo a `missingElements` en vez de generar ese elemento igual (FR-003);
      (c) generar al menos 5 bullets (FR-001); (d) incluir la propuesta de A+ Content en
      la misma respuesta (FR-008); (e) respetar los límites de caracteres/bytes reales
      de Amazon (C2 del reporte de `/speckit-analyze` — confirmados contra
      sellercentral.amazon.com y fuentes de referencia 2026, no inventados; este repo no
      tenía ningún precedente propio que los manejara): `title` ≤ 75 caracteres
      (regla vigente desde el 27 jul 2026, confirmado en el foro oficial de Seller
      Central); cada `bullet` ≤ 255 caracteres; el conjunto de `backendSearchTerms`
      ≤ 249 bytes en total (no por término — es un límite compartido entre todos los
      términos, y se mide en bytes, no caracteres: un carácter multibyte cuenta más de
      1). Explicar en el prompt que exceder el límite de `backendSearchTerms` hace que
      Amazon descarte el campo completo en silencio, no que lo trunque — para que el
      prompt priorice quedarse corto sobre arriesgarse a pasarse; (f) generar Item
      Highlights de máximo 125 caracteres (FR-018), aclarando que es contenido
      complementario al título, no una repetición — Amazon movió ahí justo el
      contenido que el título recortado a 75 caracteres ya no puede llevar, así que
      Item Highlights debe cubrir lo que el título tuvo que dejar fuera, no repetirlo.
      (depende de T006)
- [X] T008 [US1] Implementar `generateListingDraft(candidateRawData: unknown):
      Promise<ListingDraftResult>` en `src/lib/claude-analysis.ts`, con el mismo patrón
      `client.messages.parse({ model: MODEL, ..., output_config: { format:
      zodOutputFormat(listingDraftSchema) } })` ya usado por las 5 funciones de análisis
      existentes en ese archivo. (depende de T006, T007)
- [X] T009 [US1] En `src/app/api/agents/listing/route.ts`, llamar a
      `generateListingDraft(candidate.raw_data)` y hacer `upsert` en `listing_drafts`
      con `onConflict: 'product_candidate_id'` (constraint `unique` de T001, FR-015 — la
      fila anterior del mismo candidato se reemplaza por completo, no se conserva
      historial). (depende de T004, T008)
- [X] T010 [US1] Completar la respuesta `200` del endpoint con la forma exacta descrita
      en `contracts/listing-agent-api.md`: `{ listingDraftId, listing: { title, bullets,
      description, itemHighlights, backendSearchTerms, missingElements, aPlusContent },
      comparison: null }` cuando no se recibió `competitor_asins`. (depende de T009)

**Checkpoint**: User Story 1 funcional de forma independiente — validar con
`quickstart.md` Escenario 1 antes de continuar.

---

## Phase 4: User Story 2 - Comparar el listing propio contra el top 10 de competidores (Priority: P2)

**Goal**: Dado el Listing Draft de US1 y hasta 10 ASINs competidores, reportar gaps de
keywords, atributos faltantes y diferencias de estructura, cada uno con su nivel de
confianza calculado de forma determinística.

**Independent Test**: `quickstart.md` Escenario 2 (comparación completa) y Escenario 5
(falla total de la fuente) — ambos ejercitan esta historia sin depender de US3.

### Implementation for User Story 2

- [X] T011 [P] [US2] Agregar la validación de `competitor_asins` en
      `src/app/api/agents/listing/route.ts`: acepta de 0 a 10 strings (FR-004); 400 si
      trae más de 10 o si algún elemento no cumple el patrón de ASIN ya usado en
      `src/lib/sp-api.ts` (`isAsin()`).
- [X] T011b [P] [US2] En el mismo validador de `route.ts` (antes de crear la fila en
      `agent_runs`), rechazar con 400 explícito si el body incluye cualquiera de estas
      keys relacionadas a PPC/Advertising: `manage_ppc`, `bids`, `campaign_id`,
      `acos_target`, `ppc` — mensaje exacto de FR-011: "PPC/Advertising está fuera de
      alcance, bloqueado por falta de acceso a Amazon Ads API". **No** crear fila en
      `agent_runs` para este caso (mismo patrón de rechazo temprano que T004) — C1 del
      reporte de `/speckit-analyze`. Nota: esta validación aplica a cualquier request a
      este endpoint, no solo a los que traen `competitor_asins` — se agrupa aquí junto a
      T011 por ser la otra validación de body, no porque dependa de US2.
- [X] T012 [US2] Implementar, dentro de `route.ts`, el loop de resolución de
      competidores reutilizando `getCatalogItem(asin)` de `src/lib/sp-api.ts` **sin
      modificar ese archivo** (plan.md, Project Structure): capturar `SpApiError` por
      cada ASIN individualmente sin abortar el loop, acumulando
      `competitorAsinsResolved` (los que sí devolvieron catálogo) vs.
      `competitorAsinsRequested` (FR-009). (depende de T011)
- [X] T013 [US2] Aplicar la regla de research.md Decisión 3 en `route.ts`: si
      `competitor_asins.length >= 1` y `competitorAsinsResolved.length === 0`, fijar
      `comparison.status = 'sin_fuente_datos'` y saltar la llamada a Claude de
      comparación — el Listing Draft de US1 (T009/T010) se sigue entregando igual en la
      misma respuesta (FR-016). (depende de T012)
- [X] T014 [P] [US2] Definir `listingComparisonSchema` (Zod) en
      `src/lib/claude-analysis.ts`: `keywordGaps`, `missingAttributes`,
      `structuralDifferences` — cada uno `z.array(z.object({ texto: z.string(),
      asinsSustento: z.array(z.string()) }))` — mismos nombres que
      `contracts/listing-agent-api.md` § `comparison`/`ComparisonItem`, sin capa de
      traducción (I1 del reporte de `/speckit-analyze`; nota aparte: `data-model.md`
      documenta este mismo campo como `asins_sustento` en su interfaz TypeScript de
      `ComparisonItem` — desalineado con el `asinsSustento` de `contracts/`. Se sigue
      aquí el nombre de `contracts/` por ser el que de verdad viaja en el JSON de
      Zod→HTTP; `data-model.md` queda con esa inconsistencia menor sin corregir, fuera
      del alcance de este ajuste). **NO** incluir un campo `confianza` en este schema —
      Claude nunca calcula el porcentaje (research.md, Decisión 2).
- [X] T015 [US2] Escribir el system prompt de comparación en
      `src/lib/claude-analysis.ts` (constante `LISTING_COMPARISON_SYSTEM_PROMPT`) que
      instruye explícitamente: (a) basar cada gap únicamente en los datos de catálogo
      reales de los competidores resueltos (nunca inventar); (b) para
      `diferencias_estructura`, limitarse a cantidad de bullets y cantidad de imágenes —
      **prohibido** reportar presencia/ausencia de A+ Content, ese dato no existe en
      `getCatalogItem()` para ningún ASIN (research.md, Decisión 6); (c) por cada gap,
      listar en `asins_sustento` exactamente qué ASINs competidores lo sustentan, sin
      calcular ningún porcentaje ni nivel de confianza. (depende de T014)
- [X] T016 [US2] Implementar `compareListingToCompetitors(listingDraft:
      ListingDraftResult, competitorCatalogData: unknown[]):
      Promise<ListingComparisonResult>` en `src/lib/claude-analysis.ts`, mismo patrón
      `messages.parse` + `zodOutputFormat`. (depende de T014, T015)
- [X] T017 [US2] Implementar el cálculo determinístico de confianza como función pura en
      `src/lib/claude-analysis.ts` (o `src/lib/listing-comparison-confidence.ts`, a
      decidir en implementación): para cada gap, `confianza = 'alta'` si
      `asins_sustento.length / competitorAsinsResolved.length >= 0.7`; `'media'` si el
      cociente es `> 0` y `< 0.7`; `'sin_dato'` si `asins_sustento` queda vacío o el gap
      no es comparable (FR-014, research.md Decisión 2) — **no** se calcula dentro del
      prompt de T015. (depende de T016)
- [X] T018 [US2] En `src/app/api/agents/listing/route.ts`, integrar T012-T017 en el
      flujo completo: si `competitor_asins` viene vacío u omitido, `comparison: null`
      sin llamar a Claude en absoluto (FR-004, Clarifications Q2); si no, ejecutar
      T012→T013→T016→T017 y hacer `upsert` de los campos de comparación en la misma fila
      de `listing_drafts` que T009 (research.md, Decisión 5 — una sola fila, un solo
      upsert). (depende de T009, T013, T017)

**Checkpoint**: User Story 1 y 2 funcionales de forma independiente — validar con
`quickstart.md` Escenarios 1, 2, 3 y 5 antes de continuar.

---

## Phase 5: User Story 3 - Sugerencias de A+ Content (Priority: P3)

**Goal**: Que la propuesta de estructura de A+ Content (tema + contenido esperado por
módulo) llegue correctamente al usuario como parte del resultado.

**Independent Test**: `quickstart.md` Escenario 1 — el mismo request de US1 ya debe
incluir `listing.aPlusContent` con al menos 1 módulo.

### Implementation for User Story 3

- [ ] T019 [US3] Validar que el campo `aPlusContent` generado por T006-T008 (misma
      llamada a Claude que US1, por decisión de diseño explícita en research.md Decisión
      4 — no hay una función ni un endpoint separado para esta historia) se expone
      correctamente en la respuesta de `route.ts` con al menos 1 módulo (`tema` +
      `contenidoEsperado`) para un candidato con datos de catálogo completos. Si falta
      algo, el ajuste va en el prompt de T007, no en código nuevo. (depende de T010)

**Checkpoint**: Las 3 user stories funcionales — `quickstart.md` Escenario 1 confirma
US1 y US3 en la misma corrida.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Documentación y validación final, consistente con cómo se cerraron las
Fases 1-4 de este mismo repo.

- [ ] T020 [P] Documentar el Listing Agent en `AGENTS.md`: nueva subsección bajo
      `## Agents` (mismo nivel de detalle que Scout/Analyst/Review
      Intelligence/Supplier/Procurement/Buy Simulator), agregar `listing_drafts` a
      `## Database schema`, y agregar la nueva ruta a la lista de `## Protected routes`.
- [ ] T021 Correr `npx tsc --noEmit`, `npm run lint` y `npm run build` y confirmar que
      los tres pasan limpio (mismo gate usado para cerrar las Fases 1-4).
- [ ] T022 Correr los 5 escenarios de `specs/008-listing-agent/quickstart.md` contra un
      candidato real (ver candidatos de ejemplo ya listados ahí:
      `c569d3b3-8402-464a-a4c6-1ddc6cb71036` o
      `e5d485e3-b4e4-4eab-af8f-f1df2d98a0c4`) y confirmar en Supabase que cada corrida
      exitosa deja una fila en `agent_runs` con `agent_name: 'listing_agent'`
      (Principio 7 de la constitución).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Sin dependencias — puede empezar de inmediato.
- **Foundational (Phase 2)**: Depende de Phase 1 completo — bloquea Phase 3 y Phase 4.
- **US1 (Phase 3)**: Depende de Phase 2. Sin dependencia de US2/US3.
- **US2 (Phase 4)**: Depende de Phase 2 para el esqueleto del endpoint, y de **T009**
  específicamente (US1) para tener un Listing Draft contra el cual comparar — no es
  completamente independiente de US1 en este caso, porque la comparación por diseño
  (research.md, Decisión 1) siempre compara contra el draft recién generado, nunca
  contra el listing vivo de Amazon.
- **US3 (Phase 5)**: Depende de T006-T010 (US1) por completo — comparte la misma
  llamada a Claude (research.md, Decisión 4). No tiene tareas de implementación propias,
  solo de validación.
- **Polish (Phase 6)**: Depende de que Phase 3, 4 y 5 estén completas.

### Parallel Opportunities

- T006 (US1) puede iniciarse en paralelo con T003-T005 (Foundational) si se coordina
  bien el orden de merge, ya que toca un archivo distinto (`claude-analysis.ts` vs.
  `proxy.ts`/`route.ts`).
- T011 y T014 (ambas [P], US2) pueden trabajarse en paralelo entre sí — tocan partes
  distintas de `route.ts`/`claude-analysis.ts` sin depender una de la otra todavía.
- T020 (Polish, documentación) puede iniciarse en paralelo con T021/T022 una vez que
  Phase 3-5 están completas, ya que no depende de que el build/quickstart hayan corrido.

---

## Parallel Example: User Story 1

```bash
# T006 puede iniciarse en paralelo con el cierre de Foundational (T003-T005):
Task: "Definir listingDraftSchema (Zod) en src/lib/claude-analysis.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Completar Phase 1: Setup (migración `listing_drafts`)
2. Completar Phase 2: Foundational (endpoint protegido + validación de candidato +
   `agent_runs`)
3. Completar Phase 3: User Story 1
4. **DETENERSE Y VALIDAR**: correr `quickstart.md` Escenario 1 contra un candidato real
5. Desplegar/demo si está listo — ya es un Listing Agent funcional, aunque sin
   comparación de competidores

### Incremental Delivery

1. Setup + Foundational → base lista
2. Agregar US1 → validar con Escenario 1 → deploy (MVP)
3. Agregar US2 → validar con Escenarios 2, 3, 5 → deploy
4. Agregar US3 (solo validación, comparte código con US1) → confirmar con Escenario 1
5. Polish: documentación + gates de calidad + corrida completa de `quickstart.md`

---

## Notes

- [P] = archivos distintos, sin dependencias entre sí.
- [Story] mapea cada tarea a su user story para trazabilidad.
- A diferencia del template genérico, US2 y US3 **no** son completamente independientes
  de US1 en esta feature — ambas dependen de que el Listing Draft de US1 exista primero,
  por decisiones de diseño explícitas en research.md (Decisión 1 y Decisión 4). Esto está
  documentado arriba en vez de forzar una independencia que el propio research.md ya
  descartó.
- Sin tareas de test automatizado — ver nota al inicio del archivo.
- Commitear después de cada tarea o grupo lógico, igual que en las Fases 1-4 de este
  repo (spec.md → plan.md → código → `AGENTS.md` → commit, revisión, push).
