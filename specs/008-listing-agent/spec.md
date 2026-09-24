# Feature Specification: Listing Agent (Fase 5, parte 1)

**Feature Branch**: `008-listing-agent`

**Created**: 2026-09-24

**Status**: Draft

**Input**: User description: "for Fase 5 Listing Agent: dado un producto ya publicado (o por publicar) en Amazon México, genera título, bullet points, descripción, backend search terms, y sugerencias de A+ content optimizados. Compara el listing propio contra el top 10 de competidores de la misma categoría (usando SP-API Catalog Items, el mismo acceso que ya usa el Scout Agent, sobre los ASINs competidores) — señalando gaps de keywords, atributos faltantes, y diferencias de estructura. NO incluye gestión de PPC/Advertising — eso requiere Amazon Ads API, que no está configurada todavía, y queda fuera de alcance de esta fase explícitamente (se documenta como bloqueado, mismo patrón que Trend/Sales estimate sin Keepa en el Product Analyst Agent)."

## Clarifications

### Session 2026-09-24

- Q: ¿Cada gap de keywords/atributos/estructura reportado en la comparación (FR-005/006/007) debe llevar su propio nivel de confianza (alta/media/sin_dato), y si sí, con qué regla se calcula? → A: Confianza basada en cuántos de los competidores resueltos sustentan el gap: `alta` si aparece en ≥70% de los competidores resueltos, `media` si menos, `sin_dato` si no aplica.
- Q: ¿Qué debe pasar cuando se solicita la comparación (User Story 2) con 0 ASINs competidores proporcionados? → A: Se omite la comparación sin error — el sistema entrega el Listing Draft y no incluye ninguna sección de Competitor Comparison en el resultado.
- Q: ¿Al regenerar el listing de un candidato que ya tiene un Listing Draft previo, el nuevo resultado reemplaza al anterior o se guarda como una versión nueva conservando el histórico? → A: Reemplaza el draft anterior del mismo candidato — solo existe el más reciente, igual que el patrón de `raw_data.analyst` sobrescribiéndose en cada re-análisis.
- Q: Si la fuente de datos de catálogo para los competidores falla por completo (no un ASIN individual, sino que la fuente entera no responde), ¿cómo debe comportarse el sistema? → A: Se registra un resultado con estado explícito de "sin fuente de datos" (mismo patrón que `NoReviewsSourceConfiguredError`/`NoSupplierSourceConfiguredError` en los otros agentes) — la generación del listing propio no se ve afectada.
- Q: Cuando se solicita generar el listing de un candidato que todavía no tiene ningún dato de catálogo (el Scout Agent nunca corrió sobre él), ¿el sistema debe rechazar la solicitud o generar lo que pueda con todo señalado como faltante? → A: Rechazo explícito (error) — la generación de listing requiere que el Scout Agent ya haya corrido sobre el candidato.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Generar contenido de listing optimizado (Priority: P1)

Como operador del negocio, quiero generar título, bullet points, descripción y
backend search terms para un producto candidato (ya publicado en Amazon o
todavía por publicar), para no tener que redactar el listing completo desde
cero cada vez que hay un producto listo para vender.

**Why this priority**: Es el valor central de la feature — sin generación de
contenido no hay nada que comparar ni que mejorar. Es el único user story que
por sí solo ya entrega valor de negocio (ahorra el trabajo manual de
redacción).

**Independent Test**: Puede probarse por completo dando un `product_candidate`
con datos de catálogo suficientes y verificando que el resultado incluye
título, bullets, descripción, backend search terms e Item Highlights, sin
depender de ningún otro user story.

**Acceptance Scenarios**:

1. **Given** un producto candidato con datos de catálogo completos (marca,
   atributos, categoría), **When** se solicita generar su listing, **Then**
   el sistema produce un título, al menos 5 bullet points, una descripción,
   un set de backend search terms e Item Highlights.
