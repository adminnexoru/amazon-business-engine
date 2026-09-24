# Research: Listing Agent (Fase 5, parte 1)

No quedó ningún `NEEDS CLARIFICATION` en el Technical Context del plan —
todas las decisiones técnicas tienen un default directo tomado del resto del
repo. Este documento registra las decisiones que sí requerían elegir entre
alternativas razonables.

## Decisión 1 — Contra qué se compara: el Listing Draft recién generado, no el listing "vivo" en Amazon

**Decision**: La Competitor Comparison (User Story 2) siempre compara el
Listing Draft que el propio agente acaba de generar/regenerar — nunca el
contenido que hoy está publicado en Amazon.

**Rationale**: El spec cubre explícitamente candidatos "ya publicados (o por
publicar)" (Input). Un candidato por publicar no tiene listing vivo con qué
comparar, así que el único artefacto que siempre existe en ambos casos es el
Listing Draft que la propia Fase 1 (User Story 1) acaba de producir. Usar el
draft también mantiene el resultado autocontenido: no depende de una
segunda llamada a SP-API para leer el listing propio ya publicado.

**Alternatives considered**: Leer el listing propio ya publicado vía Catalog
Items API (mismo mecanismo que para competidores) cuando el candidato ya
tiene ASIN activo. Rechazada para v1: agregaría una rama condicional
completa (publicado vs. no publicado) sin que el spec la pida
explícitamente, y el Listing Draft generado es justamente la propuesta que
el agente quiere que el humano evalúe — comparar la propuesta nueva contra
la competencia es más útil que comparar lo que ya existe.

## Decisión 2 — Confianza por gap: calculada en código, no por Claude

**Decision**: Claude identifica los gaps y, por cada uno, la lista de qué
ASINs competidores lo sustentan. El cálculo del nivel de confianza
(`alta`/`media`/`sin_dato`, umbral 70% de FR-014) se hace en TypeScript a
partir de `len(asins_que_sustentan) / len(competidores_resueltos)`, no se le
pide a Claude que haga la aritmética ni que devuelva el nivel directamente.

**Rationale**: El mismo principio ya aplicado en el Buy Simulator (Fase 4):
nunca confiar en un LLM para aritmética que el código puede calcular de
forma determinística y auditable. Pedirle a Claude que compare N items
contra M competidores y calcule un porcentaje por cada uno introduce riesgo
de error aritmético silencioso — algo que ninguna otra parte del sistema
permite (Principio 6 de la constitución exige que la confianza sea
confiable, no solo estar presente).

**Alternatives considered**: Reglas de confianza por instrucción en el
system prompt (como en Review Intelligence, donde Claude sí asigna
`confianza` directamente). Rechazada aquí porque Review Intelligence usa
categorías cualitativas de "cuántas reviews/ASINs" donde un margen de error
humano es aceptable; aquí el spec fija un umbral numérico exacto (70%) que
debe ser reproducible byte a byte, no una apreciación.

## Decisión 3 — Qué cuenta como "falla total de la fuente" (FR-016)

**Decision**: Se considera "fuente no disponible en su totalidad" cuando el
número de competidores solicitados es ≥1 y el número de competidores
resueltos exitosamente es 0 — sin distinguir la causa raíz (token LWA
caído, 5xx de SP-API, etc.). No se agrega detección especial para el fallo
del token LWA compartido.

**Rationale**: Distinguir causas raíz específicas de SP-API añadiría
complejidad sin beneficio observable para el usuario — el resultado que le
importa es el mismo ("no pude comparar contra ningún competidor"). El caso
de 0 ASINs solicitados no activa esta regla (ver FR-004/Clarifications Q2:
ahí simplemente se omite la comparación, no es una falla).

**Alternatives considered**: Capturar específicamente errores de
autenticación LWA (`getAccessToken()` en `sp-api.ts`) como la única señal de
"fuente caída", tratando fallos de ASINs individuales como no relacionados.
Rechazada: `getCatalogItem()` ya encapsula la obtención de token dentro de
`callSpApi()` sin exponerla por separado — distinguir requeriría tocar
`sp-api.ts`, que el plan explícitamente mantiene sin cambios.

## Decisión 4 — Una sola llamada a Claude para Listing Draft + A+ Content

**Decision**: `generateListingDraft()` genera en una sola llamada
título + bullets + descripción + backend search terms + propuesta de A+
Content — no se separan en dos llamadas aunque el spec las priorice como
User Story 1 (P1) y User Story 3 (P3) por separado.

