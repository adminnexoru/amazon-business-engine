# Spec: Reviews y Rating del Product Analyst vía Apify (Fase 2.2)

## Qué
Extensión del Product Analyst Agent (Fase 1.5) para llenar dos de sus 12
variables — Reviews (conteo) y Rating (promedio de estrellas) — usando la
misma infraestructura de Apify ya construida en el Review Intelligence
Agent (Fase 2), pero aplicada al ASIN del propio candidato en vez de a
competidores.

## Por qué
Reviews y Rating quedaban en `sin_dato` en v1 del Analyst por falta de una
fuente sin Keepa. Al construir Fase 2 se descubrió que el mismo actor de
Apify ya devuelve, en cada review, el conteo total de calificaciones del
producto (`totalCategoryRatings`) y cuántas de ellas incluyen texto
(`totalCategoryReviews`) — datos que no requieren una fuente nueva, solo
reutilizar la ya validada.

## Requerimientos funcionales
- Reviews = `totalCategoryRatings`. Confianza `alta` si el dato está
  disponible (es un conteo directo de la página, no una estimación); basta
  con recuperar 1 sola review del producto, porque el valor es idéntico en
  todas las reviews de un mismo ASIN.
- Rating = promedio de `ratingScore` de la muestra de reviews recuperada.
  Confianza `media` (nunca `alta`) SOLO si se cumplen ambas condiciones:
  - `totalCategoryReviews / totalCategoryRatings >= 0.7` (pocas
    calificaciones "silenciosas" sin texto que no se pueden ver)
  - `reviews_recuperadas / totalCategoryReviews >= 0.7` (la muestra cubre
    la mayoría de las reviews escritas)
  Si cualquiera de las dos condiciones falla, o no hay datos: `sin_dato`.
- Si Apify no está configurado, o la corrida falla por cualquier motivo, el
  Analyst debe seguir funcionando normalmente — Reviews y Rating quedan
  `sin_dato`, sin excepción no controlada.

## Fuera de alcance (explícitamente)
- No resuelve Trend, Sales estimate ni Revenue estimate — siguen
  bloqueadas sin una fuente de historial tipo Keepa; esta mejora es
  puntual a Reviews/Rating, no un reemplazo general de Keepa.
- No agrega una tabla nueva ni un merge adicional — se integra en la misma
  escritura a `raw_data.analyst` que ya existía.

## Criterios de aceptación
- [x] Con `reviews` vacío (0 recuperadas), `totalRatings`/
      `totalWrittenReviews` quedan `null` sin lanzar excepción ni división
      por cero.
- [x] Cualquier error de `getCompetitorReviews` (no solo
      `NoReviewsSourceConfiguredError`) se trata como "sin datos" — el
      Analyst no truena por esto.
- [x] El resultado se guarda en una sola escritura a `raw_data.analyst`
      (no duplica el riesgo de condición de carrera ya documentado en
      Fase 2).
- [x] Validar con un ASIN real en producción que las reglas de umbral
      (0.7 / 0.7) producen el resultado esperado. Confirmado para la rama
      `sin_dato` (ver T8 en tasks.md — `product_candidate_id`
      c569d3b3-8402-464a-a4c6-1ddc6cb71036, ASIN B077HFMK1Z: Reviews
      `alta`, Rating `sin_dato` por fallar ambas condiciones de umbral).
      La rama `media` de Rating sigue sin validar con datos reales — ver
      T13 en tasks.md.
