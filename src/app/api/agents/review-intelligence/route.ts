import { NextResponse } from 'next/server';
import { analyzeCompetitorReviews, type ReviewIntelligenceResult } from '@/lib/claude-analysis';
import {
  getCompetitorReviews,
  NoReviewsSourceConfiguredError,
  type CompetitorReview,
} from '@/lib/reviews-provider';
import { supabaseAdmin } from '@/lib/supabase-admin';

const REVIEWS_SOURCE = 'junglee_amazon_reviews_scraper';

interface RequestBody {
  competitor_asins?: unknown;
  product_candidate_id?: unknown;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as RequestBody | null;

  const competitorAsins = Array.isArray(body?.competitor_asins)
    ? body.competitor_asins
        .filter((a): a is string => typeof a === 'string')
        .map((a) => a.trim())
        .filter(Boolean)
    : [];
  const productCandidateId =
    typeof body?.product_candidate_id === 'string' ? body.product_candidate_id : null;

  if (competitorAsins.length === 0) {
    return NextResponse.json(
      { error: 'Body inválido: se espera { competitor_asins: string[], product_candidate_id?: string }' },
      { status: 400 },
    );
  }

  const maxAsinsPerRun = Number(process.env.REVIEW_AGENT_MAX_ASINS_PER_RUN ?? 5);
  if (competitorAsins.length > maxAsinsPerRun) {
    return NextResponse.json(
      { error: `Máximo ${maxAsinsPerRun} ASINs por corrida (REVIEW_AGENT_MAX_ASINS_PER_RUN)` },
      { status: 400 },
    );
  }

  let candidateRawData: unknown = null;
  if (productCandidateId) {
    const { data: candidate, error: fetchError } = await supabaseAdmin
      .from('product_candidates')
      .select('id, raw_data')
      .eq('id', productCandidateId)
      .single();

    if (fetchError || !candidate) {
      return NextResponse.json(
        { error: `No se encontró el candidato "${productCandidateId}": ${fetchError?.message}` },
        { status: 404 },
      );
    }
    candidateRawData = candidate.raw_data;
  }

  const startedAt = Date.now();
  const { data: run, error: runError } = await supabaseAdmin
    .from('agent_runs')
    .insert({
      agent_name: 'review_intelligence_agent',
      status: 'running',
      input: { competitor_asins: competitorAsins, product_candidate_id: productCandidateId },
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
    let reviews: CompetitorReview[];
    try {
      reviews = await getCompetitorReviews(competitorAsins);
    } catch (err) {
      if (!(err instanceof NoReviewsSourceConfiguredError)) throw err;

      const { data: insight, error: insertError } = await supabaseAdmin
        .from('review_insights')
        .insert({
          product_candidate_id: productCandidateId,
          competitor_asins: competitorAsins,
          status: 'sin_fuente_datos',
        })
        .select('id')
        .single();

      if (insertError || !insight) {
        throw new Error(`No se pudo guardar review_insights: ${insertError?.message}`);
      }

      await supabaseAdmin
        .from('agent_runs')
        .update({
          status: 'completed',
          output: { reviewInsightId: insight.id, status: 'sin_fuente_datos' },
          duration_ms: Date.now() - startedAt,
        })
        .eq('id', run.id);

      return NextResponse.json({ reviewInsightId: insight.id, status: 'sin_fuente_datos' });
    }

    if (reviews.length === 0) {
      const { data: insight, error: insertError } = await supabaseAdmin
        .from('review_insights')
        .insert({
          product_candidate_id: productCandidateId,
          competitor_asins: competitorAsins,
          status: 'complete',
          reviews_source: REVIEWS_SOURCE,
          raw_reviews: reviews,
          confianza_general: 'sin_dato',
        })
        .select('id')
        .single();

      if (insertError || !insight) {
        throw new Error(`No se pudo guardar review_insights: ${insertError?.message}`);
      }

      await supabaseAdmin
        .from('agent_runs')
        .update({
          status: 'completed',
          output: { reviewInsightId: insight.id, status: 'complete', confianza_general: 'sin_dato' },
          duration_ms: Date.now() - startedAt,
        })
        .eq('id', run.id);

      return NextResponse.json({
        reviewInsightId: insight.id,
        status: 'complete',
        confianza_general: 'sin_dato',
      });
    }

    const ourProductContext = candidateRawData ? JSON.stringify(candidateRawData) : undefined;
    const result: ReviewIntelligenceResult = await analyzeCompetitorReviews(
      reviews,
      competitorAsins,
      ourProductContext,
    );

    const { data: insight, error: insertError } = await supabaseAdmin
      .from('review_insights')
      .insert({
        product_candidate_id: productCandidateId,
        competitor_asins: competitorAsins,
        status: 'complete',
        reviews_source: REVIEWS_SOURCE,
        raw_reviews: reviews,
        insights: {
          problemas_reportados: result.problemas_reportados,
          deseos_no_satisfechos: result.deseos_no_satisfechos,
          caracteristicas_faltantes: result.caracteristicas_faltantes,
          motivos_compra: result.motivos_compra,
          motivos_devolucion: result.motivos_devolucion,
        },
        prd_document: result.prd_document,
        confianza_general: result.confianza_general,
        nota_metodologica: result.nota_metodologica,
      })
      .select('id')
      .single();

    if (insertError || !insight) {
      throw new Error(`No se pudo guardar review_insights: ${insertError?.message}`);
    }

    if (productCandidateId) {
      const existingRawData = (candidateRawData as Record<string, unknown> | null) ?? {};
      await supabaseAdmin
        .from('product_candidates')
        .update({
          raw_data: {
            ...existingRawData,
            review_intelligence: {
              reviewInsightId: insight.id,
              result,
              analyzedAt: new Date().toISOString(),
            },
          },
        })
        .eq('id', productCandidateId);
    }

    await supabaseAdmin
      .from('agent_runs')
      .update({
        status: 'completed',
        output: {
          reviewInsightId: insight.id,
          status: 'complete',
          confianza_general: result.confianza_general,
        },
        duration_ms: Date.now() - startedAt,
      })
      .eq('id', run.id);

    return NextResponse.json({ reviewInsightId: insight.id, status: 'complete', result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    await supabaseAdmin
      .from('agent_runs')
      .update({ status: 'failed', error_message: message, duration_ms: Date.now() - startedAt })
      .eq('id', run.id);

    await supabaseAdmin.from('review_insights').insert({
      product_candidate_id: productCandidateId,
      competitor_asins: competitorAsins,
      status: 'error',
      error_message: message,
    });

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
