# Feature Specification: Estabilización — pendientes de las Fases 1 a 3

**Feature Branch**: `009-pendientes-fases-1-3`

**Created**: 2026-09-28

**Status**: Draft

**Input**: Consolidar en una sola spec las tareas que quedaron abiertas al cerrar las Fases 1 (Scout), 1.5 (Product Analyst), 2 (Review Intelligence), 2.2 (Reviews y Rating del Analyst) y 3 (Supplier), para que esas fases puedan cerrarse en el roadmap y el trabajo pendiente tenga un solo lugar donde planearse y medirse.

## Contexto

Las tareas de esta spec no son nuevas: se descubrieron durante la construcción o la validación de las Fases 1 a 3 y quedaron abiertas en sus `tasks.md`. Mientras seguían ahí, el estado derivado de esas fases era `en-curso` aunque su funcionalidad está entregada y en uso. Esta spec las mueve sin cambiar su alcance. Cada tarea conserva la referencia a su spec y tarea de origen, y el texto original sigue en el `tasks.md` de origen, marcado como movido.

| Origen | Tarea original | Tarea en 009 |
|---|---|---|
| `001-scout-agent` | T7 (parcial): contract test del schema de salida de Claude | T001 |
| `001-scout-agent` | T8: test de "no inventar datos" con un ASIN de catálogo pobre | T002 |
| `002-product-analyst-agent` | T7: campo estructurado `risk_flags` | T003 |
| `002-product-analyst-agent` | T8: test de regresión de Trend/Sales/Revenue en `sin_dato` | T004 |
| `003-review-intelligence-agent` | T10: condición de carrera en `raw_data` | T005 |
| `003-review-intelligence-agent` | T11: tamaño real de `ourProductContext` | T006 |
| `003-review-intelligence-agent` | T12: campo `asins_evidencia` por ítem | T007 |
| `004-reviews-rating-improvement` | T13: validar la rama `media` de Rating con datos reales | T008 |
| `005-supplier-agent` | T8: keywords en inglés antes de buscar en Alibaba | T009 |
| `005-supplier-agent` | T11: cruce manual de una opción contra la página real de Alibaba | T010 |

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Proteger con tests automatizados las reglas de "no inventar datos" (Priority: P1)

Como dueño del sistema, quiero que las garantías de "nunca inventar datos" de Scout y Analyst estén cubiertas por tests automatizados que fallen en CI, para que un cambio futuro no las rompa sin que nadie lo note.

**Why this priority**: Es el principio 5 de la constitución y hoy solo está validado a mano. La CI ya existe, así que estos tests son el primer uso real de ella.

**Independent Test**: Relajar a propósito el schema de salida de Scout, o hacer que el Analyst devuelva un valor en Trend, y confirmar que la CI falla.

**Acceptance Scenarios**:

1. **Given** el schema Zod de `analyzeCatalogItem`, **When** alguien elimina o vuelve opcional un campo obligatorio, **Then** un test automatizado falla (T001).
2. **Given** un ASIN con catálogo pobre, **When** corre el Scout, **Then** los campos sin sustento quedan vacíos (T002).
3. **Given** que no hay una fuente de historial conectada, **When** corre el Analyst, **Then** Trend, Sales estimate y Revenue estimate quedan en `sin_dato` (T004).

### User Story 2 - Integridad y costo de `raw_data` (Priority: P2)

Como dueño del sistema, quiero que dos corridas simultáneas sobre el mismo candidato no se pisen y que el contexto que se manda a Claude no crezca sin límite.

**Why this priority**: La condición de carrera afecta a tres agentes y a cualquier agente futuro que escriba en `raw_data`. El tamaño del prompt impacta el costo de cada corrida.

**Independent Test**: Lanzar dos corridas traslapadas (Analyst y Review Intelligence) sobre el mismo candidato y confirmar que ambos merges quedan en `raw_data`.

**Acceptance Scenarios**:

1. **Given** dos agentes que escriben en `raw_data` del mismo candidato al mismo tiempo, **When** ambos terminan, **Then** las claves de los dos están presentes (T005).
2. **Given** un candidato con análisis del Analyst y de Review Intelligence, **When** se construye `ourProductContext`, **Then** su tamaño real está medido y documentado, y existe un límite si hace falta (T006).

