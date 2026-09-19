# Spec: Review Intelligence Agent (Fase 2)

## Qué
Un agente que lee reviews reales de productos competidores en amazon.com.mx
y extrae patrones cualitativos — problemas reportados, deseos no
satisfechos, características faltantes, motivos de compra, motivos de
devolución — generando un PRD preliminar ("así debería ser nuestro
producto").

## Por qué
Conocer qué falla en los productos de la competencia (vía sus reviews
negativas y positivas) es la señal más directa de qué debería diferenciar a
un producto nuevo, antes de diseñarlo o buscar proveedor. Hacerlo a mano,
leyendo reviews una por una, no escala.

## Requerimientos funcionales
- Soportar dos modos desde v1:
  - Modo A: ASINs de competidores indicados a mano, sin vincular a un
    `product_candidate`.
  - Modo B: vinculado a un `product_candidate` ya existente (usa su
    `raw_data` como contexto adicional para el PRD).
- Obtener reviews reales de cada ASIN vía un proveedor de datos configurado
  (no simulado, no inventado).
- Categorizar los hallazgos en 5 categorías, cada ítem con su propio nivel
  de confianza (`alta` / `media`), nunca inventando un ítem sin sustento
  textual real.
- Calcular una `confianza_general` del análisis completo según el volumen y
  diversidad de reviews disponibles.
- Generar un `prd_document` en markdown que se autocalifique como
  exploratorio cuando la evidencia es limitada, en vez de sonar a
  conclusión validada.
- Si no hay fuente de reviews configurada, o si el proveedor devuelve cero
  reviews, el agente NO debe llamar a Claude — debe guardar un estado
  explícito (`sin_fuente_datos` o `sin_dato`) directamente.
- Registrar cada corrida en `agent_runs` y persistir el resultado completo
  en una tabla propia (`review_insights`).
- Acotar el gasto por corrida con un límite configurable de ASINs.

## Fuera de alcance (explícitamente)
- No decide automáticamente lanzar o modificar un producto — el PRD es
  insumo para decisión humana o para un futuro Product Development Agent.
- No calcula BSR, precio, ni ninguna variable numérica de mercado — eso es
  responsabilidad del Product Analyst Agent (y, para Reviews/Rating del
  propio producto, de la mejora 2.2).
- No garantiza cobertura de todos los marketplaces de Amazon — se validó
  específicamente para amazon.com.mx.

## Criterios de aceptación
- [x] Dado un ASIN de competidor con al menos 5 reviews en ≥2 fuentes de
      evidencia, un patrón corroborado puede alcanzar confianza `alta`
      (mencionado en ≥3 reviews y en ≥2 ASINs distintos).
- [x] Dado un ASIN con 1 sola review, `confianza_general` queda `sin_dato`
      y las categorías sin sustento quedan vacías, no rellenadas — validado
      con una corrida real (ASIN B0CKVCT4N1, 1 review, categorías
      "Características faltantes" y "Motivos de devolución" vacías).
- [x] Si `APIFY_API_TOKEN`/`APIFY_REVIEWS_ACTOR_ID` no están configuradas,
      la corrida queda como `sin_fuente_datos` sin generar un error 500 ni
      llamar a Claude.
- [x] El endpoint está protegido con el mismo mecanismo de auth que
      Scout/Analyst.
- [ ] Validar con 3–5 ASINs reales de una misma categoría que el caso de
      confianza `alta` (no solo `media`/`sin_dato`) también funciona como
      se diseñó — pendiente al cierre de esta fase.
