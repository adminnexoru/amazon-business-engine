import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import type { CompetitorReview, OwnProductReviewsSummary } from './reviews-provider';
import type { CompetitivePricingResult, FeesEstimate } from './sp-api';
import type { SupplierProductOption, SupplierLead } from './supplier-provider';

const MODEL = 'claude-sonnet-4-6';

export const scoutAnalysisSchema = z.object({
  categoria: z.string(),
  resumen_oportunidad: z.string(),
  señales_positivas: z.array(z.string()),
  señales_riesgo: z.array(z.string()),
  estimated_competition: z.enum(['alta', 'media', 'baja']),
  nota_metodologica: z.string(),
});

export type ScoutAnalysis = z.infer<typeof scoutAnalysisSchema>;

const client = new Anthropic();

const SYSTEM_PROMPT = `Eres el analista del Scout Agent de Amazon Business Engine, un sistema
que ayuda a un humano a decidir si vale la pena investigar más a fondo un producto candidato
para vender en Amazon México.

Vas a recibir datos crudos de la Catalog Items API de Amazon (título, atributos, imágenes,
clasificación, sales rank puntual si está disponible, etc.) para un ASIN o una búsqueda por
keyword. Con eso, produce un análisis cualitativo de oportunidad.

Reglas importantes:
- No tienes acceso a datos de Keepa, historial de ventas, ni a la Pricing API. No inventes
  precio, volumen de demanda ni margen: esos campos no existen en tu output y no debes
  mencionarlos como si fueran datos concretos.
- estimated_competition es tu apreciación cualitativa (alta/media/baja) basada en señales como
  cantidad de variantes, marcas presentes, saturación aparente de la categoría, etc., no en
  datos de ventas reales.
- nota_metodologica debe dejar explícito que, sin datos de Keepa u otra fuente de demanda real,
  este análisis son solo señales cualitativas del catálogo, no una proyección de demanda.`;

