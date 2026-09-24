# Data Model: Listing Agent (Fase 5, parte 1)

## Entidad: `listing_drafts`

Una fila por `product_candidate` (upsert en cada corrida — ver research.md,
Decisión 5). Restringida a `service_role`, RLS activo, igual que el resto de
tablas de agentes.

| Campo | Tipo | Nullable | Notas |
|---|---|---|---|
| `id` | `uuid` (PK, `gen_random_uuid()`) | No | |
| `created_at` | `timestamptz` | No | `default now()` |
| `updated_at` | `timestamptz` | No | Se actualiza en cada upsert (FR-015). |
| `product_candidate_id` | `uuid` (FK → `product_candidates.id`, `on delete cascade`) | No | `unique` — fuerza la relación 1:1 de FR-015. |
| `title` | `text` | No | |
| `bullets` | `jsonb` (`string[]`) | No | Al menos 5 (FR-001). |
| `description` | `text` | No | |
| `item_highlights` | `text` | No (`default ''`) | FR-018. Un solo string (no `jsonb`), mismo criterio que `title`/`description` — a diferencia de `bullets`, Item Highlights no es una lista. Máximo 125 caracteres. |
| `backend_search_terms` | `jsonb` (`string[]`) | No | |
| `missing_elements` | `jsonb` (`string[]`) | No (default `[]`) | Señalización de FR-003: qué elementos no se pudieron generar por falta de dato. |
| `a_plus_content` | `jsonb` (`{ tema: string, contenido_esperado: string }[]`) | No | FR-008. |
| `competitor_asins_requested` | `jsonb` (`string[]`) | Sí | `null` si no se pidió comparación (0 ASINs, FR-004). |
| `competitor_asins_resolved` | `jsonb` (`string[]`) | Sí | Subconjunto de los solicitados que sí devolvieron datos de catálogo (FR-009). |
| `comparison_status` | `text` | Sí | `null` (no se pidió) \| `'complete'` \| `'sin_fuente_datos'` (FR-016). |
| `keyword_gaps` | `jsonb` (`ComparisonItem[]`) | Sí | FR-005. |
| `missing_attributes` | `jsonb` (`ComparisonItem[]`) | Sí | FR-006. |
| `structural_differences` | `jsonb` (`ComparisonItem[]`) | Sí | FR-007. Acotado a lo que `getCatalogItem()` realmente expone: cantidad de bullets y cantidad de imágenes. **Nunca incluye un ítem sobre presencia de A+ Content** — confirmado con una llamada real a Catalog Items (ver research.md, Decisión 6) que ese dato no existe en el response para ningún ASIN, propio o competidor. |
| `nota_metodologica` | `text` | No | Limitaciones de esta corrida (datos no disponibles, ASINs no resueltos, etc.). |

### Forma de `ComparisonItem` (dentro de los tres campos jsonb de arriba)

```typescript
interface ComparisonItem {
  texto: string;                          // descripción del gap
  confianza: 'alta' | 'media' | 'sin_dato'; // FR-014, calculado en código (research.md, Decisión 2)
  asins_sustento: string[];               // qué competidores resueltos sustentan este gap
}
```

**Validation rules**:
- `confianza = 'alta'` si `asins_sustento.length / competitor_asins_resolved.length >= 0.7`.
- `confianza = 'media'` si el cociente anterior es `> 0` y `< 0.7`.
- `confianza = 'sin_dato'` si el gap no es comparable entre competidores (p. ej. atributo no aplicable a la categoría) — `asins_sustento` puede quedar vacío en ese caso.

### State / lifecycle

No hay máquina de estados explícita — cada corrida de
`POST /api/agents/listing` sobrescribe la fila completa (`upsert` por
`product_candidate_id`). `comparison_status` es el único campo que varía
entre corridas de la misma fila dependiendo de si se pidió comparación y si
tuvo éxito:

```text
comparison_status:
  null              -- no se solicitaron ASINs competidores (FR-004)
  'sin_fuente_datos' -- se solicitaron pero 0 se resolvieron (FR-016)
  'complete'         -- al menos 1 se resolvió, keyword_gaps/missing_attributes/
                        structural_differences quedan poblados (posiblemente vacíos
                        si no se encontró ningún gap real)
```

## Relaciones

```text
product_candidates (1) ──── (1) listing_drafts
```

Sin relación con `supplier_searches` ni `procurement_documents` — el
Listing Agent es independiente de la cadena de sourcing (Fases 3-4), solo
depende de `product_candidates.raw_data` (Scout/Analyst/Review
Intelligence).