2. **Given** un producto candidato con datos de catálogo incompletos (por
   ejemplo, sin atributos clave), **When** se genera el listing, **Then** el
   sistema señala explícitamente qué elementos no se pudieron generar por
   falta de dato, en vez de inventar contenido para rellenar el hueco.

---

### User Story 2 - Comparar el listing propio contra el top 10 de competidores (Priority: P2)

Como operador del negocio, quiero ver cómo se compara mi listing (generado o
ya existente) contra los 10 listings competidores más relevantes de la misma
categoría, para identificar gaps de keywords, atributos faltantes y
diferencias de estructura antes de publicar o de hacer cambios.

**Why this priority**: Aporta valor incremental real sobre el User Story 1
(un listing generado en el vacío es menos útil que uno contrastado contra la
competencia real), pero depende de que exista un listing propio con el que
comparar, por lo que es un escalón después del User Story 1.

**Independent Test**: Puede probarse dando un listing propio (generado por el
User Story 1 o ya existente) más una lista de hasta 10 ASINs competidores, y
verificando que el resultado reporta gaps de keywords, atributos faltantes y
diferencias de estructura frente a esos competidores.

**Acceptance Scenarios**:

1. **Given** un listing propio y 10 ASINs competidores válidos de la misma
   categoría, **When** se solicita la comparación, **Then** el sistema
   reporta gaps de keywords, atributos faltantes y diferencias de estructura
   entre el listing propio y el conjunto competidor.
2. **Given** una lista de ASINs competidores donde alguno no resuelve datos
   de catálogo (ASIN inválido, producto retirado), **When** se ejecuta la
   comparación, **Then** el sistema reporta cuántos competidores sí se
   pudieron comparar realmente, en vez de presentar la comparación como si
   los 10 se hubieran usado.

---

### User Story 3 - Sugerencias de A+ Content (Priority: P3)

Como operador del negocio, quiero recibir sugerencias de estructura y
contenido para A+ Content del producto, para tener un punto de partida en vez
de empezar desde una página en blanco.

**Why this priority**: Es un complemento del listing base (User Story 1) y
de la comparación (User Story 2) — útil, pero el negocio puede operar sin
A+ Content mientras que no puede operar sin título/bullets/descripción.

**Independent Test**: Puede probarse dando un producto candidato con listing
ya generado y verificando que el resultado incluye una propuesta de módulos
de A+ Content (tema y estructura de cada módulo), independiente de si ya se
corrió la comparación contra competidores.

**Acceptance Scenarios**:

1. **Given** un producto candidato con listing ya generado, **When** se
   solicitan sugerencias de A+ Content, **Then** el sistema devuelve una
   propuesta de módulos (tema y contenido esperado de cada uno) basada en los
   datos reales del producto.

---

### Edge Cases

- Un candidato sin ningún dato de catálogo (Scout Agent no corrió sobre él):
  el sistema rechaza la generación de listing en vez de producir contenido
  con todo marcado como no disponible (ver Clarifications, sesión
  2026-09-24, pregunta sobre candidatos sin dato de catálogo).
- ¿Cómo maneja el sistema un ASIN competidor que no resuelve (retirado,
  restringido, o typo) dentro de la lista de hasta 10 proporcionada?
- Menos de 10 ASINs competidores: el sistema reporta cuántos se compararon
  realmente (FR-009). Cero ASINs competidores: se omite la comparación sin
  error, entregando solo el Listing Draft (ver Clarifications, sesión
  2026-09-24, pregunta sobre 0 ASINs competidores).
- Si la fuente de datos de catálogo de competidores no está disponible en
  su totalidad (no un ASIN individual, sino la fuente entera), el sistema
  registra un resultado con estado explícito de "sin fuente de datos" — la
  generación del listing propio no se ve afectada (ver Clarifications,
  sesión 2026-09-24, pregunta sobre falla total de la fuente).