// Recibe los datos crudos del catálogo (Catalog Items API) y el input original (ASIN o
// keyword) y devuelve el análisis cualitativo estructurado que se guarda en
// product_candidates.raw_data.analysis.
export async function analyzeCatalogItem(
  input: string,
  catalogData: unknown,
): Promise<ScoutAnalysis> {
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Input original: "${input}"\n\nDatos crudos del catálogo (Catalog Items API):\n${JSON.stringify(catalogData, null, 2)}`,
      },
    ],
    output_config: {
      format: zodOutputFormat(scoutAnalysisSchema),
    },
  });

  if (!response.parsed_output) {
    throw new Error(`Claude no devolvió un análisis parseable para "${input}"`);
  }

  return response.parsed_output;
}

// --- Product Analyst Agent ---

const analystVariableSchema = z.object({
  valor: z.string(),
  confianza: z.enum(['alta', 'media', 'sin_dato']),
});

export const analystVerdictSchema = z.object({
  variables: z.object({
    precio: analystVariableSchema,
    bsr: analystVariableSchema,
    reviews: analystVariableSchema,
    rating: analystVariableSchema,
    competencia: analystVariableSchema,
    trend: analystVariableSchema,
    sales_estimate: analystVariableSchema,
    revenue_estimate: analystVariableSchema,
    amazon_fees: analystVariableSchema,
    cost: analystVariableSchema,
    margin: analystVariableSchema,
    differentiation: analystVariableSchema,
  }),
  veredicto: z.enum(['test', 'reject', 'necesita_mas_datos']),
  justificacion: z.string(),
  nota_metodologica: z.string(),
});

export type AnalystVerdict = z.infer<typeof analystVerdictSchema>;

export interface AnalystContext {
  asin: string;
  title: string;
  scoutRawData: unknown;
  competitivePricing: CompetitivePricingResult;
  feesEstimateFba: FeesEstimate | null;
  feesEstimateFbm: FeesEstimate | null;
  costManual: number | null;
  ownReviewsSummary: OwnProductReviewsSummary | null;
}

const ANALYST_SYSTEM_PROMPT = `Eres el Product Analyst Agent de Amazon Business Engine. Recibes un
candidato de producto que el Scout Agent ya evaluó cualitativamente, más datos frescos de la
Pricing API y la Product Fees API de Amazon, y produces un veredicto accionable para un humano
que decide BUY/TEST/REJECT.

Debes devolver exactamente estas 12 variables dentro de "variables", cada una con "valor" (texto
breve, ej. "$249.00 MXN", "12,430", "moderada — 8 vendedores activos", "sin datos") y "confianza"
('alta' | 'media' | 'sin_dato'):

- precio: precio de Buy Box (New) de la Pricing API. confianza 'alta' si vino de la API, 'sin_dato'
  si no hay Buy Box (sin ofertas activas).
- bsr: Best Sellers Rank. Puede venir de SalesRankings de la Pricing API o de salesRanks del
  Catalog Items API (dato del Scout). confianza 'alta' si viene de cualquiera de esas dos fuentes
  reales de SP-API, 'sin_dato' si ninguna lo trae.
- reviews: usa ownReviewsSummary.totalRatings como valor, si ownReviewsSummary no es null. Confianza
  'alta' si totalRatings no es null — es un conteo directo de la página del producto (vía Apify),
  no una estimación. Si totalRatings es null, o si ownReviewsSummary es null en su totalidad,
  reviews queda 'sin_dato'.
- rating: usa ownReviewsSummary.sampledAvgRating SOLO si se cumplen AMBAS condiciones:
  (a) totalWrittenReviews > 0 Y (totalWrittenReviews / totalRatings) >= 0.7;
  (b) (sampledReviewCount / totalWrittenReviews) >= 0.7.
  Si ambas se cumplen: confianza 'media' — NUNCA 'alta', porque sigue siendo un promedio calculado
  sobre una muestra parcial de reviews, no el promedio oficial que Amazon muestra en la página. Si
  cualquiera de las dos condiciones falla, o ownReviewsSummary es null: rating queda 'sin_dato'.
- competencia: nivel de competencia (alta/media/baja + por qué), combinando NumberOfOfferListings
  de la Pricing API con la apreciación cualitativa del Scout (estimated_competition). confianza
  'alta' si hay NumberOfOfferListings, 'media' si solo hay la apreciación cualitativa del Scout.
- trend: tendencia de demanda en el tiempo. No hay fuente sin Keepa: 'sin_dato' siempre que no haya
  otra evidencia.
- sales_estimate: unidades vendidas estimadas por periodo. No hay fuente sin Keepa: 'sin_dato'.
- revenue_estimate: ingresos estimados por periodo. Depende de sales_estimate: 'sin_dato'.
- amazon_fees: fees estimados por la Product Fees API (FBA y/o FBM, indica cuál). confianza 'alta'
  si el status del fees estimate fue 'Success', 'sin_dato' si falló o no se pudo pedir (por falta
  de precio).
- cost: costo unitario. Si viene de cost_manual, dilo explícitamente en el valor (ej. "$80.00 MXN
  (estimado manual)") y usa confianza 'media' — es una estimación humana, no un costo real de
  abastecimiento. Si no hay costo, 'sin_dato'. Evalúa además si el costo manual es plausible para
  el tipo de producto (material, tamaño, batería, marca, empaque): si luce demasiado bajo o alto
  dado lo que ves en el catálogo, dilo explícitamente en el valor (ej. "$25.00 MXN (estimado
  manual, luce bajo para un producto con batería de litio)"), manteniendo confianza 'media' — el
  dato existe pero su fiabilidad es dudosa.
- margin: precio - amazon_fees - cost, como monto y % sobre precio si es posible. Su confianza es
  la más baja entre precio, amazon_fees y cost: si cualquiera de esos tres es 'sin_dato', margin
  también debe ser 'sin_dato' (no se puede calcular un margen confiable).
- differentiation: qué tan diferenciado luce el producto (marca, variantes, atributos únicos) según
  el catálogo. Es una apreciación cualitativa: normalmente confianza 'media'.

Reglas para el veredicto:
- 'necesita_mas_datos': si falta precio o costo (margin es 'sin_dato'), porque sin eso no se puede
  evaluar la oportunidad de negocio. Dilo explícitamente en la justificación (ej. "falta costo
  manual para poder estimar margen").
- 'necesita_mas_datos' también aplica, aunque margin tenga un valor calculado (no sea 'sin_dato'),
  cuando el costo manual ingresado luce implausible para el tipo de producto — no solo cuando el
  dato falta. Por ejemplo, un costo muy por debajo de lo esperable dado el material, el tamaño, una
  batería, componentes electrónicos o el posicionamiento de marca invalida el margen calculado aun
  si aritméticamente "cierra". En ese caso no emitas 'test' ni 'reject': usa 'necesita_mas_datos' y
  explica en la justificación por qué el costo no es confiable y qué rango de costo sí sería
  razonable de validar antes de decidir.
- 'reject': si hay suficientes datos y costo plausible, y el margen es negativo o muy bajo, o la
  competencia es muy alta con poca diferenciación.
- 'test': si hay suficientes datos, el costo es plausible, y el margen luce razonable dado el nivel
  de competencia y diferenciación.

justificacion: 2-4 oraciones explicando el veredicto con los números concretos que lo sustentan.

nota_metodologica: dejar explícito qué variables no tienen dato real por depender de Keepa (u otra
fuente que este sistema no tiene todavía) y por lo tanto el veredicto no debe leerse como una
proyección de demanda validada, sino como un primer filtro con los datos de catálogo y pricing
disponibles hoy.`;

// Recibe los datos ya guardados por el Scout Agent en raw_data + los datos frescos de Pricing y
// Fees API + el costo manual (si existe) y devuelve el veredicto estructurado que se guarda en
// product_candidates.raw_data.analyst.
export async function analyzeProductCandidate(context: AnalystContext): Promise<AnalystVerdict> {
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 2048,
    system: ANALYST_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `ASIN: ${context.asin}
Título: ${context.title}

Datos del Scout Agent (raw_data guardado en el candidato):
${JSON.stringify(context.scoutRawData, null, 2)}

Pricing API — getCompetitivePricing:
${JSON.stringify(context.competitivePricing, null, 2)}

Product Fees API — estimado FBA (IsAmazonFulfilled=true):
${JSON.stringify(context.feesEstimateFba, null, 2)}

Product Fees API — estimado FBM (IsAmazonFulfilled=false):
${JSON.stringify(context.feesEstimateFbm, null, 2)}

Costo manual ingresado por el humano (null si no se proporcionó):
${JSON.stringify(context.costManual)}

Resumen de reviews del propio ASIN vía Apify (null si no se pudo obtener):
${JSON.stringify(context.ownReviewsSummary, null, 2)}`,
      },
    ],
    output_config: {
      format: zodOutputFormat(analystVerdictSchema),
    },
  });

  if (!response.parsed_output) {
    throw new Error(`Claude no devolvió un veredicto parseable para el ASIN "${context.asin}"`);
  }

  return response.parsed_output;
}

// --- Review Intelligence Agent ---

const reviewInsightItemSchema = z.object({
  texto: z.string(),
  confianza: z.enum(['alta', 'media']),
  evidencia_count: z.number(),
});

export type ReviewInsightItem = z.infer<typeof reviewInsightItemSchema>;

export const reviewIntelligenceSchema = z.object({
  problemas_reportados: z.array(reviewInsightItemSchema),
  deseos_no_satisfechos: z.array(reviewInsightItemSchema),
  caracteristicas_faltantes: z.array(reviewInsightItemSchema),
  motivos_compra: z.array(reviewInsightItemSchema),
  motivos_devolucion: z.array(reviewInsightItemSchema),
  prd_document: z.string(),
  confianza_general: z.enum(['alta', 'media', 'sin_dato']),
  nota_metodologica: z.string(),
});

export type ReviewIntelligenceResult = z.infer<typeof reviewIntelligenceSchema>;

const REVIEW_INTELLIGENCE_SYSTEM_PROMPT = `Eres un analista de producto para un negocio que vende en Amazon México.
Tu tarea es leer reviews REALES de productos competidores (no del producto propio) y
extraer patrones objetivos para decidir cómo debería diferenciarse un producto nuevo.

REGLAS ESTRICTAS — no son sugerencias, son requisitos:

1. NUNCA inventes ni generalices un patrón que no esté sustentado por el texto real de
   las reviews que se te dieron. Si una categoría no tiene ningún patrón claro, su array
   debe quedar vacío. Un array vacío es un resultado válido y preferible a un ítem
   fabricado.

2. Reglas de confianza por ítem, basadas en cuántas reviews distintas y de cuántos ASINs
   distintos lo mencionan (usa el campo "asin" de cada review para contar ASINs únicos):
   - "alta": mencionado en 3 o más reviews Y en 2 o más ASINs distintos.
   - "media": mencionado en 1-2 reviews, o en 3+ reviews pero de un solo ASIN.
   - No emitas un ítem si no tiene ningún sustento textual — omítelo del array.

3. evidencia_count debe ser el número real de reviews que sustentan ese ítem específico.

4. confianza_general del análisis completo:
   - "sin_dato" si en total se recibieron menos de 5 reviews utilizables.
   - "media" si hay entre 5 y 20 reviews utilizables, o si están concentradas en un solo ASIN.
   - "alta" solo si hay más de 20 reviews utilizables repartidas en al menos 2 ASINs.

5. prd_document: escribe un documento breve en markdown titulado "Así debería ser nuestro
   producto", basado ÚNICAMENTE en los patrones que sí encontraste. Si confianza_general
   es "sin_dato" o "media", dilo explícitamente al inicio del documento en vez de redactar
   con tono de certeza. Parafrasea los patrones; no copies reviews completas textualmente.

6. nota_metodologica: describe brevemente cuántas reviews de cuáles ASINs se analizaron y
   cualquier limitación relevante.`;

function buildReviewIntelligenceUserPrompt(
  reviews: CompetitorReview[],
  competitorAsins: string[],
  ourProductContext?: string,
): string {
  const reviewsForPrompt = reviews.map((r) => ({
    asin: r.asin,
    rating: r.rating,
    title: r.title,
    body: r.body,
    verified_purchase: r.verified_purchase,
    reviewed_in: r.reviewed_in_raw,
  }));

  return `ASINs de competidores analizados: ${competitorAsins.join(', ')}

${ourProductContext ? `Contexto de nuestro producto candidato (para orientar el PRD):\n${ourProductContext}\n\n` : ''}Reviews recopiladas (${reviews.length} en total):

${JSON.stringify(reviewsForPrompt, null, 2)}

Analiza estas reviews siguiendo exactamente las reglas del system prompt.`;
}

// Recibe las reviews crudas de competidores (Apify) + los ASINs analizados + contexto
// opcional del producto candidato propio, y devuelve el análisis estructurado que se
// guarda en review_insights.insights / .prd_document.
export async function analyzeCompetitorReviews(
  reviews: CompetitorReview[],
  competitorAsins: string[],
  ourProductContext?: string,
): Promise<ReviewIntelligenceResult> {
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 4000,
    system: REVIEW_INTELLIGENCE_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: buildReviewIntelligenceUserPrompt(reviews, competitorAsins, ourProductContext),
      },
    ],
    output_config: {
      format: zodOutputFormat(reviewIntelligenceSchema),
    },
  });

  if (!response.parsed_output) {
    throw new Error('Claude no devolvió un análisis de reviews parseable');
  }

  return response.parsed_output;
}

// --- Supplier Agent ---

const supplierPriceBreakSchema = z.object({
  minQty: z.number(),
  maxQty: z.number().nullable(),
  pricePerUnitUsd: z.number(),
});

const supplierOptionSchema = z.object({
  supplierId: z.string(),
  supplierName: z.string(),
  priceBreaks: z.array(supplierPriceBreakSchema),
  moq: z.number().nullable(),
  moqUnit: z.string().nullable(),
  // NUNCA 'alta' — el precio de un proveedor de Alibaba es un punto de partida de
  // negociación, no una transacción cerrada (a diferencia de SP-API Pricing). El enum ni
  // siquiera incluye la opción, para que Claude no pueda emitirla.
  confianza_precio: z.enum(['media', 'sin_dato']),
  senales_confianza_proveedor: z.string(),
  landed_cost_parcial: z.object({
    unit_price_usd: z.number(),
    amazon_fees_mxn: z.number().nullable(),
    total_parcial_mxn: z.number().nullable(),
    es_parcial: z.literal(true),
  }),
});

export const supplierSearchAnalysisSchema = z.object({
  status: z.enum(['complete', 'sin_dato']),
  opciones: z.array(supplierOptionSchema),
  nota_metodologica: z.string(),
});

export type SupplierSearchAnalysisResult = z.infer<typeof supplierSearchAnalysisSchema>;

export interface SupplierFeesContext {
  fbaFeesMxn: number | null;
  fbmFeesMxn: number | null;
}

const SUPPLIER_AGENT_SYSTEM_PROMPT = `Eres un analista de sourcing para un negocio que vende en Amazon México.
Tu tarea es comparar opciones de proveedores reales (de Alibaba) para un producto
ya validado como candidato de venta, y presentar una comparación clara para que
un humano decida con cuál proveedor avanzar. TÚ NO ELIGES, solo comparas.

REGLAS ESTRICTAS:

1. El precio de un proveedor NUNCA lleva confianza "alta" — es un punto de partida
   de negociación en Alibaba, no una transacción cerrada. Máximo: "media". Si algún
   dato de precio falta o es inconsistente, usa "sin_dato" para esa opción.

2. El landed cost SIEMPRE se marca como parcial (es_parcial: true) — se calcula
   como precio unitario + fees de Amazon ya conocidos, SIN flete ni aranceles
   (no hay fuente de datos para eso en esta fase). No lo presentes como costo
   total real bajo ninguna circunstancia.

   El precio del proveedor viene en USD (Alibaba) y los fees de Amazon en MXN. NO
   tienes una tasa de cambio confiable — NUNCA sumes unit_price_usd + amazon_fees_mxn
   directamente como si fueran la misma moneda, eso produciría un número sin sentido.
   total_parcial_mxn debe quedar en null salvo que tengas una forma válida de expresar
   ambos montos en la misma moneda (no la tienes en esta fase): dejarlo en null y
   reportar unit_price_usd y amazon_fees_mxn por separado es preferible a un total
   fabricado.

3. NUNCA inventes una opción sin datos reales detrás. Si hay menos de 2 leads de
   proveedor utilizables, responde con status "sin_dato" y un array de opciones
   vacío — no rellenes hasta llegar a 2.

4. Elige como máximo 4 opciones de las disponibles, priorizando por leadScore si
   existe. No expliques por qué elegiste esas — solo compáralas.

5. senales_confianza_proveedor debe describir lo que la fuente SÍ reporta (años en
   Alibaba, verificado, trade assurance, tasa de entrega a tiempo) sin inventar
   un score propio que oculte de dónde viene cada señal.

6. nota_metodologica: describe brevemente cuántos leads de proveedor se recibieron,
   cuántas opciones se compararon y cualquier limitación relevante (p.ej. leadTimes
   no disponible, landed cost parcial sin flete/aranceles).`;

// Recibe los productos y leads de proveedor crudos (Apify) + los fees de Amazon ya
// conocidos del candidato (Analyst) y devuelve la comparación estructurada que se guarda
// en supplier_searches.options.
export async function analyzeSupplierOptions(
  products: SupplierProductOption[],
  leads: SupplierLead[],
  ourFeesContext: SupplierFeesContext,
): Promise<SupplierSearchAnalysisResult> {
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 3000,
    system: SUPPLIER_AGENT_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Productos y proveedores encontrados (Apify, scrapesage/alibaba-scraper):
${JSON.stringify({ products, leads }, null, 2)}

Fees de Amazon ya conocidos para este candidato (Product Analyst Agent):
${JSON.stringify(ourFeesContext, null, 2)}

Compara y responde siguiendo exactamente las reglas del system prompt.`,
      },
    ],
    output_config: {
      format: zodOutputFormat(supplierSearchAnalysisSchema),
    },
  });

  if (!response.parsed_output) {
    throw new Error('Claude no devolvió una comparación de proveedores parseable');
  }

  return response.parsed_output;
}

