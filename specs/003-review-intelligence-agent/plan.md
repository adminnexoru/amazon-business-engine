# Plan: Review Intelligence Agent (Fase 2)

## Stack
- Fuente de reviews: Apify, actor `junglee/amazon-reviews-scraper`
- Motor de análisis: Claude, vía `analyzeCompetitorReviews()` en
  `src/lib/claude-analysis.ts` (mismo patrón `messages.parse` +
  `zodOutputFormat` que Scout/Analyst)
- Persistencia: tabla nueva `review_insights` (RLS activo, `service_role`
  únicamente), con merge opcional en `raw_data.review_intelligence` del
  `product_candidate` cuando aplica el modo B
- Trazabilidad: `agent_runs` con `agent_name: 'review_intelligence_agent'`
- Exposición: `POST /api/agents/review-intelligence`, mismo Basic Auth que
  Scout/Analyst
- Límite de gasto: `REVIEW_AGENT_MAX_ASINS_PER_RUN` (default 5)

## Decisiones y su razón
- **Evaluación de proveedor de datos** (comprar vs. construir, ver
  Constitution §9): se descartó construir un scraper propio por el riesgo
  de exponer la cuenta de vendedor activa a una violación de los Términos
  de Servicio de Amazon, y por la imposibilidad de obtener historial
  retroactivo. Se evaluaron Rainforest API, Bright Data, OpenWeb Ninja y
  Apify; se eligió Apify por ser pay-per-uso sin compromiso mensual.
- **Selección del actor de Apify, por prueba real, no por documentación**:
  - `crawlerbros/amazon-reviews-scraper` — descartado: fuerza proxy
    residencial de EE.UU. incluso contra `amazon.com.mx`, causando timeout
    total (`Page.goto Timeout ... len=0`) pese a que el producto sí tenía
    reviews reales confirmadas manualmente en el navegador.
  - `agenscrape/amazon-mexico-product-scraper` — descartado: solo devuelve
    el conteo de reviews, no el texto.
  - `junglee/amazon-reviews-scraper` — elegido: auto-selecciona el país del
    proxy según el dominio de Amazon de destino ("Auto-selecting proxy
    country based on the Amazon website domain"), validado extrayendo el
    texto completo de una review real en `amazon.com.mx`.
- **Regla de "nunca inventar datos" implementada estructuralmente, no solo
  en el prompt**: el endpoint tiene dos `return` tempranos (sin fuente
  configurada; cero reviews encontradas) antes del punto del código donde
  se invoca a Claude — no es un `if` que Claude podría "saltarse", es
  imposible llegar a la llamada a Claude sin reviews reales.
- **Esquema de salida sin `.min(1)` en los arrays de cada categoría**: un
  ítem sin sustento se omite del array en vez de forzarse a existir con una
  confianza inventada. Los ítems individuales solo aceptan `alta`/`media` —
  `sin_dato` es exclusivo de `confianza_general`.
- **Limitación de datos aceptada conscientemente**: el actor no parsea
  fechas en español (`date` siempre `null`); se conserva el texto crudo de
  `reviewedIn` sin parsear en vez de fabricar una fecha ISO.
- **Condición de carrera conocida y no resuelta**: Scout, Analyst y Review
  Intelligence leen y reescriben `raw_data` del mismo `product_candidate`
  sin lock optimista. Preexistente a esta fase; documentado, no bloqueante.