- ¿Qué pasa si se solicita cualquier funcionalidad de PPC/Advertising (bids,
  CTR/CVR/ACOS/TACOS) contra este agente? Debe responder que esa capacidad
  está fuera de alcance y bloqueada por falta de acceso a Amazon Ads API, no
  intentar aproximarla con otros datos.
- ¿Qué pasa si el listing generado excede los límites de caracteres que
  Amazon impone a título, bullets o backend search terms?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema DEBE generar, para un producto candidato dado, un
  título, al menos 5 bullet points, una descripción y un set de backend
  search terms.
- **FR-002**: El sistema DEBE basar todo el contenido generado únicamente en
  datos reales disponibles del candidato (datos de catálogo, análisis previo,
  insights de reviews si existen) — NO DEBE inventar atributos, certificaciones
  o afirmaciones del producto que no estén sustentadas en esos datos.
- **FR-003**: Cuando falte un dato necesario para generar un elemento del
  listing, el sistema DEBE señalarlo explícitamente en el resultado en vez de
  omitir la señal y entregar un elemento generado igual.
- **FR-004**: El sistema DEBE aceptar de 0 a 10 ASINs de productos
  competidores de la misma categoría y obtener sus datos de catálogo como
  base de comparación. Si se proporcionan 0 ASINs, el sistema DEBE omitir
  la comparación sin generar error, entregando únicamente el Listing Draft.
- **FR-005**: El sistema DEBE identificar y reportar gaps de keywords entre
  el listing del candidato y el conjunto de competidores.
- **FR-006**: El sistema DEBE identificar y reportar atributos presentes en
  los listings competidores que falten en el listing del candidato.
- **FR-007**: El sistema DEBE identificar y reportar diferencias de
  estructura (p. ej. cantidad de bullets, presencia de A+ Content, cantidad
  de imágenes) entre el listing del candidato y los competidores, en la
  medida en que ese dato esté disponible.
- **FR-008**: El sistema DEBE generar una propuesta de estructura de A+
  Content (tema y contenido esperado por módulo) para el producto candidato.
- **FR-009**: Cuando se resuelvan menos de 10 competidores válidos (por
  ASINs inválidos o sin dato), el sistema DEBE reportar explícitamente
  cuántos se compararon realmente, nunca presentar el resultado como si se
  hubiera usado el conjunto completo solicitado.
- **FR-010**: El sistema DEBE registrar cada corrida de generación de
  listing y de comparación contra competidores, de forma consistente con
  cómo se registra cada corrida de cualquier otro agente en este sistema.
- **FR-011**: El sistema DEBE excluir explícitamente del alcance cualquier
  gestión de PPC/Advertising (bids, campañas, CTR/CVR/ACOS/TACOS) — si se
  solicita, DEBE responder indicando que esa capacidad está bloqueada por
  falta de acceso a una fuente de datos de Advertising, sin intentar
  aproximarla con otra información disponible.
- **FR-012**: El acceso a las capacidades de este agente DEBE estar
  restringido de la misma forma en que ya están restringidos los demás
  endpoints internos que disparan agentes en este sistema (no expuesto
  públicamente sin autenticación).
- **FR-013**: El sistema NO DEBE publicar ni modificar ningún listing real
  en Amazon de forma automática — el contenido generado es siempre una
  propuesta para revisión y publicación humana.
- **FR-014**: Cada gap reportado bajo FR-005/FR-006/FR-007 DEBE incluir un
  nivel de confianza (`alta`/`media`/`sin_dato`): `alta` si el patrón se
  sustenta en al menos el 70% de los competidores resueltos, `media` si se
  sustenta en menos del 70%, `sin_dato` si el gap no es comparable entre
  competidores (p. ej. un atributo no aplicable a la categoría).
- **FR-015**: Al regenerar el listing de un candidato que ya tiene un
  Listing Draft previo, el nuevo resultado DEBE reemplazar al anterior — el
  sistema conserva únicamente el draft más reciente por candidato, no un
  historial de versiones.