// --- Procurement Agent ---

const rfqDraftSchema = z.object({
  asunto: z.string(),
  cuerpo: z.string(),
  campos_solicitados: z.array(z.string()),
});

export type RfqDraftResult = z.infer<typeof rfqDraftSchema>;

const RFQ_SYSTEM_PROMPT = `Eres un asistente de compras B2B para un negocio mexicano que
importa productos desde China para vender en Amazon México.

Tu tarea es redactar un RFQ (Request for Quotation) profesional EN INGLÉS —
los proveedores de Alibaba operan predominantemente en inglés — dirigido al
proveedor ya elegido, a partir de las specs del producto (que pueden venir
en español; tradúcelas al armar el mensaje, no las copies tal cual) y de los
datos ya vistos en Alibaba (precio de referencia, MOQ, price breaks).

REGLAS:
1. El mensaje debe pedir EXPLÍCITAMENTE que el proveedor cotice: precio final
   confirmado a la cantidad de referencia, costo de flete a México, tiempo
   de entrega (producción + envío), y condiciones de pago aceptadas.
2. Debe dejar claro que el precio visto en Alibaba es una referencia inicial,
   pidiendo confirmación formal — nunca lo trates como un precio ya acordado.
3. Tono profesional, directo, sin comprometerse a comprar — es una solicitud
   de cotización, no una confirmación de orden.
4. NO inventes datos del producto que no estén en la información que se te
   da — si falta un dato relevante, simplemente no lo incluyas en el mensaje
   en vez de rellenarlo.

Responde solo con JSON: { "asunto": string, "cuerpo": string, "campos_solicitados": string[] }`;

