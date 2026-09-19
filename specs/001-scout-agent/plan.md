# Plan: Scout Agent (Fase 1)

## Stack
- Fuente de datos: Amazon SP-API (Catalog Items endpoint)
- Motor de análisis: Claude, vía `analyzeCatalogItem()` en
  `src/lib/claude-analysis.ts` (usa `messages.parse` + `zodOutputFormat`,
  patrón luego reutilizado por Analyst y Review Intelligence)
- Persistencia: Supabase / PostgreSQL, tabla `product_candidates`, RLS activo
- Trazabilidad: tabla `agent_runs`
- Exposición: ruta `/api/agents/scout` dentro de la app Next.js en Vercel
- Autenticación: HTTP Basic Auth (`SCOUT_AUTH_USER` / `SCOUT_AUTH_PASSWORD`)
  como variables de entorno

## Decisiones y su razón
- Se eligió Basic Auth sobre un sistema de usuarios completo porque el único
  consumidor de este endpoint hoy es el propio usuario / automatizaciones
  internas, no clientes externos.
- El análisis de "candidato viable" se delega a Claude en vez de reglas
  hardcodeadas, porque los criterios de viabilidad son cualitativos y van a
  evolucionar.
- La validación de schema de salida de Claude se resolvió con
  `zodOutputFormat` a nivel de la llamada a la API (no con un parseo manual
  de texto ni regex), lo cual se convirtió en el patrón estándar del
  proyecto para las tres funciones de análisis (Scout, Analyst, Review
  Intelligence).
