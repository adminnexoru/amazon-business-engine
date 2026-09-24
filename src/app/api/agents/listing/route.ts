import { NextResponse } from 'next/server';
import { compareListingToCompetitors, generateListingDraft } from '@/lib/claude-analysis';
import { attachConfidence, type ComparisonItemWithConfidence } from '@/lib/listing-comparison-confidence';
import { getCatalogItem, isAsin, SpApiError } from '@/lib/sp-api';
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

// FR-011: ninguna de estas capacidades existe en este endpoint — si el body las
// solicita explícitamente, se rechaza en vez de ignorarlas en silencio.
const PPC_BLOCKED_KEYS = ['manage_ppc', 'bids', 'campaign_id', 'acos_target', 'ppc'];

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as RequestBody | null;

  // T011b: rechazo explícito de PPC/Advertising, antes de crear la fila en agent_runs.
  if (body && PPC_BLOCKED_KEYS.some((key) => key in body)) {
    return NextResponse.json(
      { error: 'PPC/Advertising está fuera de alcance, bloqueado por falta de acceso a Amazon Ads API' },
      { status: 400 },
    );
  }

  const candidateId = typeof body?.product_candidate_id === 'string' ? body.product_candidate_id : null;

  if (!candidateId) {
    return NextResponse.json(
      { error: 'Body inválido: se espera { product_candidate_id: string, competitor_asins?: string[] }' },
      { status: 400 },
    );
  }

  // T011: competitor_asins acepta de 0 a 10 ASINs válidos; omitido = sin comparación.
  const competitorAsinsRaw = body?.competitor_asins;
  let competitorAsins: string[] = [];

  if (competitorAsinsRaw !== undefined) {
    const isValid =
      Array.isArray(competitorAsinsRaw) &&
      competitorAsinsRaw.length <= 10 &&
      competitorAsinsRaw.every((a): a is string => typeof a === 'string' && isAsin(a));

    if (!isValid) {
      return NextResponse.json(
        { error: 'Body inválido: competitor_asins acepta de 0 a 10 ASINs' },
        { status: 400 },
      );
    }

    competitorAsins = competitorAsinsRaw as string[];
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
      input: { product_candidate_id: candidateId, competitor_asins: competitorAsins },
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

    interface ComparisonFields {
      competitor_asins_requested: string[] | null;
      competitor_asins_resolved: string[] | null;
      comparison_status: 'complete' | 'sin_fuente_datos' | null;
      keyword_gaps: ComparisonItemWithConfidence[] | null;
      missing_attributes: ComparisonItemWithConfidence[] | null;
      structural_differences: ComparisonItemWithConfidence[] | null;
      nota_metodologica: string;
    }

    let comparisonFields: ComparisonFields;

    if (competitorAsins.length === 0) {
      // FR-004 / Clarifications Q2: se omite la comparación sin error, sin llamar a Claude.
      comparisonFields = {
        competitor_asins_requested: null,
        competitor_asins_resolved: null,
        comparison_status: null,
        keyword_gaps: null,
        missing_attributes: null,
        structural_differences: null,
        nota_metodologica: 'Sin comparación de competidores en esta corrida.',
      };
    } else {
      // T012: resuelve cada ASIN competidor individualmente, sin abortar el loop si uno falla.
      const resolved: { asin: string; catalog: unknown }[] = [];
      for (const asin of competitorAsins) {
        try {
          const catalogItem = await getCatalogItem(asin);
          resolved.push({ asin, catalog: catalogItem });
        } catch (err) {
          if (!(err instanceof SpApiError)) throw err;
          // ASIN individual no resuelve (FR-009) — se excluye, no se aborta el loop.
        }
      }

      const resolvedAsins = resolved.map((r) => r.asin);

      if (resolvedAsins.length === 0) {
        // T013 / research.md Decisión 3 / FR-016: ningún competidor resolvió — fuente no
        // disponible en su totalidad. El Listing Draft se entrega igual.
        comparisonFields = {
          competitor_asins_requested: competitorAsins,
          competitor_asins_resolved: [],
          comparison_status: 'sin_fuente_datos',
          keyword_gaps: [],
          missing_attributes: [],
          structural_differences: [],
          nota_metodologica: `Se solicitaron ${competitorAsins.length} ASIN(s) competidores pero ninguno resolvió datos de catálogo.`,
        };
      } else {
        // T016: comparación real vía Claude.
        const comparison = await compareListingToCompetitors(
          listing,
          resolved.map((r) => r.catalog),
        );

        // T017: confianza calculada en código, nunca por Claude (research.md Decisión 2).
        comparisonFields = {
          competitor_asins_requested: competitorAsins,
          competitor_asins_resolved: resolvedAsins,
          comparison_status: 'complete',
          keyword_gaps: attachConfidence(comparison.keywordGaps, resolvedAsins.length),
          missing_attributes: attachConfidence(comparison.missingAttributes, resolvedAsins.length),
          structural_differences: attachConfidence(comparison.structuralDifferences, resolvedAsins.length),
          nota_metodologica: comparison.notaMetodologica,
        };
      }
    }

    // T018: un solo upsert con el Listing Draft y la Competitor Comparison juntos
    // (research.md Decisión 5 — una sola fila, un solo upsert).
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
          ...comparisonFields,
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
        output: { listingDraftId: draft.id, comparisonStatus: comparisonFields.comparison_status },
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
      comparison:
        comparisonFields.comparison_status === null
          ? null
          : {
              status: comparisonFields.comparison_status,
              competitorAsinsRequested: comparisonFields.competitor_asins_requested,
              competitorAsinsResolved: comparisonFields.competitor_asins_resolved,
              keywordGaps: comparisonFields.keyword_gaps,
              missingAttributes: comparisonFields.missing_attributes,
              structuralDifferences: comparisonFields.structural_differences,
              notaMetodologica: comparisonFields.nota_metodologica,
            },
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