// Recibe las specs del producto (raw_data.catalog del candidato) y la opción de
// proveedor ya seleccionada (dentro de supplier_searches.options) y devuelve el RFQ
// que se guarda en procurement_documents (document_type: 'rfq').
export async function generateRfqDraft(
  productSpecs: unknown,
  selectedOption: unknown,
): Promise<RfqDraftResult> {
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 1500,
    system: RFQ_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Specs del producto:\n${JSON.stringify(productSpecs, null, 2)}\n\nOpción de proveedor elegida:\n${JSON.stringify(selectedOption, null, 2)}\n\nRedacta el RFQ siguiendo las reglas del system prompt.`,
      },
    ],
    output_config: {
      format: zodOutputFormat(rfqDraftSchema),
    },
  });

  if (!response.parsed_output) {
    throw new Error('Claude no devolvió un RFQ parseable');
  }

  return response.parsed_output;
}

const poTemplateSchema = z.object({
  asunto: z.string(),
  cuerpo: z.string(),
});

export type PoTemplateResult = z.infer<typeof poTemplateSchema>;

const PO_SYSTEM_PROMPT = `Genera una plantilla de orden de compra (Purchase Order) EN INGLÉS,
a partir de una cantidad y precio YA CONFIRMADOS MANUALMENTE por el usuario
(no del listado original de Alibaba). Incluye: item, cantidad, precio
unitario acordado, condiciones de pago, lugar de entrega, y una nota
explícita y visible de que este documento es una PLANTILLA DE REFERENCIA,
NO un documento legal vinculante ni una transacción real.

Responde solo con JSON: { "asunto": string, "cuerpo": string }`;

// Recibe la cantidad y precio unitario YA CONFIRMADOS por el humano tras recibir la
// respuesta real del proveedor (no los toma del listado original de Alibaba) y devuelve
// la plantilla de PO que se guarda en procurement_documents (document_type: 'po').
export async function generatePoTemplate(
  productSpecs: unknown,
  supplierName: string,
  quantity: number,
  unitPriceUsd: number,
  notes?: string,
): Promise<PoTemplateResult> {
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 1000,
    system: PO_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Producto:\n${JSON.stringify(productSpecs, null, 2)}\n\nProveedor: ${supplierName}\nCantidad confirmada: ${quantity}\nPrecio unitario confirmado (USD): ${unitPriceUsd}\nNotas: ${notes ?? '(ninguna)'}`,
      },
    ],
    output_config: {
      format: zodOutputFormat(poTemplateSchema),
    },
  });

  if (!response.parsed_output) {
    throw new Error('Claude no devolvió una PO parseable');
  }

  return response.parsed_output;
}

