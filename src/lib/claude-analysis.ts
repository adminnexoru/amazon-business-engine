import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import type { CompetitivePricingResult, FeesEstimate } from './sp-api';

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
- reviews: cantidad de reviews. No hay fuente disponible sin Keepa; usa 'sin_dato' salvo que el
  catálogo traiga explícitamente un conteo.
- rating: calificación promedio. Misma regla que reviews: 'sin_dato' salvo dato explícito del catálogo.
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
${JSON.stringify(context.costManual)}`,
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
