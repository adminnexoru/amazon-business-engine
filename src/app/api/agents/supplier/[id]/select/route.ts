import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

interface RequestBody {
  selected_supplier_id?: unknown;
}

interface SupplierOptionLike {
  supplierId?: string;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const body = (await request.json().catch(() => null)) as RequestBody | null;
  const selectedSupplierId =
    typeof body?.selected_supplier_id === 'string' ? body.selected_supplier_id : null;

  if (!selectedSupplierId) {
    return NextResponse.json(
      { error: 'Body inválido: se espera { selected_supplier_id: string }' },
      { status: 400 },
    );
  }

  const { data: search, error: fetchError } = await supabaseAdmin
    .from('supplier_searches')
    .select('id, options')
    .eq('id', id)
    .single();

  if (fetchError || !search) {
    return NextResponse.json(
      { error: `No se encontró la búsqueda de proveedores "${id}": ${fetchError?.message}` },
      { status: 404 },
    );
  }

  const options = (search.options as SupplierOptionLike[] | null) ?? [];
  const optionExists = options.some((option) => option.supplierId === selectedSupplierId);

  if (!optionExists) {
    return NextResponse.json(
      { error: `"${selectedSupplierId}" no está entre las opciones guardadas en esta búsqueda` },
      { status: 400 },
    );
  }

  // Solo se registra la selección — no dispara RFQ, contacto ni ninguna otra acción
  // (ver plan.md, "Decisiones y su razón").
  const { data: updated, error: updateError } = await supabaseAdmin
    .from('supplier_searches')
    .update({ selected_supplier_id: selectedSupplierId, selected_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (updateError || !updated) {
    return NextResponse.json(
      { error: `No se pudo registrar la selección: ${updateError?.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json(updated);
}
