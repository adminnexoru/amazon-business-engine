import { NextResponse } from 'next/server';
import { generatePoTemplate } from '@/lib/claude-analysis';
import { supabaseAdmin } from '@/lib/supabase-admin';

interface RequestBody {
  supplier_search_id?: unknown;
  quantity?: unknown;
  unit_price_usd?: unknown;
  notes?: unknown;
}

interface SupplierOptionLike {
  supplierId?: string;
  supplierName?: string;
}

interface CandidateRawData {
  catalog?: unknown;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as RequestBody | null;

  const supplierSearchId =
    typeof body?.supplier_search_id === 'string' ? body.supplier_search_id : null;
  const quantity = typeof body?.quantity === 'number' ? body.quantity : null;
  const unitPriceUsd = typeof body?.unit_price_usd === 'number' ? body.unit_price_usd : null;
  const notes = typeof body?.notes === 'string' ? body.notes : undefined;

  if (
    !supplierSearchId ||
    quantity === null ||
    !Number.isFinite(quantity) ||
    quantity <= 0 ||
    unitPriceUsd === null ||
    !Number.isFinite(unitPriceUsd) ||
    unitPriceUsd <= 0
  ) {
    return NextResponse.json(
      {
        error:
          'Body inválido: se espera { supplier_search_id: string, quantity: number (positivo), unit_price_usd: number (positivo), notes?: string }',
      },
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
  const supplierName = selectedOption.supplierName ?? search.selected_supplier_id;

  const startedAt = Date.now();
  const { data: run, error: runError } = await supabaseAdmin
    .from('agent_runs')
    .insert({
      agent_name: 'procurement_agent',
      status: 'running',
      input: { supplier_search_id: supplierSearchId, document_type: 'po', quantity, unit_price_usd: unitPriceUsd },
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
    // Cantidad y precio ya confirmados manualmente por el usuario tras recibir la
    // respuesta real del proveedor — no se toman de las priceBreaks originales de
    // Alibaba (ver plan.md, "Decisiones y su razón").
    const template = await generatePoTemplate(productSpecs, supplierName, quantity, unitPriceUsd, notes);

    const { data: document, error: insertError } = await supabaseAdmin
      .from('procurement_documents')
      .insert({
        supplier_search_id: supplierSearchId,
        document_type: 'po',
        content: template,
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
        output: { documentId: document.id, document_type: 'po' },
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
