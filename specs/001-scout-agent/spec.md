# Spec: Scout Agent (Fase 1)

## Qué
Un agente que, dado un ASIN o una keyword, analiza el catálogo de Amazon y
determina si el producto es un candidato viable para evaluación posterior,
guardando el resultado como "product candidate".

## Por qué
El usuario necesita descubrir oportunidades de producto sin revisar
manualmente cientos de listados de Amazon. El Scout Agent es el primer
filtro de un pipeline de varios agentes: reduce el universo de productos a
un conjunto manejable antes de invertir tiempo humano o de otros agentes más
costosos (Review Intelligence, Product Analyst) en evaluarlos a fondo.

## Requerimientos funcionales
- Dado un ASIN o keyword, el agente debe consultar el catálogo de Amazon
  (SP-API Catalog Items) y extraer los atributos relevantes del producto.
- El resultado debe incluir un análisis (vía Claude) de si el producto es un
  candidato razonable, no solo los datos crudos.
- Cada corrida debe quedar registrada de forma trazable (qué se pidió, qué
  se obtuvo, cuándo) en `agent_runs`.
- El acceso para disparar el agente debe estar restringido — no es una
  función pública.

## Fuera de alcance (explícitamente)
- Este agente NO calcula margen, NO estima ventas, NO analiza reviews de
  competencia. Eso es responsabilidad de otros agentes del pipeline
  (Product Analyst, Review Intelligence).
- No decide automáticamente "lanzar" un producto — solo lo marca como
  candidato para revisión posterior.

## Criterios de aceptación
- [x] Dado un ASIN válido, se crea un registro en `product_candidates` con
      los datos del catálogo + el análisis del agente.
- [x] Dado un ASIN inválido o sin datos suficientes, el agente no inventa
      información — deja los campos sin sustento vacíos.
- [x] Toda corrida queda en `agent_runs` con su resultado.
- [x] Un intento de acceso sin credenciales válidas es rechazado.