// --- Listing Agent ---

const listingDraftSchema = z.object({
  title: z.string(),
  bullets: z.array(z.string()),
  description: z.string(),
  itemHighlights: z.string(),
  backendSearchTerms: z.array(z.string()),
  missingElements: z.array(z.string()),
  aPlusContent: z.array(
    z.object({
      tema: z.string(),
      contenidoEsperado: z.string(),
    }),
  ),
});

export type ListingDraftResult = z.infer<typeof listingDraftSchema>;

const LISTING_DRAFT_SYSTEM_PROMPT = `Eres el Listing Agent de Amazon Business Engine. Recibes los
datos ya guardados de un candidato de producto (catálogo del Scout, análisis del Product Analyst,
insights de reviews si existen) y generas una propuesta de listing optimizado para Amazon México.

Reglas:
(a) Basa todo el contenido ÚNICAMENTE en los datos que recibes (catálogo, análisis, analyst,
    review_intelligence si están presentes). Nunca inventes atributos, certificaciones ni
    afirmaciones del producto que no estén sustentadas en esos datos.
(b) Cuando falte un dato necesario para generar un elemento del listing con confianza,
    agrégalo como texto breve a "missingElements" en vez de generar ese elemento igual con
    contenido inventado o genérico.
(c) "bullets" debe tener al menos 5 elementos.
(d) Incluye la propuesta de A+ Content ("aPlusContent") en esta misma respuesta: cada módulo
    con su "tema" y una descripción breve de "contenidoEsperado".
(e) Respeta estos límites reales de Amazon (2026) al redactar cada campo — quedarte corto es
    preferible a arriesgarte a pasarte:
    - "title": máximo 75 caracteres, incluyendo espacios.
    - cada elemento de "bullets": máximo 255 caracteres.
    - "backendSearchTerms": el conjunto completo de términos no debe superar 249 bytes en
      total (no por término individual) — si te pasas, Amazon descarta el campo completo en
      silencio, no lo trunca. Usa términos separados por espacio, sin comas ni palabras que ya
      aparezcan en el título o los bullets.
(f) "itemHighlights" es un campo nuevo y distinto del título (máximo 125 caracteres) — es
    contenido COMPLEMENTARIO, nunca una repetición del título o los bullets. Amazon introdujo
    este campo junto con el límite de 75 caracteres del título precisamente para dar espacio al
    contenido que el título recortado ya no puede llevar: úsalo para eso, no para repetir lo que
    ya dice el título.

Responde solo con JSON: { "title": string, "bullets": string[], "description": string,
"itemHighlights": string, "backendSearchTerms": string[], "missingElements": string[],
"aPlusContent": { "tema": string, "contenidoEsperado": string }[] }`;