### User Story 3 - Auditabilidad y calidad de los resultados (Priority: P3)

Como dueño del sistema, quiero poder auditar de dónde viene cada hallazgo y cada riesgo, y que la búsqueda de proveedores compare productos realmente comparables.

**Why this priority**: Mejora la confianza en resultados que ya se usan, pero no bloquea el flujo actual.

**Independent Test**: Correr Review Intelligence sobre varios ASINs y verificar, sin revisar el JSON crudo, que cada ítem `alta` declara al menos 2 ASINs.

**Acceptance Scenarios**:

1. **Given** un candidato con riesgos cualitativos (hazmat, autorización de marca, perecibilidad), **When** corre el Analyst, **Then** los riesgos quedan en `risk_flags` estructurado, con tipo y severidad (T003).
2. **Given** un ítem de Review Intelligence con confianza `alta`, **When** se lee el resultado, **Then** `asins_evidencia` lista al menos 2 ASINs distintos (T007).
3. **Given** un candidato con título en español y un diferenciador (p. ej. "en forma de corazón"), **When** corre el Supplier, **Then** la búsqueda en Alibaba usa keywords en inglés que conservan ese diferenciador (T009).

### User Story 4 - Validaciones pendientes con datos reales (Priority: P3)

Como dueño del sistema, quiero cerrar las dos validaciones con datos reales que quedaron sin hacer, para tener evidencia de todas las ramas de confianza.

**Why this priority**: Son pruebas manuales, sin código. Dependen de encontrar un ASIN y una opción de proveedor adecuados.

**Independent Test**: Cada validación deja su evidencia (IDs) en `tasks.md`.

**Acceptance Scenarios**:

1. **Given** un ASIN donde casi todas las calificaciones tienen texto, **When** corre el Analyst, **Then** Rating queda en confianza `media` (T008).
2. **Given** una corrida real del Supplier, **When** se abre la página de Alibaba de una de las opciones, **Then** precio, MOQ y señales de confianza coinciden con lo guardado (T010).

### Edge Cases

- Una tarea de esta spec puede resultar innecesaria al investigarla (p. ej. si `ourProductContext` resulta pequeño). En ese caso se cierra con la evidencia de por qué, no se borra.
- T005 cambia cómo escriben en `raw_data` Scout, Analyst y Review Intelligence. Cualquier agente nuevo que escriba ahí debe usar el mismo mecanismo.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Cada tarea de `tasks.md` DEBE conservar la referencia a su spec y tarea de origen.
- **FR-002**: Los tests de T001, T002 y T004 DEBEN correr en la CI del repo (`.github/workflows/ci.yml`) sin llamar a APIs pagadas (SP-API, Apify, Anthropic): usan fixtures o mocks.
- **FR-003**: T005 DEBE resolverse con un cambio de schema vía migración de Supabase CLI (constitución, principio 3), compartido por los tres agentes.
- **FR-004**: T003 y T007 DEBEN mantener el principio de no inventar datos: un riesgo o un ASIN sin sustento se omite, no se rellena.
- **FR-005**: Las validaciones T008 y T010 DEBEN registrar su evidencia (IDs de candidato, corrida o proveedor) en `tasks.md`.

### Key Entities

- **`product_candidates.raw_data`**: campo jsonb compartido por Scout, Analyst y Review Intelligence (T005, T006).
- **`risk_flags`**: arreglo de `{ tipo, severidad, detalle }` en el resultado del Analyst (T003; diseño propuesto en `002-product-analyst-agent/tasks.md`, T7).
- **`asins_evidencia`**: arreglo de ASINs por ítem de Review Intelligence (T007).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Las Fases 1, 1.5, 2, 2.2 y 3 quedan con estado derivado `completa` en el roadmap.
- **SC-002**: La CI falla si se relaja el schema de Scout o si Trend/Sales/Revenue dejan de ser `sin_dato`.
- **SC-003**: Cero pérdidas de merge en `raw_data` con corridas traslapadas.
- **SC-004**: Las dos ramas posibles de confianza de Rating (`media` y `sin_dato`; `alta` no aplica por diseño) tienen evidencia real.

## Assumptions

- El alcance de cada tarea es el que tenía en su spec de origen. Esta spec no agrega trabajo nuevo.
- `plan.md` se escribe antes de implementar T003, T005 y T009, que requieren decisiones de diseño.
