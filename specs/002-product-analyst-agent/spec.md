# Spec: Product Analyst Agent (Fase 1.5)

## Qué
Un agente que, dado un `product_candidate` ya identificado por el Scout
Agent, evalúa 12 variables de negocio y emite un veredicto sobre si vale la
pena probarlo, rechazarlo, o si faltan datos para decidir.

## Por qué
El Scout Agent reduce el universo de productos, pero no dice si un candidato
es rentable. El usuario necesita una evaluación económica y competitiva
estructurada — precio, fees, margen, diferenciación — antes de invertir
tiempo en un producto que podría no ser viable, sin tener que calcular cada
variable a mano.

## Requerimientos funcionales
- Evaluar 12 variables por candidato: Precio, BSR, Reviews, Rating,
  Competencia, Trend, Sales estimate, Revenue estimate, Amazon fees, Cost,
  Margin, Differentiation.
- Cada variable debe reportar su nivel de confianza (`alta` / `media` /
  `sin_dato`) junto al valor — nunca solo el valor.
- Debe permitir un costo manual opcional ingresado por el usuario
  (`cost_source: 'manual_estimate'`) para poder calcular Margin en v1, sin
  depender de que exista ya un Supplier Agent.
- Debe emitir un veredicto final: `test` / `reject` / `necesita_mas_datos`.
- Debe usar SP-API Pricing API y Product Fees API (FBA y FBM) para las
  variables que sí tienen fuente oficial disponible.
- Debe registrar la corrida en `agent_runs` y mergear el resultado en
  `raw_data.analyst` del `product_candidate` correspondiente.

## Fuera de alcance (explícitamente)
- No busca ni negocia proveedores (responsabilidad del futuro Supplier
  Agent).
- No calcula tendencia histórica real de BSR/ventas ni estimaciones de
  ventas — esas variables (Trend, Sales estimate, Revenue estimate) quedan
  en `sin_dato` mientras no exista una fuente de historial (Keepa u otra),
  y así se documenta explícitamente en vez de aproximarlas.
- No decide automáticamente comprar inventario — solo recomienda.

## Criterios de aceptación
- [x] Dado un candidato con Precio, BSR y Fees disponibles vía SP-API, esas
      tres variables quedan con confianza `alta`.
- [x] Dado un candidato sin costo manual, Margin queda `sin_dato` en vez de
      asumir un costo por default.
- [x] El veredicto (`test`/`reject`/`necesita_mas_datos`) se basa en las
      variables disponibles, sin fabricar las que faltan.
- [x] La corrida queda trazable en `agent_runs`.
