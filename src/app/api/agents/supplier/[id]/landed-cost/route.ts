import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

interface RequestBody {
  landed_cost_mxn?: unknown;
  notes?: unknown;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const body = (await request.json().catch(() => null)) as RequestBody | null;
  const landedCostMxn = typeof body?.landed_cost_mxn === 'number' ? body.landed_cost_mxn : null;
  const notes = typeof body?.notes === 'string' ? body.notes : null;

  if (landedCostMxn === null || !Number.isFinite(landedCostMxn) || landedCostMxn <= 0) {
    return NextResponse.json(
      { error: 'Body inválido: se espera { landed_cost_mxn: number (positivo), notes?: string }' },
      { status: 400 },
    );
  }

  const { data: search, error: fetchError } = await supabaseAdmin
    .from('supplier_searches')
    .select('id')
    .eq('id', id)
    .single();

  if (fetchError || !search) {
    return NextResponse.json(
      { error: `No se encontró la búsqueda de proveedores "${id}": ${fetchError?.message}` },
      { status: 404 },
    );
  }

  const startedAt = Date.now();
  const { data: run } = await supabaseAdmin
    .from('agent_runs')
    .insert({
      agent_name: 'procurement_agent',
      status: 'running',
      input: { supplier_search_id: id, action: 'landed_cost_capture', landed_cost_mxn: landedCostMxn },
    })
    .select('id')
    .single();

  // Captura manual del usuario, no algo que el sistema infiere — mismo patrón que
  // cost_manual/cost_source del Product Analyst Agent (ver plan.md).
  const { data: updated, error: updateError } = await supabaseAdmin
    .from('supplier_searches')
    .update({
      landed_cost_mxn_manual: landedCostMxn,
      landed_cost_source: 'manual',
      landed_cost_notes: notes,
      landed_cost_captured_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (updateError || !updated) {
    if (run) {
      await supabaseAdmin
        .from('agent_runs')
        .update({
          status: 'failed',
          error_message: updateError?.message,
          duration_ms: Date.now() - startedAt,
        })
        .eq('id', run.id);
    }

    return NextResponse.json(
      { error: `No se pudo registrar el landed cost: ${updateError?.message}` },
      { status: 500 },
    );
  }

  if (run) {
    await supabaseAdmin
      .from('agent_runs')
      .update({
        status: 'completed',
        output: { supplier_search_id: id, landed_cost_mxn: landedCostMxn },
        duration_ms: Date.now() - startedAt,
      })
      .eq('id', run.id);
  }

  return NextResponse.json(updated);
}
