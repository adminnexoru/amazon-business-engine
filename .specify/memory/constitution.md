# Constitution — Autonomous Amazon Business Engine

> Se define una vez por proyecto (incluye las decisiones de infraestructura de Fase 0).
> Todos los specs de features futuras deben respetarla.

## Principios de arquitectura

1. Cada agente es un módulo independiente: puede fallar o re-desplegarse sin
   tumbar a los demás agentes.
2. Toda escritura a base de datos pasa por Supabase con Row Level Security
   activo. Ningún agente escribe con credenciales que evadan RLS.
3. El schema de base de datos vive en `supabase/migrations/` y se versiona
   con Supabase CLI. Nunca se edita el schema a mano en producción.
4. Infraestructura base (Fase 0): hosting en Vercel, dominio `abe.nexoru.ai`,
   conexión a Supabase. Cambios a esta base son decisiones de arquitectura,
   no de feature — se documentan aquí, no en un spec de producto.

## Principios de calidad

5. Ningún agente "inventa" datos cuando la fuente no los tiene. Si no hay
   evidencia suficiente, el campo queda vacío o marcado como `sin_dato` —
   nunca se rellena con una estimación no solicitada. Esto aplica tanto a
   valores individuales como a colecciones: un ítem sin sustento se omite de
   un array, no se fuerza a existir con un valor por default.
6. Cuando una variable o ítem tiene un nivel de confianza, éste debe viajar
   junto al valor en el JSON de análisis, no solo en el veredicto final.
   Los niveles de confianza reales que una fuente puede sustentar no se
   inflan — por ejemplo, un promedio calculado sobre una muestra parcial
   nunca alcanza confianza "alta", sin importar el tamaño de la muestra.
7. Toda corrida de un agente se registra en `agent_runs` (input, output,
   timestamp, costo si aplica) para trazabilidad.

## Principios de seguridad

8. Cualquier endpoint que dispare un agente y consuma cuota de APIs de pago
   (SP-API, Apify, Anthropic) debe estar protegido por autenticación — nunca
   expuesto público sin credenciales.
9. Decisiones de "comprar vs. construir" para fuentes de datos de terceros
   (p. ej. Apify en vez de un scraper propio) se prefieren cuando construir
   implicaría asumir riesgo de Términos de Servicio de un tercero (Amazon)
   directamente sobre la cuenta de vendedor activa del negocio.

## Principios de UX / entrega

10. El output de cada agente debe ser consumible tanto por humano (vista en
    el dashboard) como por el siguiente agente en la cadena (JSON
    estructurado en base de datos).

## Principios de autonomía

11. Autonomía en 3 niveles: 🟢 autónomo (recopilar, analizar, recomendar),
    🟡 autónomo + aprobación humana (selección de proveedor, pagos, cambios
    grandes de presupuesto), 🔴 solo humano (transferencias, contratos,
    compras grandes de inventario). Nunca se automatiza un nivel 🔴.

---

**Version**: 1.0.0 | **Ratified**: 2026-09-19 | **Last Amended**: 2026-09-23
