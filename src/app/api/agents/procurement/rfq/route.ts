import { NextResponse } from 'next/server';
import { generateRfqDraft } from '@/lib/claude-analysis';
import { supabaseAdmin } from '@/lib/supabase-admin';

interface RequestBody {
  supplier_search_id?: unknown;
}

interface SupplierOptionLike {
  supplierId?: string;
}

interface CandidateRawData {
  catalog?: unknown;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as RequestBody | null;

  const supplierSearchId =
    typeof body?.supplier_search_id === 'string' ? body.supplier_search_id : null;

  if (!supplierSearchId) {
    return NextResponse.json(
      { error: 'Body inválido: se espera { supplier_search_id: string }' },
      { status: 400 },
    );
  }

  const { data: search, error: fetchError } = await supabaseAdmin
    .from('supplier_searches')
    .select('id, product_candidate_id, selected_supplier_id, options')
    .eq('id', supplierSearchId)
    .single();

  if (fetchError || !search) {
    return NextResponse.json(
      { error: `No se encontró la búsqueda de proveedores "${supplierSearchId}": ${fetchError?.message}` },
      { status: 404 },
    );
  }

  // Rechazo explícito, no una advertencia silenciosa — y no se registra en agent_runs como
  // intento de generación de RFQ, mismo patrón que el rechazo por veredicto del Supplier Agent.
  if (!search.selected_supplier_id) {
    return NextResponse.json(
      {
        error: `La búsqueda de proveedores "${supplierSearchId}" todavía no tiene un proveedor seleccionado (selected_supplier_id). El Procurement Agent solo corre sobre una selección ya hecha.`,
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
    .select('id, title, raw_data')
    .eq('id', search.product_candidate_id)
    .single();

  if (candidateError || !candidate) {
    return NextResponse.json(
      { error: `No se encontró el candidato asociado "${search.product_candidate_id}": ${candidateError?.message}` },
      { status: 404 },
    );
  }

  const rawData = (candidate.raw_data as CandidateRawData | null) ?? {};
  const productSpecs = rawData.catalog ?? candidate.title;

  const startedAt = Date.now();
  const { data: run, error: runError } = await supabaseAdmin
    .from('agent_runs')
    .insert({
      agent_name: 'procurement_agent',
      status: 'running',
      input: { supplier_search_id: supplierSearchId, document_type: 'rfq' },
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
    const draft = await generateRfqDraft(productSpecs, selectedOption);

    const { data: document, error: insertError } = await supabaseAdmin
      .from('procurement_documents')
      .insert({
        supplier_search_id: supplierSearchId,
        document_type: 'rfq',
        content: draft,
      })
      .select('id, content')
      .single();

    if (insertError || !document) {
      throw new Error(`No se pudo guardar procurement_documents: ${insertError?.message}`);
    }

    await supabaseAdmin
      .from('agent_runs')
      .update({
        status: 'completed',
        output: { documentId: document.id, document_type: 'rfq' },
        duration_ms: Date.now() - startedAt,
      })
      .eq('id', run.id);

    return NextResponse.json({ documentId: document.id, document: document.content });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    await supabaseAdmin
      .from('agent_runs')
      .update({ status: 'failed', error_message: message, duration_ms: Date.now() - startedAt })
      .eq('id', run.id);

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
