import { NextResponse } from 'next/server';
import { analyzeSupplierOptions, type SupplierFeesContext } from '@/lib/claude-analysis';
import { getSupplierOptions, NoSupplierSourceConfiguredError } from '@/lib/supplier-provider';
import { supabaseAdmin } from '@/lib/supabase-admin';

interface RequestBody {
  product_candidate_id?: unknown;
}

interface CandidateRawData {
  analyst?: {
    verdict?: { veredicto?: string };
    feesEstimateFba?: { totalFeesAmount?: { Amount?: number } | null } | null;
    feesEstimateFbm?: { totalFeesAmount?: { Amount?: number } | null } | null;
  };
  catalog?: { summaries?: { itemName?: string }[] };
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as RequestBody | null;

  const candidateId = typeof body?.product_candidate_id === 'string' ? body.product_candidate_id : null;

  if (!candidateId) {
    return NextResponse.json(
      { error: 'Body inválido: se espera { product_candidate_id: string }' },
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

  const rawData = (candidate.raw_data as CandidateRawData | null) ?? {};
  const veredicto = rawData.analyst?.verdict?.veredicto;

  // Rechazo explícito, no una advertencia silenciosa — y no se registra en agent_runs como
  // intento de búsqueda de proveedores (ver spec.md, Requerimientos funcionales).
  if (veredicto !== 'test') {
    return NextResponse.json(
      {
        error: `El candidato "${candidateId}" no tiene veredicto 'test' del Product Analyst Agent (veredicto actual: ${veredicto ?? 'sin analizar'}). El Supplier Agent solo corre sobre candidatos con veredicto 'test'.`,
      },
      { status: 422 },
    );
  }

  const searchTerms = [rawData.catalog?.summaries?.[0]?.itemName ?? candidate.title];

  const startedAt = Date.now();
  const { data: run, error: runError } = await supabaseAdmin
    .from('agent_runs')
    .insert({
      agent_name: 'supplier_agent',
      status: 'running',
      input: { product_candidate_id: candidateId, searchTerms },
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
    let searchResult: Awaited<ReturnType<typeof getSupplierOptions>>;
    try {
      searchResult = await getSupplierOptions(searchTerms);
    } catch (err) {
      if (!(err instanceof NoSupplierSourceConfiguredError)) throw err;

      const { data: search, error: insertError } = await supabaseAdmin
        .from('supplier_searches')
        .insert({
          product_candidate_id: candidateId,
          search_query: { searchTerms },
          status: 'sin_fuente_datos',
        })
        .select('id')
        .single();

      if (insertError || !search) {
        throw new Error(`No se pudo guardar supplier_searches: ${insertError?.message}`);
      }

      await supabaseAdmin
        .from('agent_runs')
        .update({
          status: 'completed',
          output: { supplierSearchId: search.id, status: 'sin_fuente_datos' },
          duration_ms: Date.now() - startedAt,
        })
        .eq('id', run.id);

      return NextResponse.json({ supplierSearchId: search.id, status: 'sin_fuente_datos' });
    }

    const { products, leads } = searchResult;

    // Menos de 2 leads utilizables: no se inventa una comparación — mismo patrón
    // estructural (early return, sin llamar a Claude) que Review Intelligence.
    if (leads.length < 2) {
      const { data: search, error: insertError } = await supabaseAdmin
        .from('supplier_searches')
        .insert({
          product_candidate_id: candidateId,
          search_query: { searchTerms },
          status: 'complete',
          raw_results: { products, leads },
          options: [],
          nota_metodologica: `Se encontraron ${leads.length} lead(s) de proveedor distinto(s) — se requieren al menos 2 para construir una comparación. No se generó ninguna opción para evitar presentar una comparación inventada.`,
        })
        .select('id')
        .single();

      if (insertError || !search) {
        throw new Error(`No se pudo guardar supplier_searches: ${insertError?.message}`);
      }

      await supabaseAdmin
        .from('agent_runs')
        .update({
          status: 'completed',
          output: { supplierSearchId: search.id, status: 'complete', opcionesCount: 0 },
          duration_ms: Date.now() - startedAt,
        })
        .eq('id', run.id);

      return NextResponse.json({ supplierSearchId: search.id, status: 'complete', options: [] });
    }

    const ourFeesContext: SupplierFeesContext = {
      fbaFeesMxn: rawData.analyst?.feesEstimateFba?.totalFeesAmount?.Amount ?? null,
      fbmFeesMxn: rawData.analyst?.feesEstimateFbm?.totalFeesAmount?.Amount ?? null,
    };

    const analysis = await analyzeSupplierOptions(products, leads, ourFeesContext);

    const { data: search, error: insertError } = await supabaseAdmin
      .from('supplier_searches')
      .insert({
        product_candidate_id: candidateId,
        search_query: { searchTerms },
        status: 'complete',
        raw_results: { products, leads },
        options: analysis.opciones,
        nota_metodologica: analysis.nota_metodologica,
      })
      .select('id')
      .single();

    if (insertError || !search) {
      throw new Error(`No se pudo guardar supplier_searches: ${insertError?.message}`);
    }

    await supabaseAdmin
      .from('agent_runs')
      .update({
        status: 'completed',
        output: { supplierSearchId: search.id, status: analysis.status, opcionesCount: analysis.opciones.length },
        duration_ms: Date.now() - startedAt,
      })
      .eq('id', run.id);

    return NextResponse.json({ supplierSearchId: search.id, status: analysis.status, options: analysis.opciones });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    await supabaseAdmin
      .from('agent_runs')
      .update({ status: 'failed', error_message: message, duration_ms: Date.now() - startedAt })
      .eq('id', run.id);

    await supabaseAdmin.from('supplier_searches').insert({
      product_candidate_id: candidateId,
      search_query: { searchTerms },
      status: 'error',
      error_message: message,
    });

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
