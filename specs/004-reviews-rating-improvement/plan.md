# Plan: Reviews y Rating del Product Analyst vía Apify (Fase 2.2)

## Stack
- Reutiliza `getCompetitorReviews()` de `src/lib/reviews-provider.ts` (sin
  cambios de comportamiento), llamada con el ASIN propio del candidato.
- Nueva función pura `summarizeOwnProductReviews()` en el mismo archivo,
  sin dependencias externas, que calcula el resumen a partir del array de
  reviews ya normalizado.
- Las reglas de confianza (umbrales 0.7/0.7, "Rating nunca alta") viven en
  el system prompt de `analyzeProductCandidate()`, no en código imperativo
  — consistente con el patrón del resto del proyecto de que Claude decide
  la confianza según reglas explícitas, no la aplicación.

## Decisiones y su razón
- Se extendió la interfaz `CompetitorReview` con
  `total_category_ratings`/`total_category_reviews` en vez de crear un tipo
  paralelo, porque esos campos ya venían en el JSON crudo del actor y no
  tenía sentido duplicar la normalización.
- Se aceptó el costo adicional (una llamada extra a Apify por corrida del
  Analyst, además de la que ya hace Review Intelligence sobre competidores)
  como no bloqueante para el volumen actual, con el entendido de que debe
  vigilarse si escala el número de candidatos analizados por día.
- Se mantuvo una sola escritura a `raw_data.analyst` (agregando
  `ownReviewsSummary` al mismo objeto que ya se mergeaba) en vez de una
  escritura separada, para no duplicar el riesgo de condición de carrera ya
  documentado entre Scout/Analyst/Review Intelligence.
