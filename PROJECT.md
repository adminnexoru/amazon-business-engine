---
id: abe
nombre: Autonomous Amazon Business Engine
tipo: producto-nexoru
cliente: Nexoru
fase: construccion
fase_desde: 2026-09-01
estado: verde
despliegue: nexoru-subdominio
urls:
  - https://abe.nexoru.ai
repo: adminnexoru/amazon-business-engine
fecha_inicio: 2026-09-01
fecha_objetivo: 2026-10-31
stack:
  - nextjs
  - supabase
  - vercel
  - claude
servicios:
  - amazon-sp-api
  - apify
  - anthropic-api
costo_mensual_usd: 0
siguiente_hito: "Fase 6 — Inventory Agent (en paralelo: registro Amazon Ads API)"
mapa_funcional: docs/mapa-funcional.md
version_estandar: "1.0"
---

# Autonomous Amazon Business Engine (ABE)

> Este archivo es la portada ejecutiva. El diseño funcional vive en [docs/mapa-funcional.md](docs/mapa-funcional.md) y el detalle técnico en `specs/` y `.specify/memory/constitution.md`. Si algo aquí no coincide con `specs/`, **`specs/` es la fuente de verdad**.

## Resumen ejecutivo

**Misión:** "Encuentra oportunidades rentables y haz crecer mi negocio Amazon."

**Problema:** evaluar productos para vender en Amazon exige cruzar datos de catálogo, precios, comisiones, reviews y proveedores; hacerlo a mano es lento y propenso a decisiones con datos incompletos.

**Qué es:** un sistema de agentes de IA que trabaja de forma continua hasta llegar a las decisiones que requieren autorización humana. No es una app que solo muestra información: es un sistema cerrado de decisión, con niveles de autonomía explícitos y la regla de nunca inventar datos.

**Inicio:** el proyecto inició el 2026-09-01; el repositorio existe desde el 2026-09-14 (primer commit).

**Para quién:** operación propia de Nexoru en Amazon México (amazon.com.mx).

**Métricas de éxito:** candidatos evaluados por semana, porcentaje de variables con dato real (sin `sin_dato`) y, con productos activos, desviación entre lo estimado y lo real.

## Alcance

**Incluye:** descubrimiento de candidatos (Scout), análisis de 12 variables con veredicto `test` / `reject` / `necesita_mas_datos` (la decisión final BUY/TEST/REJECT es humana), inteligencia de reviews de competidores, comparación de proveedores en Alibaba, RFQ y PO como plantillas, simulador de compra, y generación de listings.

**Fuera de alcance:**
- Sourcing local MX/CDMX en v1 (Alibaba no tiene equivalente estructurado; extensión futura).
- Pagos, transferencias, contratos o compras ejecutadas por el sistema.
- Envío automático de RFQ o contacto con proveedores (el usuario copia y pega).
- "Inventory Risk" en v1 (no hay fuente de historial de ventas).
- PPC mientras no exista acceso a Amazon Ads API.

## Roadmap

El estado de cada fase lo calcula el dashboard a partir de `tasks.md` de las specs vinculadas. La columna "Estado manual" solo se usa donde no hay `tasks.md` del cual calcularlo: Fases 0, 5.2, 6 y 7 (sin spec; la base de la Fase 0 está en `.specify/memory/constitution.md`) y Fase 4 (`006` y `007` tienen `spec.md` y `plan.md`, pero no `tasks.md`). Las Fases 1 a 2.2 sí tienen specs: se formalizaron de forma retroactiva el 2026-09-19. Sus tareas abiertas, y las de la Fase 3, se movieron a la fase de Estabilización (`009`) para que esas fases puedan cerrarse.

| Fase | Objetivo | Specs | Fecha objetivo | Estado manual |
|---|---|---|---|---|
| 0 | Arquitectura, hosting, dominio abe.nexoru.ai, Supabase | — | — | completa |
| 1 | Scout Agent (SP-API Catalog + Claude) | 001-scout-agent | — | |
| 1.5 | Product Analyst Agent (12 variables, Pricing y Fees API) | 002-product-analyst-agent | — | |
| 2 | Review Intelligence Agent | 003-review-intelligence-agent | — | |
| 2.2 | Reviews y Rating del Analyst vía Apify | 004-reviews-rating-improvement | — | |
| 3 | Supplier Agent | 005-supplier-agent | — | |
| 3.5 | Estabilización: pendientes de las Fases 1 a 3 | 009-pendientes-fases-1-3 | — | |
| 4 | Procurement Agent y Buy Simulator | 006-procurement-agent, 007-buy-simulator | — | implementada-sin-validar |
| 5.1 | Listing Agent | 008-listing-agent | — | |
| 5.2 | Marketing Agent (PPC) | — | 2026-10-31 | bloqueada |
| 6 | Inventory Agent con aprobación humana | — | 2026-10-31 | pendiente |
| 7 | Autonomous Business Manager (histórico y "Amazon Business Brain") | — | 2026-10-31 | pendiente |

## Decisiones clave

