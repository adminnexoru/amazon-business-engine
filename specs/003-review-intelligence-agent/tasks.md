# Tasks: Review Intelligence Agent (Fase 2)

- [x] T1: Migración `review_insights` en Supabase con RLS
- [x] T2: `src/lib/reviews-provider.ts` — cliente de Apify
      (`getCompetitorReviews`), con `NoReviewsSourceConfiguredError` cuando
      faltan las variables de entorno
- [x] T3: `analyzeCompetitorReviews()` en `claude-analysis.ts` con las 5
      categorías, reglas de confianza por ítem, y `prd_document`
- [x] T4: Endpoint `POST /api/agents/review-intelligence` con las tres ramas
      (sin fuente / cero reviews / éxito) como `return` tempranos
- [x] T5: Proteger rutas `/review-intelligence` y
      `/api/agents/review-intelligence` con Basic Auth
- [x] T6: UI (`/review-intelligence`, `ReviewIntelligenceForm.tsx`) + link
      "Reviews →" desde `/scout`
- [x] T7: Prueba end-to-end real sobre `amazon.com.mx` (1 ASIN, 1 review) —
      confirmó `confianza_general: sin_dato` y categorías vacías sin
      sustento en vez de inventadas
- [x] T8: Documentar en AGENTS.md (Estado del proyecto, Database schema,
      Agents, Protected routes)
- [ ] T9: Prueba end-to-end con 3–5 ASINs reales para validar el caso de
      confianza `alta` (≥3 reviews en ≥2 ASINs) — pendiente, quedó marcada
      al pausar el trabajo de esta fase.
- [ ] T10: Resolver la condición de carrera en `raw_data` compartida entre
      Scout/Analyst/Review Intelligence (función `update` atómica o lock
      optimista) — pendiente, no bloqueante, afecta a las tres fases.
- [ ] T11: Verificar el tamaño real de `ourProductContext` (todo el
      `raw_data` del candidato serializado sin recortar) contra un
      candidato que ya tenga análisis del Analyst, para confirmar que no
      infla el costo del prompt sin que se note.
