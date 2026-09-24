import { NextResponse } from 'next/server';
import { generateListingDraft } from '@/lib/claude-analysis';
import { supabaseAdmin } from '@/lib/supabase-admin';

interface RequestBody {
  product_candidate_id?: unknown;
  competitor_asins?: unknown;
}

interface CandidateRawData {
  catalog?: unknown;
  analysis?: unknown;
  analyst?: unknown;
  review_intelligence?: unknown;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as RequestBody | null;

  const candidateId = typeof body?.product_candidate_id === 'string' ? body.product_candidate_id : null;

  if (!candidateId) {
    return NextResponse.json(
      { error: 'Body inválido: se espera { product_candidate_id: string, competitor_asins?: string[] }' },
      { status: 400 },
    );
  }

  const { data: candidate, error: fetchError } = await supabaseAdmin
    .from('product_candidates')
    .select('id, title, raw_data')
    .eq('id', candidateId)
    .single();

  if (fetchError || !candidate) {
    return NextResponse.json(
      { error: `No se encontró el candidato "${candidateId}": ${fetchError?.message}` },
      { status: 404 },
    );
  }

  const rawData = (candidate.raw_data as CandidateRawData | null) ?? {};

  // FR-017 / Clarifications Q5: sin datos de catálogo no hay nada real de qué partir —
  // rechazo explícito, no se crea fila en agent_runs (mismo patrón que el chequeo de
  // veredicto del Supplier Agent).
  if (!rawData.catalog) {
    return NextResponse.json(
      {
        error: `El candidato "${candidateId}" no tiene datos de catálogo (el Scout Agent no ha corrido sobre él). Genera el candidato con el Scout Agent primero.`,
      },
      { status: 422 },
    );
  }

  const startedAt = Date.now();
  const { data: run, error: runError } = await supabaseAdmin
    .from('agent_runs')
    .insert({
      agent_name: 'listing_agent',
      status: 'running',
      input: { product_candidate_id: candidateId },
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
    const listing = await generateListingDraft(candidate.raw_data);

    const { data: draft, error: upsertError } = await supabaseAdmin
      .from('listing_drafts')
      .upsert(
        {
          product_candidate_id: candidateId,
          updated_at: new Date().toISOString(),
          title: listing.title,
          bullets: listing.bullets,
          description: listing.description,
          item_highlights: listing.itemHighlights,
          backend_search_terms: listing.backendSearchTerms,
          missing_elements: listing.missingElements,
          a_plus_content: listing.aPlusContent,
          // TODO (US2, T011-T018): comparación contra competidores.
          competitor_asins_requested: null,
          competitor_asins_resolved: null,
          comparison_status: null,
          keyword_gaps: null,
          missing_attributes: null,
          structural_differences: null,
          nota_metodologica: 'Sin comparación de competidores en esta corrida.',
        },
        { onConflict: 'product_candidate_id' },
      )
      .select('id')
      .single();

    if (upsertError || !draft) {
      throw new Error(`No se pudo guardar listing_drafts: ${upsertError?.message}`);
    }

    await supabaseAdmin
      .from('agent_runs')
      .update({
        status: 'completed',
        output: { listingDraftId: draft.id },
        duration_ms: Date.now() - startedAt,
      })
      .eq('id', run.id);

    return NextResponse.json({
      listingDraftId: draft.id,
      listing: {
        title: listing.title,
        bullets: listing.bullets,
        description: listing.description,
        itemHighlights: listing.itemHighlights,
        backendSearchTerms: listing.backendSearchTerms,
        missingElements: listing.missingElements,
        aPlusContent: listing.aPlusContent,
      },
      comparison: null,
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
