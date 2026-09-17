import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';

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
