import { NextResponse } from 'next/server';
import { buildBuyScenarios, type SupplierLadderPriceLike } from '@/lib/buy-simulator';
import { supabaseAdmin } from '@/lib/supabase-admin';

interface RequestBody {
  product_candidate_id?: unknown;
  supplier_search_id?: unknown;
  capital_disponible_mxn?: unknown;
  unidades_por_mes_asumidas?: unknown;
}

interface SupplierOptionLike {
  supplierId?: string;
  priceBreaks?: { minQty?: number; maxQty?: number | null; pricePerUnitUsd?: number }[];
}

interface CandidateRawData {
  analyst?: {
    competitivePricing?: {
      buyBoxNewPrice?: { Amount?: number } | null;
    };
  };
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as RequestBody | null;

  const candidateId = typeof body?.product_candidate_id === 'string' ? body.product_candidate_id : null;
  const supplierSearchId = typeof body?.supplier_search_id === 'string' ? body.supplier_search_id : null;
  const capitalDisponibleMxn =
    typeof body?.capital_disponible_mxn === 'number' ? body.capital_disponible_mxn : null;
  const unidadesPorMesAsumidas =
    typeof body?.unidades_por_mes_asumidas === 'number' ? body.unidades_por_mes_asumidas : null;

  if (
    !candidateId ||
    !supplierSearchId ||
    capitalDisponibleMxn === null ||
    !Number.isFinite(capitalDisponibleMxn) ||
    capitalDisponibleMxn <= 0 ||
    unidadesPorMesAsumidas === null ||
    !Number.isInteger(unidadesPorMesAsumidas) ||
    unidadesPorMesAsumidas <= 0
  ) {
    return NextResponse.json(
      {
        error:
          'Body inválido: se espera { product_candidate_id: string, supplier_search_id: string, capital_disponible_mxn: number (positivo), unidades_por_mes_asumidas: integer (positivo) }',
      },
      { status: 400 },
    );
  }

  const { data: search, error: fetchError } = await supabaseAdmin
    .from('supplier_searches')
    .select('id, product_candidate_id, selected_supplier_id, options, landed_cost_mxn_manual')
    .eq('id', supplierSearchId)
    .single();

  if (fetchError || !search) {
    return NextResponse.json(
      { error: `No se encontró la búsqueda de proveedores "${supplierSearchId}": ${fetchError?.message}` },
      { status: 404 },
    );
  }

  if (search.product_candidate_id !== candidateId) {
    return NextResponse.json(
      {
        error: `La búsqueda de proveedores "${supplierSearchId}" no pertenece al candidato "${candidateId}".`,
      },
      { status: 400 },
    );
  }

  // Nunca simular en silencio con el landed cost parcial de Fase 3 (precio + fees, sin
  // flete/aranceles) — se rechaza la corrida hasta que exista una captura manual real
  // vía el Procurement Agent (ver spec.md / plan.md, criterio de aceptación #1).
  if (search.landed_cost_mxn_manual == null) {
    return NextResponse.json(
      {
        error: `La búsqueda de proveedores "${supplierSearchId}" todavía no tiene un landed cost real capturado. Captura primero el landed cost real vía el Procurement Agent (PATCH /api/agents/supplier/${supplierSearchId}/landed-cost).`,
      },
      { status: 422 },
    );
  }

  const options = (search.options as SupplierOptionLike[] | null) ?? [];
  const selectedOption = options.find((option) => option.supplierId === search.selected_supplier_id);

  if (!selectedOption) {
    return NextResponse.json(
      {
        error: `El proveedor seleccionado "${search.selected_supplier_id}" ya no está entre las opciones guardadas en esta búsqueda.`,
      },
      { status: 500 },
    );
  }

  const { data: candidate, error: candidateError } = await supabaseAdmin
    .from('product_candidates')
    .select('id, raw_data')
    .eq('id', candidateId)
    .single();

  if (candidateError || !candidate) {
    return NextResponse.json(
      { error: `No se encontró el candidato "${candidateId}": ${candidateError?.message}` },
      { status: 404 },
    );
  }

  const rawData = (candidate.raw_data as CandidateRawData | null) ?? {};
  const buyBoxPriceMxn = rawData.analyst?.competitivePricing?.buyBoxNewPrice?.Amount ?? null;

  if (buyBoxPriceMxn == null) {
    return NextResponse.json(
      {
        error: `El candidato "${candidateId}" no tiene un precio de Buy Box conocido (raw_data.analyst.competitivePricing.buyBoxNewPrice), no se puede simular revenue sin un precio de venta real.`,
      },
      { status: 422 },
    );
  }

  const ladderPrices: SupplierLadderPriceLike[] = (selectedOption.priceBreaks ?? [])
    .filter((pb): pb is Required<typeof pb> => typeof pb.minQty === 'number' && typeof pb.pricePerUnitUsd === 'number')
    .map((pb) => ({
      minQty: pb.minQty,
      maxQty: typeof pb.maxQty === 'number' ? pb.maxQty : null,
      price: pb.pricePerUnitUsd,
    }));

  const startedAt = Date.now();
  const { data: run, error: runError } = await supabaseAdmin
    .from('agent_runs')
    .insert({
      agent_name: 'buy_simulator',
      status: 'running',
      input: {
        product_candidate_id: candidateId,
        supplier_search_id: supplierSearchId,
        capital_disponible_mxn: capitalDisponibleMxn,
        unidades_por_mes_asumidas: unidadesPorMesAsumidas,
      },
    })
    .select('id')
    .single();

  if (runError || !run) {
    return NextResponse.json(
      { error: `No se pudo registrar la corrida en agent_runs: ${runError?.message}` },
      { status: 500 },
    );
  }

  try {
    const escenarios = buildBuyScenarios(
      ladderPrices,
      search.landed_cost_mxn_manual,
      buyBoxPriceMxn,
      capitalDisponibleMxn,
      unidadesPorMesAsumidas,
    );

    const { data: simulation, error: insertError } = await supabaseAdmin
      .from('buy_simulations')
      .insert({
        product_candidate_id: candidateId,
        supplier_search_id: supplierSearchId,
        capital_disponible_mxn: capitalDisponibleMxn,
        unidades_por_mes_asumidas: unidadesPorMesAsumidas,
        escenarios,
      })
      .select('id, escenarios')
      .single();

    if (insertError || !simulation) {
      throw new Error(`No se pudo guardar buy_simulations: ${insertError?.message}`);
    }

    await supabaseAdmin
      .from('agent_runs')
      .update({
        status: 'completed',
        // Sin costo de tokens que reportar: este agente no llama a Claude.
        output: { simulationId: simulation.id, escenariosCount: escenarios.length },
        duration_ms: Date.now() - startedAt,
      })
      .eq('id', run.id);

    // Un array vacío (ni el tier más barato cupo en el capital disponible) es un
    // resultado válido y esperado, no un error — se responde 200 con nota explícita.
    return NextResponse.json({
      simulationId: simulation.id,
      escenarios: simulation.escenarios,
      nota: escenarios.length === 0
        ? 'Ningún tier de cantidad del proveedor seleccionado (ni el MOQ mínimo) cupo dentro del capital disponible declarado.'
        : undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    await supabaseAdmin
      .from('agent_runs')
      .update({ status: 'failed', error_message: message, duration_ms: Date.now() - startedAt })
      .eq('id', run.id);

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
