# API Contract: Listing Agent

## `POST /api/agents/listing`

Protegido con el mismo Basic Auth que el resto de rutas de agentes
(`src/proxy.ts`, FR-012).

### Request

```jsonc
{
  "product_candidate_id": "uuid",       // requerido
  "competitor_asins": ["ASIN1", "..."]  // opcional, 0-10 ASINs (FR-004)
}
```

### Responses

**404** — `product_candidate_id` no existe.

```jsonc
{ "error": "No se encontró el candidato \"<id>\": <detalle>" }
```

**422** — el candidato no tiene ningún dato de catálogo (FR-017,
Clarifications Q5). No se crea fila en `agent_runs` (mismo patrón que el
rechazo por veredicto del Supplier Agent).

```jsonc
{ "error": "El candidato \"<id>\" no tiene datos de catálogo (el Scout Agent no ha corrido sobre él). Genera el candidato con el Scout Agent primero." }
```

**400** — `competitor_asins` trae más de 10 ASINs, o algún elemento no
tiene forma de ASIN.

```jsonc
{ "error": "Body inválido: competitor_asins acepta de 0 a 10 ASINs" }
```

**200** — éxito. `comparison` es `null` si `competitor_asins` vino vacío o
ausente (FR-004/Clarifications Q2).

```jsonc
{
  "listingDraftId": "uuid",
  "listing": {
    "title": "string",
    "bullets": ["string", "..."],       // >= 5
    "description": "string",
    "itemHighlights": "string",         // <= 125 caracteres (FR-018)
    "backendSearchTerms": ["string", "..."],
    "missingElements": ["string", "..."],  // FR-003; [] si no faltó nada
    "aPlusContent": [
      { "tema": "string", "contenidoEsperado": "string" }
    ]
  },
  "comparison": null | {
    "status": "complete" | "sin_fuente_datos",
    "competitorAsinsRequested": ["string", "..."],
    "competitorAsinsResolved": ["string", "..."],
    "keywordGaps": [ComparisonItem, "..."],
    "missingAttributes": [ComparisonItem, "..."],
    "structuralDifferences": [ComparisonItem, "..."],
    "notaMetodologica": "string"
  }
}
```

Donde `ComparisonItem` es:

```jsonc
{
  "texto": "string",
  "confianza": "alta" | "media" | "sin_dato",   // FR-014
  "asinsSustento": ["string", "..."]
}
```

**500** — fallo inesperado (Claude, Supabase, etc.). Mismo patrón que el
resto de agentes: se marca `agent_runs.status = 'failed'` con
`error_message`, y se responde:

```jsonc
{ "error": "<mensaje>" }
```

### Comportamiento por caso (referencia cruzada a spec.md)

| Caso | Referencia | Resultado |
|---|---|---|
| 0 `competitor_asins` | FR-004, Clarifications Q2 | `comparison: null`, `listing` completo igual |
| 1-10 `competitor_asins`, todos resuelven | FR-004 | `comparison.status: 'complete'`, `competitorAsinsResolved.length === competitorAsinsRequested.length` |
| Algunos ASINs no resuelven | FR-009 | `comparison.status: 'complete'`, `competitorAsinsResolved.length < competitorAsinsRequested.length` |
| Ningún ASIN resuelve (≥1 solicitado) | FR-016, Clarifications Q4 | `comparison.status: 'sin_fuente_datos'`, `keywordGaps`/`missingAttributes`/`structuralDifferences` vacíos, `listing` se entrega igual |
| Candidato sin dato de catálogo | FR-017, Clarifications Q5 | 422, sin `agent_runs` |
| Candidato con Listing Draft previo | FR-015, Clarifications Q3 | Upsert — la fila anterior se reemplaza |