**Rationale**: Las 5 salidas dependen exactamente de los mismos datos de
entrada (`raw_data` del candidato) y del mismo tono/voz de marca — separar
la llamada duplicaría el contexto enviado a Claude sin beneficio, y el
propio Key Entity del spec ("Listing Draft") ya agrupa ambas salidas como
un solo artefacto. Coherente con el patrón ya usado por el Product Analyst
Agent, que también devuelve muchas variables relacionadas en una sola
llamada.

**Alternatives considered**: Separar en `generateListingDraft()` +
`generateAPlusContentSuggestions()`. Rechazada por costo/latencia duplicados
sin que ningún requisito del spec exija que A+ Content pueda generarse de
forma independiente del resto del listing (el Independent Test de User
Story 3 solo exige que el resultado *incluya* la propuesta, no que exista un
endpoint separado).

## Decisión 5 — Persistencia: una tabla, una fila por candidato, upsert

**Decision**: Una sola tabla `listing_drafts` con `product_candidate_id`
`unique`. Cada corrida (`POST /api/agents/listing`) hace upsert sobre esa
fila — Listing Draft y Competitor Comparison viven en la misma fila, ambos
se sobrescriben juntos en cada corrida.

**Rationale**: Directamente lo que pide FR-015 (el draft se reemplaza, no se
versiona) extendido a la comparación por consistencia — no hay ningún
requisito que pida conservar una comparación vieja junto a un draft nuevo.
Una sola tabla también evita el problema de sincronización que ya existe
documentado en "Pendientes conocidos" de AGENTS.md para `raw_data` (dos
tablas separadas escritas en la misma corrida podrían quedar
inconsistentes si una escritura falla a mitad de camino).

**Alternatives considered**: Tabla separada `listing_comparisons` en 1:1 con
`listing_drafts` (como `procurement_documents` respecto a
`supplier_searches`). Rechazada porque ese patrón en Procurement existe
específicamente porque RFQ/PO **sí** se versionan (múltiples documentos por
búsqueda); aquí no aplica esa razón.

## Decisión 6 — La Catalog Items API no expone presencia de A+ Content/Enhanced Brand Content, ni para el candidato propio ni para competidores

**Decision**: `structural_differences` (FR-007) nunca incluye un ítem sobre
"presencia de A+ Content" — ese ejemplo mencionado en el spec ("p. ej. ...
presencia de A+ Content...") no es computable con la fuente de datos
disponible. `structural_differences` se limita a lo que `getCatalogItem()`
realmente devuelve: cantidad de bullets (`attributes.bullet_point.length`)
y cantidad de imágenes (`images[].images.length`) — la comparación de
atributos individuales presentes/ausentes ya queda cubierta por
`missing_attributes` (FR-006), no por este campo.

**Rationale**: Se hizo una llamada real a `getCatalogItem()` (no una
simulación) contra un ASIN competidor real — `B077HFMK1Z`, café Punta del
Cielo, marca ajena, ya usado como competidor real en Fase 2/2.2 de este
repo — con el mismo `includedData` que ya usa `src/lib/sp-api.ts`
(`summaries,attributes,images,salesRanks,productTypes,identifiers,classifications`).
El response completo (371 líneas) solo tiene estas claves top-level:
`asin`, `attributes`, `classifications`, `identifiers`, `images`,
`productTypes`, `salesRanks`, `summaries`. Un `grep` case-insensitive por
`aplus|a_plus|ebc|enhanced|brand_content|rich_content|content` sobre el
JSON completo no encontró ningún match. Esto no es una limitación
específica de "no tenemos acceso a la marca ajena" (como sí pasa con
`buyBoxNewPrice` de la Pricing API, que requiere ser el propio seller): la
Catalog Items API 2022-04-01 simplemente no expone ese dato para ningún
ASIN, propio o ajeno — ni siquiera existe como tipo de `includedData` en
esa versión de la API. La limitación aplica simétricamente: ni el Listing
Draft propio ni ningún competidor pueden compararse en ese eje.

**Alternatives considered**: Inferir presencia de A+ Content indirectamente
(p. ej. de la longitud de `summaries` o de algún patrón en `images`).
Rechazada: sería una heurística no confiable presentada como un hecho
observado, violando el Principio 5 de la constitución ("nunca inventar
datos") — mejor omitir el eje de comparación por completo que fabricar una
señal indirecta poco confiable.
