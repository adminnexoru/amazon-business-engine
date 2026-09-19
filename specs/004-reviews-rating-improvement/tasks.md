# Tasks: Reviews y Rating del Product Analyst vía Apify (Fase 2.2)

- [x] T1: Extender `CompetitorReview` con `total_category_ratings` /
      `total_category_reviews` en `reviews-provider.ts`
- [x] T2: Implementar `summarizeOwnProductReviews()` (maneja array vacío sin
      excepción, sin división por cero)
- [x] T3: Llamar a `getCompetitorReviews([asin])` sobre el ASIN propio desde
      el endpoint del Analyst, con captura de cualquier error como
      "sin datos" (no solo `NoReviewsSourceConfiguredError`)
- [x] T4: Agregar las reglas de confianza (umbrales 0.7/0.7, Rating nunca
      alta) al system prompt de `analyzeProductCandidate()`
- [x] T5: Confirmar una sola escritura a `raw_data.analyst` (no se dobló la
      condición de carrera preexistente)
- [x] T6: Documentar en AGENTS.md (subsección Product Analyst Agent +
      pendiente de costo adicional)
- [x] T7: Typecheck, lint y build pasan limpio
- [ ] T8: Prueba end-to-end con un ASIN real en producción para confirmar
      el comportamiento de los umbrales — pendiente, quedó marcada al
      pausar el trabajo de esta mejora.
