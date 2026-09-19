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
- [x] T8: Prueba end-to-end con un ASIN real en producción para confirmar
      el comportamiento de los umbrales. Evidencia:
      - `product_candidate_id: c569d3b3-8402-464a-a4c6-1ddc6cb71036`
        (ASIN B077HFMK1Z)
      - Reviews: valor 229 (totalRatings), confianza `alta` — confirma que
        Reviews se llena con confianza alta siempre que el dato existe.
      - Rating: `sin_dato` — confirma la condición (a)
        (totalWrittenReviews/totalRatings = 41/229 = 17.9%, falla el
        umbral ≥70%); (b) también hubiera fallado (10/41 = 24.4%).
      - Caso NO cubierto por esta prueba: la rama `media` de Rating, que
        requiere que AMBAS condiciones (a) y (b) se cumplan — sigue sin
        evidencia real con un candidato donde la muestra sea representativa.
- [ ] T13: Prueba end-to-end con un ASIN que tenga baja proporción de
      calificaciones "silenciosas" (totalWrittenReviews/totalRatings alto,
      idealmente un producto con pocas reviews totales donde casi todas
      tengan texto) para validar la rama `media` de Rating, la única de
      las tres (alta/media/sin_dato) sin evidencia real todavía.