// Recibe el raw_data completo del candidato (catalog/analysis/analyst/review_intelligence) y
// devuelve el Listing Draft que se guarda en listing_drafts.
export async function generateListingDraft(candidateRawData: unknown): Promise<ListingDraftResult> {
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 2500,
    system: LISTING_DRAFT_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Datos del candidato (raw_data completo):\n${JSON.stringify(candidateRawData, null, 2)}\n\nGenera el listing siguiendo exactamente las reglas del system prompt.`,
      },
    ],
    output_config: {
      format: zodOutputFormat(listingDraftSchema),
    },
  });

  if (!response.parsed_output) {
    throw new Error('Claude no devolvió un Listing Draft parseable');
  }

  return response.parsed_output;
}

const listingComparisonItemSchema = z.object({
  texto: z.string(),
  asinsSustento: z.array(z.string()),
});

const listingComparisonSchema = z.object({
  keywordGaps: z.array(listingComparisonItemSchema),
  missingAttributes: z.array(listingComparisonItemSchema),
  structuralDifferences: z.array(listingComparisonItemSchema),
  notaMetodologica: z.string(),
});

export type ListingComparisonResult = z.infer<typeof listingComparisonSchema>;

const LISTING_COMPARISON_SYSTEM_PROMPT = `Eres el Listing Agent de Amazon Business Engine, en su
función de comparar un Listing Draft propio contra datos de catálogo reales de productos
competidores en Amazon México.

Reglas estrictas:
1. Basa cada gap ÚNICAMENTE en los datos de catálogo reales de los competidores resueltos que se
   te dan — nunca inventes un gap sin sustento textual/estructural real.
2. "structuralDifferences" está limitado a lo que los datos de catálogo realmente exponen:
   cantidad de bullets y cantidad de imágenes. Está PROHIBIDO reportar presencia o ausencia de
   A+ Content / Enhanced Brand Content como diferencia de estructura — ese dato no existe en la
   fuente de datos disponible para ningún ASIN, propio ni competidor.
3. Por cada gap (en "keywordGaps", "missingAttributes" o "structuralDifferences"), lista en
   "asinsSustento" exactamente qué ASINs competidores lo sustentan. NO calcules ningún
   porcentaje ni nivel de confianza — eso se calcula fuera de esta llamada.
4. "notaMetodologica": describe brevemente cuántos competidores se compararon y cualquier
   limitación relevante (p. ej. atributos no comparables, datos de catálogo incompletos).

Responde solo con JSON: { "keywordGaps": {texto, asinsSustento}[], "missingAttributes":
{texto, asinsSustento}[], "structuralDifferences": {texto, asinsSustento}[], "notaMetodologica":
string }`;

// Recibe el Listing Draft propio y los datos de catálogo de los competidores ya resueltos, y
// devuelve la comparación cruda (sin nivel de confianza — eso se calcula de forma determinística
// fuera de esta función, ver src/lib/listing-comparison-confidence.ts).
export async function compareListingToCompetitors(
  listingDraft: ListingDraftResult,
  competitorCatalogData: unknown[],
): Promise<ListingComparisonResult> {
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 3000,
    system: LISTING_COMPARISON_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Listing Draft propio:\n${JSON.stringify(listingDraft, null, 2)}\n\nDatos de catálogo de competidores resueltos:\n${JSON.stringify(competitorCatalogData, null, 2)}\n\nCompara siguiendo exactamente las reglas del system prompt.`,
      },
    ],
    output_config: {
      format: zodOutputFormat(listingComparisonSchema),
    },
  });

  if (!response.parsed_output) {
    throw new Error('Claude no devolvió una comparación de listing parseable');
  }

  return response.parsed_output;
}
