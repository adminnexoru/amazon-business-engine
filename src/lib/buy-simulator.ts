// src/lib/buy-simulator.ts
//
// Aritmética determinística — sin llamada a Claude a propósito (ver plan.md
// de 007-buy-simulator: no hay juicio cualitativo que requiera un LLM aquí).

export interface SupplierLadderPriceLike {
  minQty: number;
  maxQty: number | null;
  price: number; // USD por unidad, del listado de Alibaba — NO se usa para
                  // el cálculo real (ver landedCostMxnPerUnit), solo para
                  // decidir qué tiers de cantidad ofrecer como escenarios.
}

export interface BuyScenario {
  cantidadComprada: number;
  inversionTotalMxn: number;
  revenueEsperadoMxn: number;
  profitEsperadoMxn: number;
  mesesParaVenderTodo: number;
  mesesParaRecuperarCapital: number;
}

export function buildBuyScenarios(
  ladderPrices: SupplierLadderPriceLike[],
  landedCostMxnPerUnit: number,
  buyBoxPriceMxn: number,
  capitalDisponibleMxn: number,
  unidadesPorMesAsumidas: number,
  maxEscenarios = 4,
): BuyScenario[] {
  const scenarios: BuyScenario[] = [];

  for (const tier of ladderPrices) {
    const cantidad = tier.minQty;
    const inversionTotalMxn = cantidad * landedCostMxnPerUnit;

    if (inversionTotalMxn > capitalDisponibleMxn) continue;

    const revenueEsperadoMxn = cantidad * buyBoxPriceMxn;
    const profitEsperadoMxn = revenueEsperadoMxn - inversionTotalMxn;
    const mesesParaVenderTodo = cantidad / unidadesPorMesAsumidas;
    const ingresoMensualMxn = unidadesPorMesAsumidas * buyBoxPriceMxn;
    const mesesParaRecuperarCapital = ingresoMensualMxn > 0
      ? inversionTotalMxn / ingresoMensualMxn
      : Infinity;

    scenarios.push({
      cantidadComprada: cantidad,
      inversionTotalMxn,
      revenueEsperadoMxn,
      profitEsperadoMxn,
      mesesParaVenderTodo,
      mesesParaRecuperarCapital,
    });

    if (scenarios.length >= maxEscenarios) break;
  }

  return scenarios;
}