| Decisión | Razón |
|---|---|
| Nunca inventar datos: sin fuente o sin sustento, el valor es `sin_dato` o el ítem se omite | La confianza en el sistema depende de no rellenar huecos |
| Las reglas de confianza son explícitas y acotadas por schema; cuando son aritméticas (comparación del Listing, Buy Simulator) se calculan en código, no en el prompt | Reglas verificables y reproducibles. En Analyst, Review Intelligence y Supplier las reglas viven en el prompt, con el schema Zod limitando los valores posibles (p. ej. el precio de proveedor no admite `alta`) |
| Spec-Driven Development adoptado el 2026-09-19: Fases 0 a 2.2 formalizadas de forma retroactiva; desde Fase 3 el spec precede al código; CLI nativo de Spec Kit desde Fase 5 | Trazabilidad de requisitos, decisiones y evidencia |
| En v1, el margen solo se calcula con costo manual (`cost_source: manual_estimate`) | No hay costo real hasta tener cotización de proveedor |
| El Rating nunca llega a confianza alta | Es un promedio sobre muestra parcial, no el dato oficial de Amazon |
| El precio de proveedor tiene como máximo confianza media | Es negociable por naturaleza |
| El landed cost reporta USD y MXN por separado, sin sumar | No hay tasa de cambio real en el sistema |
| El tiempo de entrega es `sin_dato` en v1 | El dato llega nulo en el 100% de los productos probados |
| Buy Simulator sin Claude: aritmética determinística; el sell-through es input manual | Evitar estimaciones sin fuente |
| PPC rechaza activamente con error 400 mientras no haya Ads API | Un rechazo explícito es más seguro que una ausencia silenciosa |
| El Inventory Agent siempre requiere aprobación humana | Compromete capital |

## Costo mensual

| Servicio | USD/mes | Nota |
|---|---|---|
| Anthropic API | 0 | Verificar el consumo real en la consola de Anthropic |
| Supabase | 0 | |
| Vercel | 0 | |
| Apify | 0 | Plan free |
| Amazon SP-API | — | Sin costo |
| **Total** | **0** | |

El total es el valor de `costo_mensual_usd` en el frontmatter.

## Riesgos, bloqueos y dependencias

- **Bloqueo:** Fase 5.2 (PPC) requiere registro de developer y OAuth de Amazon Ads API, distinto de SP-API.
- **Dependencia:** Fase 6 requiere el rol SP-API "Seguimiento de pedidos e inventario".
- **Dependencia:** Trend, Sales estimate y Revenue estimate requieren Keepa (sin contratar).
- **Riesgo de costo:** cada corrida del Analyst más Review Intelligence consume dos cuotas de Apify por candidato; vigilar si crece el volumen.
- **Riesgo de calendario:** las fases 5.2, 6 y 7 comparten la fecha objetivo del 2026-10-31, y la 5.2 depende del registro en Amazon Ads API. Si ese registro no avanza antes del 2026-10-15, el estado del proyecto pasa a ámbar.
- **Riesgo de calidad:** Alibaba ignora diferenciadores en español al buscar proveedores (T009 de `specs/009-pendientes-fases-1-3/`).

## Pendientes conocidos

- Las tareas abiertas de las Fases 1 a 3 están en la fase de Estabilización (`specs/009-pendientes-fases-1-3/tasks.md`). Las principales son:
  - la condición de carrera en `raw_data` entre Scout, Analyst y Review Intelligence (T005);
  - los tests automatizados de "no inventar datos" (T001, T002, T004);
  - `risk_flags` estructurado (T003) y `asins_evidencia` (T007);
  - keywords en inglés para Alibaba (T009);
  - validar la rama `media` de Rating (T008) y cruzar una opción de proveedor contra Alibaba (T010).
- Maximum Buy Price (Profit Engine) diseñado pero no construido (sin spec).
- Validar la Fase 4: `006` y `007` no tienen `tasks.md` y sus criterios de aceptación siguen sin marcar. Falta un `tasks.md` retroactivo o verificar los criterios con pruebas reales.

## Evidencia de validación

| Qué | Evidencia |
|---|---|
| Review Intelligence end-to-end | ASIN B0CKVCT4N1 en amazon.com.mx: texto completo, rating y compra verificada. Con 1 review, `confianza_general: sin_dato` y categorías sin sustento vacías |
| Review Intelligence, confianza alta | 4 ASINs y 40 reviews: `confianza_general: alta` e ítems en `alta` en 3 de 4 categorías; un hallazgo con 2 reviews del mismo ASIN quedó correctamente en `media` |
| Reviews y Rating del Analyst | ASIN B077HFMK1Z: Reviews en alta (229 calificaciones); Rating en `sin_dato` al no cumplir el umbral (17.9% contra 70% requerido) |
| Supplier Agent | 4 de 4 opciones con precio en confianza media; bug de mezcla de monedas detectado y corregido; candidato sin veredicto `test` recibe 422 |
| Listing Agent | Los 5 escenarios de `quickstart.md` pasaron en servidor local (no en producción): 3/3 competidores resueltos con confianza `alta`/`media` calculada en código; 422 sin registro en `agent_runs` para un candidato sin catálogo; ASINs inexistentes dan `sin_fuente_datos` y el listing se entrega igual |
| Actores de Apify descartados | `crawlerbros/amazon-reviews-scraper` y `agenscrape/amazon-mexico-product-scraper` no funcionaron contra .com.mx |

## Siguiente hito

Fase 6 — Inventory Agent (en paralelo: registro Amazon Ads API).

1. **Fase 6 (Inventory Agent):** requiere el rol SP-API de pedidos e inventario; siempre con aprobación humana.
2. **En paralelo, registro en Amazon Ads API:** developer y OAuth, requisito para desbloquear la Fase 5.2 (PPC).
3. **Opcional, no bloqueante:** resolver T009 de `009` antes de confiar en el Supplier Agent para candidatos con diferenciadores en español.
