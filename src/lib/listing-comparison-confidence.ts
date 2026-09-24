// src/lib/listing-comparison-confidence.ts
//
// Cálculo determinístico de confianza para los gaps de Competitor Comparison — Claude
// nunca lo calcula (ver research.md, Decisión 2; FR-014). Función pura, sin llamada a
// Claude, mismo criterio que src/lib/buy-simulator.ts para aritmética que el código
// puede calcular de forma auditable.

export type GapConfidence = 'alta' | 'media' | 'sin_dato';

export interface RawComparisonItem {
  texto: string;
  asinsSustento: string[];
}

export interface ComparisonItemWithConfidence extends RawComparisonItem {
  confianza: GapConfidence;
}

export function computeGapConfidence(
  asinsSustento: string[],
  competitorAsinsResolvedCount: number,
): GapConfidence {
  if (asinsSustento.length === 0 || competitorAsinsResolvedCount === 0) {
    return 'sin_dato';
  }

  const ratio = asinsSustento.length / competitorAsinsResolvedCount;
  return ratio >= 0.7 ? 'alta' : 'media';
}

export function attachConfidence(
  items: RawComparisonItem[],
  competitorAsinsResolvedCount: number,
): ComparisonItemWithConfidence[] {
  return items.map((item) => ({
    ...item,
    confianza: computeGapConfidence(item.asinsSustento, competitorAsinsResolvedCount),
  }));
}
