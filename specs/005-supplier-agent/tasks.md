# Tasks: Supplier Agent (Fase 3)

- [x] T1: Migración `supplier_searches` en Supabase — creada y aplicada al
      proyecto real (`supabase db push` confirmado, tabla vacía tras crearse)
- [x] T2: `src/lib/supplier-provider.ts` — cliente de Apify
      (`getSupplierOptions`), con `NoSupplierSourceConfiguredError` cuando
      faltan las variables de entorno; separa el dataset crudo en `products`
      (precio/MOQ/ladder prices/packaging) y `leads` (señales de confianza
      por proveedor, deduplicadas)
- [x] T3: `analyzeSupplierOptions()` en `claude-analysis.ts` — schema Zod con
      `confianza_precio` limitado a `['media', 'sin_dato']` (sin `'alta'` como
      opción posible en el enum) y `landed_cost_parcial` con `es_parcial: true`
      literal. Bug real detectado y corregido antes del commit: la primera
      versión sumaba `unit_price_usd` (USD) + `amazon_fees_mxn` (MXN) sin tasa
      de cambio — se corrigió para dejar `total_parcial_mxn: null` sin
      conversión real, reportando ambos montos por separado en vez de un
      total fabricado.
- [x] T4: Endpoint `POST /api/agents/supplier` — valida
      `raw_data.analyst.verdict.veredicto === 'test'` ANTES de crear la fila
      en `agent_runs` (un rechazo no se loggea como intento, confirmado en
      código, no solo en comentario); las ramas `sin_fuente_datos` y
      `leads.length < 2` cortan antes de llamar a Claude, mismo patrón
      estructural que Review Intelligence
- [x] T5: Endpoint `PATCH /api/agents/supplier/[id]/select` — valida que el
      `selected_supplier_id` exista entre las `options` guardadas; solo
      actualiza `selected_supplier_id`/`selected_at`, sin disparar ninguna
      otra acción
- [x] T6: Rutas protegidas (`src/proxy.ts`) y documentación (`AGENTS.md`:
      Database schema, Agents, Protected routes, variable de entorno
      `APIFY_SUPPLIER_ACTOR_ID`) actualizadas
- [x] T7: Prueba end-to-end real sobre un candidato con veredicto `test`
      (ASIN `B0DK8X1WWV`, auriculares JKMX). Evidencia:
      - `supplier_search_id` guardado con `status: 'complete'`,
        `agent_runs` cerrado (`duration_ms: 48031`)
      - 4 opciones devueltas, las 4 con `confianza_precio: "media"` (nunca
        `alta`) y `total_parcial_mxn: null` en las 4 — el fix de monedas
        funcionando como se diseñó
      - Las 4 opciones elegidas coinciden exactamente con los 4 `leadScore`
        más altos del dataset crudo (75, 73, 63, 60) — selección no
        arbitraria
      - `priceBreaks`/`moq` de cada opción coinciden exacto con el dataset
        crudo de Apify — sin redondeo ni invención en el camino
      - `senales_confianza_proveedor` reporta honestamente señales débiles
        cuando existen (ej. "rating 0 con 0 reseñas", "75% — la más baja del
        set") en vez de omitirlas

## Pendientes descubiertos durante la prueba (no bloqueantes, pero reales)

- [ ] T8: El `searchTerm` usado en v1 es el `itemName` completo tal cual
      (español, largo, sin traducir) — spec.md lo permite explícitamente
      ("no optimices extracción de keywords todavía"), pero la prueba real
      reveló que esto sí degrada la relevancia de resultados: con el
      candidato JKMX ("...Rosa en Forma de Corazón...") como keyword, los 10
      productos devueltos fueron auriculares genéricos de gaming/deporte —
      ninguno en forma de corazón — mientras que una prueba anterior con
      keyword corta en inglés ("heart shaped wireless earbuds bluetooth") sí
      devolvió productos literalmente con esa forma. Alibaba parece ignorar
      el diferenciador en español y matchear solo por términos técnicos en
      inglés (wireless/bluetooth/5.3). Pendiente: traducir/extraer keywords
      relevantes antes de buscar, en vez de mandar el título completo tal
      cual — de lo contrario los proveedores comparados pueden no ser
      realmente comparables al producto del candidato.
- [x] T9: Prueba real del rechazo 422 — candidato café La Parroquia
      (B076TMYWFC, veredicto `necesita_mas_datos`, id
      6a57ee58-6861-4a8b-927a-0ea6ddfed99b). Conteo de `agent_runs` con
      `agent_name = 'supplier_agent'` antes: 1. Respuesta: HTTP 422 con
      mensaje explícito. Conteo después: 1 — sin cambio, confirma que el
      rechazo no se loggea. Nota lateral: se descubrió que el candidato del
      reloj (B0FJ4QYJ63) tiene `veredicto: null` (nunca analizado), no
      `necesita_mas_datos` como se asumía — el endpoint maneja correctamente
      cualquier valor distinto a `'test'`, incluido `null`.
- [x] T10: Prueba real de `PATCH .../select`
      (supplier_search_id 4658b0e4-9c28-47ad-9557-734287f29478).
      `selected_supplier_id: "000000000"` (no existe entre las opciones) →
      HTTP 400. `selected_supplier_id: "200719916"` (existe, mayor
      leadScore) → HTTP 200, fila actualizada con
      `selected_supplier_id: "200719916"`,
      `selected_at: "2026-09-19T19:59:08.137+00:00"`.
- [ ] T11: Cruce manual de al menos una de las 4 opciones contra la página
      real de Alibaba (abrir el `supplierUrl`/`url` del producto) — no se
      hizo en esta prueba; la confianza actual se basa en verificación
      estructural (coincidencia con el dataset crudo, orden por leadScore),
      no en confirmación visual directa como sí se hizo con las reviews de
      Amazon en Fase 2.
