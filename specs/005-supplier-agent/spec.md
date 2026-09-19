# Spec: Supplier Agent (Fase 3)

## Qué
Un agente que, dado un `product_candidate` cuyo veredicto del Product Analyst
Agent sea `test`, busca proveedores en plataformas de sourcing B2B (p. ej.
Alibaba) para ese producto y presenta entre 2 y 4 opciones comparables
normalizadas — precio escalonado por volumen, MOQ, señales de confianza del
proveedor, y un landed cost parcial — para que el usuario elija con cuál
proveedor avanzar.

## Por qué
Una vez que el Analyst valida que un candidato es rentable en papel, el
siguiente cuello de botella es encontrar un proveedor real sin tener que
buscar manualmente en Alibaba y comparar decenas de listados a mano. El
Supplier Agent reduce ese trabajo a una comparación estructurada de un
puñado de opciones viables, dejando la decisión final — con quién negociar —
en manos del usuario, nunca del agente.

## Requerimientos funcionales
- Solo puede correr sobre un `product_candidate` cuyo `raw_data.analyst.verdict`
  sea exactamente `test`. Si no lo es, la corrida se rechaza explícitamente
  (no es una advertencia silenciosa) y no se registra como intento de
  búsqueda de proveedores.
- Genera las keywords de búsqueda a partir de los datos ya existentes del
  candidato (título/categoría de Scout/Analyst) — no requiere que el usuario
  las escriba a mano.
- No requiere una cantidad objetivo de compra como input previo. Muestra el
  precio escalonado por rango de cantidad (price breaks) tal como lo entrega
  la fuente de datos, para que el usuario decida cantidad después de ver el
  panorama completo.
- Devuelve entre 2 y 4 opciones de proveedor comparadas lado a lado, cada
  una con: identificador del proveedor, tabla de precio por volumen, MOQ,
  señales de confianza del proveedor cuando la fuente las provea (verificado,
  trade assurance, rating), y un landed cost parcial (precio unitario +
  Amazon fees ya conocidos del Analyst — ver Fuera de alcance).
- El precio de cada proveedor NUNCA se marca con confianza "alta", sin
  importar qué tan confiable sea la fuente de datos — es un punto de partida
  de negociación, no el precio de una transacción cerrada (a diferencia de
  SP-API Pricing, que sí es transaccional). Máximo alcanzable: confianza
  "media".
- El landed cost mostrado se marca explícitamente como parcial/incompleto —
  nunca se presenta como si fuera el costo total real de aterrizar el
  producto (ver Fuera de alcance).
- Si la fuente de datos de proveedores no está configurada, o la búsqueda no
  encuentra resultados, el agente no inventa opciones — se guarda un estado
  explícito (`sin_fuente_datos` / `sin_dato`) sin generar una comparación
  falsa, mismo patrón que Review Intelligence (Fase 2).
- El usuario elige una de las opciones presentadas; la selección queda
  registrada de forma trazable, pero no dispara ninguna acción automática de
  contacto, RFQ, o compra.
- Toda corrida queda registrada en `agent_runs`.

## Fuera de alcance (explícitamente)
- No contacta proveedores, no negocia precio, no envía RFQ ni genera orden de
  compra — es responsabilidad del futuro Procurement Agent (Fase 4).
- No calcula tiempo de entrega. No existe una fuente pública automatizable
  para ese dato — solo se obtiene contactando directamente al proveedor.
  Queda `sin_dato` en v1; si el usuario lo consigue manualmente después de
  escribirle al proveedor, se captura en una fase posterior (Procurement),
  no aquí.
- No calcula flete ni aranceles. El landed cost de v1 es parcial (precio
  unitario + fees de Amazon) — un landed cost completo requiere una fuente o
  fórmula de estimación de flete/aranceles que queda pendiente de decidir
  más adelante, fuera del alcance de esta fase.
- No decide método de envío (marítimo/aéreo).
- No compromete ningún pago ni decide automáticamente con qué proveedor
  proceder — la elección final siempre es del usuario (🟡 auto + aprobación).
- No cubre sourcing local en México/CDMX. Alibaba es fundamentalmente una
  plataforma de sourcing de China/Asia — no existe un equivalente estructurado
  y scrapeable para proveedores mexicanos (serían directorios como Kompass
  México o contacto directo). Sourcing local queda como extensión futura
  explícita (v2), no descartada permanentemente, pero requiere investigar una
  fuente de datos completamente distinta a la de esta fase.

## Criterios de aceptación
- [ ] Dado un `product_candidate` con veredicto distinto a `test`, el agente
      rechaza la corrida con un mensaje explícito, sin intentar buscar
      proveedores.
- [ ] Dado un `product_candidate` con veredicto `test`, el agente genera
      keywords de búsqueda a partir de sus datos existentes sin requerir
      input manual adicional.
- [ ] El resultado presenta entre 2 y 4 opciones normalizadas y comparables,
      cada una con price breaks, MOQ, señales de confianza (cuando existan) y
      landed cost parcial.
- [ ] Ningún precio de proveedor individual aparece con confianza "alta" en
      el output.
- [ ] El landed cost mostrado indica explícitamente que es parcial (sin
      flete/aranceles), no un total.
- [ ] Si no hay fuente de datos configurada, o la búsqueda no encuentra
      resultados, el agente guarda un estado explícito sin generar una
      comparación inventada.
- [ ] La selección del usuario entre las opciones queda registrada de forma
      trazable, sin disparar ninguna acción de compra/contacto.
- [ ] Toda corrida queda en `agent_runs`.

## Fuente de datos (confirmada)
Apify, actor **`scrapesage/alibaba-scraper`** — validado con una corrida real
(keyword "heart shaped wireless earbuds bluetooth", 5 productos con
`includeProductDetails` + `outputSupplierLeads`, costo real $0.048 total).
Confirmó `ladderPrices`/`moq` reales y variados por proveedor, señales de
confianza diferenciadas (no uniformes), y — hallazgo importante — el campo
`leadTimes` existe en el schema pero llegó `null` en los 5 productos de la
prueba, confirmando con evidencia (no solo suposición) que el tiempo de
entrega no está disponible de forma confiable vía scraping público. Detalle
técnico completo en `plan.md`.
