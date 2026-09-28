# Tasks: Estabilización — pendientes de las Fases 1 a 3

**Input**: `specs/009-pendientes-fases-1-3/spec.md`

Cada tarea viene de una spec anterior. El texto completo, con su evidencia y contexto, sigue en el `tasks.md` de origen, marcado como "Movida a 009".

## Format: `[ID] [P?] [Story] Description (origen)`

- **[P]**: se puede hacer en paralelo (archivos distintos, sin dependencias).
- **[Story]**: historia de usuario de `spec.md`.

## User Story 1 - Tests automatizados de "no inventar datos" (P1)

- [ ] T001 [P] [US1] Contract test del schema de salida de Claude en el Scout: un test automatizado que falle en CI si el schema de `analyzeCatalogItem` se relaja (campo eliminado o vuelto opcional). Hoy `zodOutputFormat` fuerza el schema en tiempo de ejecución, pero no hay test de regresión. (origen: `001-scout-agent`, T7, parcial)
- [ ] T002 [P] [US1] Test de "no inventar datos" en el Scout: con la respuesta de catálogo de un ASIN pobre (fixture), verificar que los campos sin sustento quedan vacíos y no rellenados. Hoy solo se validó a mano. (origen: `001-scout-agent`, T8)
- [ ] T004 [P] [US1] Test de regresión del Analyst: mientras no exista una fuente de historial conectada, Trend, Sales estimate y Revenue estimate quedan en `sin_dato`. (origen: `002-product-analyst-agent`, T8)

## User Story 2 - Integridad y costo de `raw_data` (P2)

- [ ] T005 [US2] Resolver la condición de carrera en `raw_data`, compartido por Scout, Analyst y Review Intelligence: función `update` atómica en Supabase (merge jsonb en la base) o lock optimista con columna de versión, vía migración. Actualizar la sección "Pendientes conocidos" de `AGENTS.md` al cerrar. (origen: `003-review-intelligence-agent`, T10)
- [ ] T006 [P] [US2] Medir el tamaño real de `ourProductContext` (todo el `raw_data` serializado) con un candidato que ya tenga análisis del Analyst y de Review Intelligence; si infla el costo del prompt, recortarlo a las claves que se usan. (origen: `003-review-intelligence-agent`, T11)

## User Story 3 - Auditabilidad y calidad (P3)

- [ ] T003 [US3] Pasar los riesgos cualitativos del Analyst de texto libre a un campo estructurado `risk_flags: { tipo: 'hazmat' | 'brand_authorization' | 'perishable' | ..., severidad: 'alta' | 'media' | 'baja', detalle: string }[]`. Para `hazmat`, la severidad distingue la excepción regulatoria (caso B0FJ4QYJ63: baja) de la clasificación de peligro con grupo de embalaje (caso B0DK8X1WWV: alta). Reemplaza el pendiente `hazmat_risk` de `AGENTS.md`. (origen: `002-product-analyst-agent`, T7)
- [ ] T007 [P] [US3] Agregar `asins_evidencia: string[]` a cada ítem del schema Zod de `ReviewInsightItem`, además de `evidencia_count`, para auditar la regla de "≥2 ASINs distintos" en los ítems `alta` sin cruzar a mano el JSON crudo. (origen: `003-review-intelligence-agent`, T12)
- [ ] T009 [P] [US3] Traducir o extraer keywords relevantes en inglés antes de buscar en Alibaba, en vez de mandar el `itemName` completo en español; conservar los diferenciadores (p. ej. "heart shaped"). (origen: `005-supplier-agent`, T8)

## User Story 4 - Validaciones con datos reales (P3)

- [ ] T008 [US4] Prueba end-to-end con un ASIN con baja proporción de calificaciones sin texto (`totalWrittenReviews / totalRatings` alto), para validar la rama `media` de Rating, la única sin evidencia real. Registrar aquí los IDs. (origen: `004-reviews-rating-improvement`, T13)
- [ ] T010 [US4] Cruzar a mano al menos una opción de una corrida real del Supplier contra su página de Alibaba (`supplierUrl`/`url`): precio, MOQ y señales de confianza. Registrar aquí la evidencia. (origen: `005-supplier-agent`, T11)

## Dependencies & Execution Order

- T001, T002 y T004 dependen de la CI (`.github/workflows/ci.yml`) y de agregar un runner de tests al proyecto (hoy no hay ninguno).
- T005 va antes de cualquier agente nuevo que escriba en `raw_data`.
- T003, T005 y T009 requieren `plan.md` antes de implementarse.
- T008 y T010 no tienen dependencias de código.
