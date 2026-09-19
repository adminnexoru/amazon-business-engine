# Plan: Product Analyst Agent (Fase 1.5)

## Stack
- Fuentes de datos: SP-API Pricing API + SP-API Product Fees API (FBA y FBM)
- Motor de análisis: Claude, vía `analyzeProductCandidate()` en
  `src/lib/claude-analysis.ts` (mismo patrón `messages.parse` +
  `zodOutputFormat` que Scout)
- Persistencia: merge en `raw_data.analyst` del `product_candidate` (misma
  tabla que usa Scout, no una tabla nueva)
- Trazabilidad: `agent_runs` con `agent_name: 'product_analyst_agent'`
- Exposición: mismo patrón de Basic Auth que Scout

## Decisiones y su razón
- Se decidió permitir costo manual ingresado por el usuario para calcular
  Margin en v1, en vez de esperar a que exista el Supplier Agent — evita
  bloquear todo el flujo de evaluación por una fase futura.
- Reviews/BSR/Rating/Trend/Sales estimate/Revenue estimate se dejaron
  originalmente en `sin_dato` por falta de una fuente confiable de
  historial — decisión revisada más adelante en la mejora 2.2 (ver
  `004-reviews-rating-improvement`), que resuelve Reviews y Rating vía
  Apify, pero no Trend/Sales estimate/Revenue estimate (siguen bloqueadas
  sin una fuente de historial tipo Keepa).
- El riesgo hazmat que Claude detecta queda hoy como texto libre dentro de
  `nota_metodologica`/`differentiation`, no como campo estructurado — ver
  pendiente en tasks.md.
