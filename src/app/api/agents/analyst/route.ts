import { NextResponse } from 'next/server';
import { analyzeProductCandidate, type AnalystVerdict } from '@/lib/claude-analysis';
import {
  getCompetitivePricing,
  getFeesEstimate,
  SpApiError,
  type CompetitivePricingResult,
  type FeesEstimate,
} from '@/lib/sp-api';
import { supabaseAdmin } from '@/lib/supabase-admin';

interface RequestBody {
  product_candidate_id?: unknown;
  manual_cost?: unknown;
}

const EMPTY_COMPETITIVE_PRICING = (asin: string): CompetitivePricingResult => ({
  asin,
  buyBoxNewPrice: null,
  numberOfOfferListings: [],
  salesRankings: [],
  raw: null,
});

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as RequestBody | null;

  const candidateId = typeof body?.product_candidate_id === 'string' ? body.product_candidate_id : null;
  const manualCostRaw = body?.manual_cost;
  const manualCost =
    typeof manualCostRaw === 'number' && Number.isFinite(manualCostRaw) ? manualCostRaw : null;

  if (!candidateId) {
    return NextResponse.json(
      { error: 'Body inválido: se espera { product_candidate_id: string, manual_cost?: number }' },
      { status: 400 },
    );
  }

  const { data: candidate, error: fetchError } = await supabaseAdmin
    .from('product_candidates')
    .select('id, title, asin, raw_data')
    .eq('id', candidateId)
    .single();

  if (fetchError || !candidate) {
    return NextResponse.json(
      { error: `No se encontró el candidato "${candidateId}": ${fetchError?.message}` },
      { status: 404 },
    );
  }

  const startedAt = Date.now();
  const { data: run, error: runError } = await supabaseAdmin
    .from('agent_runs')
    .insert({
      agent_name: 'analyst_agent',
      status: 'running',
      input: { product_candidate_id: candidateId, manual_cost: manualCost },
    })
    .select('id')
    .single();

  if (runError || !run) {
    return NextResponse.json(
      { error: `No se pudo registrar la corrida en agent_runs: ${runError?.message}` },
      { status: 500 },
    );
  }

  await supabaseAdmin.from('product_candidates').update({ status: 'analyzing' }).eq('id', candidateId);

  try {
    const asin = candidate.asin as string | null;

    let competitivePricing: CompetitivePricingResult;
    try {
      competitivePricing = asin
        ? await getCompetitivePricing(asin)
        : EMPTY_COMPETITIVE_PRICING('sin-asin');
    } catch (err) {
      if (err instanceof SpApiError) {
        competitivePricing = EMPTY_COMPETITIVE_PRICING(asin ?? 'sin-asin');
      } else {
        throw err;
      }
    }

    const buyBoxPrice = competitivePricing.buyBoxNewPrice;
    let feesEstimateFba: FeesEstimate | null = null;
    let feesEstimateFbm: FeesEstimate | null = null;

    if (asin && buyBoxPrice?.Amount != null) {
      const priceInput = { amount: buyBoxPrice.Amount, currencyCode: buyBoxPrice.CurrencyCode ?? 'MXN' };
      [feesEstimateFba, feesEstimateFbm] = await Promise.all([
        getFeesEstimate(asin, priceInput, true),
        getFeesEstimate(asin, priceInput, false),
      ]);
    }

    const verdict: AnalystVerdict = await analyzeProductCandidate({
      asin: asin ?? 'sin-asin',
      title: candidate.title,
      scoutRawData: candidate.raw_data,
      competitivePricing,
      feesEstimateFba,
      feesEstimateFbm,
      costManual: manualCost,
    });

    const existingRawData = (candidate.raw_data as Record<string, unknown> | null) ?? {};
    const updatedRawData = {
      ...existingRawData,
      analyst: {
        verdict,
        competitivePricing,
        feesEstimateFba,
        feesEstimateFbm,
        analyzedAt: new Date().toISOString(),
      },
    };

    await supabaseAdmin
      .from('product_candidates')
      .update({
        status: verdict.veredicto,
        raw_data: updatedRawData,
        cost_manual: manualCost,
        cost_source: manualCost != null ? 'manual_estimate' : null,
      })
      .eq('id', candidateId);

    await supabaseAdmin
      .from('agent_runs')
      .update({
        status: 'completed',
        output: { candidateId, verdict: verdict.veredicto },
        duration_ms: Date.now() - startedAt,
      })
      .eq('id', run.id);

    return NextResponse.json({ candidateId, verdict });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    await supabaseAdmin.from('product_candidates').update({ status: 'error' }).eq('id', candidateId);

    await supabaseAdmin
      .from('agent_runs')
      .update({
        status: 'failed',
        error_message: message,
        duration_ms: Date.now() - startedAt,
      })
      .eq('id', run.id);

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
