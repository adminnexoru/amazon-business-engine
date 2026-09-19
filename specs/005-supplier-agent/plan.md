# Plan: Supplier Agent (Fase 3)

## Stack
- Fuente de datos de proveedores: Apify, actor `scrapesage/alibaba-scraper`
  (`scrapesage~alibaba-scraper` en la URL de la API)
- Motor de análisis/normalización: Claude, vía una nueva función en
  `src/lib/claude-analysis.ts` (mismo patrón `messages.parse` +
  `zodOutputFormat` que Scout/Analyst/Review Intelligence)
- Persistencia: tabla nueva `supplier_searches` (RLS activo, `service_role`
  únicamente), con FK obligatoria a `product_candidates` (a diferencia de
  `review_insights`, aquí no hay modo "standalone" — el spec exige que solo
  corra sobre un candidato con veredicto `test`)
- Trazabilidad: `agent_runs` con `agent_name: 'supplier_agent'`
- Exposición: `POST /api/agents/supplier`, mismo Basic Auth que los demás
  agentes

## Contrato del actor de Apify (confirmado con prueba real)

Input usado en la validación:
```json
{
  "searchTerms": ["<keywords derivadas del título del candidato>"],
  "country": "US",
  "maxProducts": 10,
  "includeProductDetails": true,
  "outputSupplierLeads": true,
  "deduplicateProducts": true
}
```

Output: dos tipos de registro en el mismo dataset —
- `type: "product"` — incluye `priceMin`/`priceMax`, `ladderPrices[]`
  (`minQty`/`maxQty`/`price`), `moq`/`moqUnit`, `attributes[]`,
  `certifications[]`, `packaging` (`unitWeightKg`, `unitVolumeCbm`,
  `unitSize`), `leadTimes[]` (confirmado siempre `null` en la práctica — ver
  Decisiones), `tradeAssurance`, y un objeto `supplier` embebido con las
  señales de confianza.
- `type: "supplier"` — un registro deduplicado por proveedor con
  `leadScore` (0-100), `avgProductPrice`, `productsInRun`, `sampleProducts`.

Costo real observado: $0.048 por 5 productos con detalle completo + lead de
proveedor (~$0.0096/producto todo incluido) — más barato que el "$1.38/1,000"
anunciado en la ficha, porque el evento base "product scraped" no se cobró
por separado del detalle en la corrida de prueba.

## Flujo del endpoint

1. Recibe `{ product_candidate_id }`. Obligatorio — no hay modo standalone.
2. Lee el candidato; si `raw_data.analyst.verdict.veredicto !== 'test'`,
   responde 422 explícito sin loggear intento de búsqueda de proveedores.
3. Genera `searchTerms` a partir de `raw_data.catalog.summaries[0].itemName`
   (o el campo equivalente que confirme Claude Code contra el shape real de
   Scout) — sin pedir input manual.
4. Llama a `scrapesage/alibaba-scraper` vía
   `run-sync-get-dataset-items` (mismo patrón que `reviews-provider.ts`).
5. Si Apify no está configurado, o el dataset viene vacío: guarda
   `status: 'sin_fuente_datos'` / `sin_dato` y corta — no llama a Claude,
   mismo patrón estructural que Review Intelligence.
6. Si hay resultados: normaliza a un máximo de 4 opciones (los registros
   `type: "supplier"` con mayor `leadScore`, cruzados con su producto
   correspondiente) y llama a Claude para construir la comparación final +
   landed cost parcial.
7. Inserta en `supplier_searches`. No hace merge en `raw_data` del candidato
   automáticamente — la selección del usuario sí se registra (ver paso 8),
   pero el resultado de búsqueda en sí queda en su propia tabla porque, a
   diferencia de Review Intelligence, aquí puede haber múltiples corridas de
   sourcing sobre el mismo candidato (proveedor cambia con el tiempo).
8. Endpoint separado `PATCH /api/agents/supplier/:id/select` — registra cuál
   opción eligió el usuario (`selected_supplier_id`, `selected_at`). No
   dispara ninguna acción adicional.

## Reglas de confianza (van en el prompt de Claude, no en código)

- Precio de proveedor: máximo `media`, nunca `alta` — es negociable por
  naturaleza (ver Constitution §6: no inflar confianza más allá de lo que la
  fuente puede sustentar).
- Landed cost: se construye como `priceMin de la opción + fees de Amazon ya
  conocidos en raw_data.analyst` (FBA o FBM, replicar la lógica que ya usa
  Margin en el Analyst). Se marca explícitamente `landed_cost_parcial: true`
  y una nota indicando que excluye flete y aranceles.
- Señales de confianza del proveedor (`verifiedSupplier`, `tradeAssurance`,
  `onTimeDeliveryRate`, `yearsOnAlibaba`) se muestran tal cual las da la
  fuente — no se resumen en un solo score propio en v1, para no ocultar de
  qué dato viene cada señal.

## Decisiones y su razón

- **Elegido `scrapesage/alibaba-scraper` sobre `pro100chok/alibaba-scraper`**:
  ambos ofrecen datos similares, pero `scrapesage` tenía evidencia real de
  uso (11 usuarios, 100% de corridas exitosas) contra 0 reseñas y 3 usuarios
  totales de `pro100chok` — mismo criterio de "probado en producción antes
  que features" que ya aplicamos eligiendo `junglee` sobre `crawlerbros` en
  Fase 2. Si `scrapesage` falla en producción real, `pro100chok` queda como
  plan B (trae mejor auditoría de fábrica y tasa de reorden, relevante para
  pedidos de contenedor más adelante).
- **`leadTimes` confirmado no disponible, con evidencia, no solo suposición**:
  el campo existe en el schema del actor pero llegó `null` en los 5
  productos de la prueba real — confirma la decisión ya tomada en el spec de
  dejar tiempo de entrega en `sin_dato` en v1, ahora con evidencia empírica
  en vez de solo inferencia de que "no existe una fuente pública".
- **Tabla propia `supplier_searches` en vez de reusar `review_insights`**:
  aunque el patrón es similar (Apify + Claude + confianza explícita), el
  contrato es distinto — Review Intelligence puede correr standalone sin
  candidato; Supplier Agent exige un candidato con veredicto `test` como
  requisito de entrada, y necesita un campo de selección del usuario que
  Review Intelligence no tiene.
- **Sin merge automático a `raw_data` del candidato**: a diferencia de
  Review Intelligence, el sourcing de proveedores puede repetirse varias
  veces sobre el mismo candidato (precios y proveedores cambian) — mergear
  automáticamente en `raw_data.supplier` sobrescribiría corridas anteriores
  sin necesidad. Si más adelante se quiere un "proveedor actual" visible en
  el candidato, se resuelve leyendo la última fila de `supplier_searches`
  con `selected_supplier_id` no nulo, no duplicando el dato.
