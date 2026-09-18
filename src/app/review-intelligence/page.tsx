import { supabaseAdmin } from '@/lib/supabase-admin';
import { ReviewIntelligenceForm } from './ReviewIntelligenceForm';

export const dynamic = 'force-dynamic';

interface ReviewIntelligencePageProps {
  searchParams: Promise<{ product_candidate_id?: string }>;
}

export default async function ReviewIntelligencePage({ searchParams }: ReviewIntelligencePageProps) {
  const { product_candidate_id: preselectedCandidateId } = await searchParams;

  const { data: candidates } = await supabaseAdmin
    .from('product_candidates')
    .select('id, title, asin')
    .order('created_at', { ascending: false })
    .limit(50);

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-8 bg-slate-950 px-6 py-10 text-white">
      <div>
        <h1 className="text-3xl font-bold">Review Intelligence Agent</h1>
        <p className="mt-1 text-slate-400">
          Pega ASINs de competidores para extraer problemas, deseos no satisfechos y motivos de
          compra/devolución de sus reviews reales, y generar un PRD preliminar.
        </p>
      </div>

      <ReviewIntelligenceForm
        candidates={candidates ?? []}
        preselectedCandidateId={preselectedCandidateId ?? null}
      />
    </main>
  );
}
