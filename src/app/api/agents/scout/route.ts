import { NextResponse } from 'next/server';
import { analyzeCatalogItem } from '@/lib/claude-analysis';
import { lookupCatalogItem, SpApiError } from '@/lib/sp-api';
import { supabaseAdmin } from '@/lib/supabase-admin';

interface CatalogItemLike {
  asin?: string;
  summaries?: { itemName?: string }[];
}

interface ScoutItemResult {
  input: string;
  status: 'ok' | 'error';
  candidateId?: string;
  error?: string;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { inputs?: unknown } | null;

  if (!body || !Array.isArray(body.inputs)) {
    return NextResponse.json(
      { error: 'Body inválido: se espera { inputs: string[] }' },
      { status: 400 },
    );
  }

  const inputs = body.inputs
    .filter((i): i is string => typeof i === 'string')
    .map((i) => i.trim())
    .filter(Boolean);

  if (inputs.length === 0) {
    return NextResponse.json({ error: 'inputs no puede estar vacío' }, { status: 400 });
  }

  const startedAt = Date.now();
  const { data: run, error: runError } = await supabaseAdmin
    .from('agent_runs')
    .insert({ agent_name: 'scout_agent', status: 'running', input: { inputs } })
    .select('id')
    .single();

  if (runError || !run) {
    return NextResponse.json(
      { error: `No se pudo registrar la corrida en agent_runs: ${runError?.message}` },
      { status: 500 },
    );
  }

  const results: ScoutItemResult[] = [];

  for (const input of inputs) {
    try {
      const catalogData = await lookupCatalogItem(input);
      const analysis = await analyzeCatalogItem(input, catalogData);
      const catalogItem = catalogData as CatalogItemLike;

      const { data: candidate, error: insertError } = await supabaseAdmin
        .from('product_candidates')
        .insert({
          source: 'scout_agent',
          title: catalogItem.summaries?.[0]?.itemName ?? input,
          asin: catalogItem.asin ?? null,
          category: analysis.categoria,
          estimated_price: null,
          estimated_demand: null,
          estimated_competition: analysis.estimated_competition,
          estimated_margin_pct: null,
          raw_data: { catalog: catalogData, analysis },
          status: 'pending',
        })
        .select('id')
        .single();

      if (insertError || !candidate) {
        throw new Error(`No se pudo guardar el candidato: ${insertError?.message}`);
      }

      results.push({ input, status: 'ok', candidateId: candidate.id });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status = err instanceof SpApiError ? err.status : null;

      const { data: candidate } = await supabaseAdmin
        .from('product_candidates')
        .insert({
          source: 'scout_agent',
          title: input,
          asin: null,
          category: null,
          estimated_price: null,
          estimated_demand: null,
          estimated_competition: null,
          estimated_margin_pct: null,
          raw_data: { error: { message, spApiStatus: status } },
          status: 'error',
        })
        .select('id')
        .single();

      results.push({ input, status: 'error', candidateId: candidate?.id, error: message });
    }
  }

  const hasErrors = results.some((r) => r.status === 'error');

  await supabaseAdmin
    .from('agent_runs')
    .update({
      status: hasErrors ? 'completed_with_errors' : 'completed',
      output: { results },
      duration_ms: Date.now() - startedAt,
    })
    .eq('id', run.id);

  return NextResponse.json({ runId: run.id, results });
}