- **FR-016**: Si la fuente de datos de catálogo de competidores no está
  disponible en su totalidad (falla de la fuente completa, no de un ASIN
  individual), el sistema DEBE registrar un resultado con estado explícito
  de falta de fuente de datos, sin impedir que se entregue el Listing Draft
  del producto propio.
- **FR-017**: El sistema DEBE rechazar la generación de listing para un
  producto candidato que no tiene ningún dato de catálogo (el Scout Agent
  no ha corrido sobre él), en vez de generar contenido con todo marcado
  como no disponible.
- **FR-018**: El sistema DEBE generar una propuesta de Item Highlights
  (máximo 125 caracteres, campo nuevo de Amazon introducido el 27 de julio
  de 2026 junto con el límite de título de 75 caracteres) basada únicamente
  en datos reales del candidato — sujeto a las mismas reglas de FR-002
  (nunca inventar) y FR-003 (señalar como faltante si no hay dato
  suficiente).

### Key Entities

- **Listing Draft**: título, bullets, descripción, backend search terms,
  Item Highlights y propuesta de A+ Content generados para un producto
  candidato específico, junto con la marca de qué elementos quedaron
  señalados por falta de dato. Es 1:1 por candidato — cada regeneración
  reemplaza el draft anterior, no se conserva historial de versiones.
- **Competitor Comparison**: el conjunto de ASINs competidores solicitados
  vs. los realmente resueltos, los gaps de keywords encontrados, los
  atributos faltantes encontrados, y las diferencias de estructura
  encontradas frente al listing del candidato — cada gap con su propio
  nivel de confianza (`alta`/`media`/`sin_dato`) según cuántos competidores
  resueltos lo sustentan. Ausente del resultado cuando no se proporcionó
  ningún ASIN competidor.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Dado un candidato con datos de catálogo completos, el sistema
  entrega un listing draft completo (título + bullets + descripción +
  backend search terms + Item Highlights) en una sola solicitud.
- **SC-002**: El 100% del contenido generado es trazable a datos reales del
  candidato o queda explícitamente señalado como no disponible — cero
  afirmaciones de producto fabricadas en el contenido generado.
- **SC-003**: Dado un conjunto de 10 ASINs competidores válidos, la
  comparación entrega gaps de keywords, atributos faltantes y diferencias de
  estructura en una sola solicitud.
- **SC-004**: En el 100% de los casos donde se resuelven menos de 10
  competidores, el resultado indica explícitamente cuántos se usaron
  realmente.
- **SC-005**: Ninguna salida de esta feature contiene datos o
  recomendaciones de PPC/Advertising.

## Assumptions

- Reutiliza el mismo acceso a datos de catálogo de Amazon ya integrado para
  el Scout Agent (la misma fuente de datos de producto) para obtener los
  datos de los competidores — no se requiere aprovisionar una fuente de
  datos nueva para la comparación.
- El "top 10 de competidores" lo proporciona el usuario como lista de ASINs
  — esta feature no incluye descubrimiento/búsqueda propia de competidores,
  eso es una capacidad separada.
- La generación de listing aplica al marketplace de México, consistente con
  el resto del sistema.
- Las sugerencias de A+ Content describen estructura y dirección de
  contenido de cada módulo, no diseños visuales terminados.
- La gestión de PPC/Advertising queda fuera de alcance por completo en esta
  fase y requiere una fase futura una vez que exista acceso a una API de
  Advertising — mismo patrón de "bloqueado, documentado explícitamente" que
  Trend/Sales estimate sin Keepa en el Product Analyst Agent.
- El contenido generado nunca se publica automáticamente al listing real en
  Amazon — siempre requiere que un humano lo revise y lo aplique, consistente
  con que ningún agente de este sistema ejecuta cambios irreversibles sin
  intervención humana.
- Los backend search terms e Item Highlights respetan los límites de
  caracteres que Amazon ya impone para esos campos.
