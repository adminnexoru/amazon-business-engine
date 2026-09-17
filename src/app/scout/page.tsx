import { supabaseAdmin } from '@/lib/supabase-admin';
import { ScoutForm } from './ScoutForm';

export const dynamic = 'force-dynamic';

export default async function ScoutPage() {
  const { data: candidates, error } = await supabaseAdmin
    .from('product_candidates')
    .select('id, created_at, source, title, asin, category, estimated_competition, status')
    .order('created_at', { ascending: false })
    .limit(50);

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-8 bg-slate-950 px-6 py-10 text-white">
      <div>
        <h1 className="text-3xl font-bold">Scout Agent</h1>
        <p className="mt-1 text-slate-400">
          Pega ASINs o keywords (uno por línea) para buscar oportunidades de producto.
        </p>
      </div>

      <ScoutForm />

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">Candidatos recientes</h2>
        {error ? (
          <pre className="max-w-full overflow-auto text-sm text-red-400">
            {JSON.stringify(error, null, 2)}
          </pre>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-800">
            <table className="min-w-full divide-y divide-slate-800 text-sm">
              <thead className="bg-slate-900 text-left text-slate-400">
                <tr>
                  <th className="px-4 py-2">Título</th>
                  <th className="px-4 py-2">ASIN</th>
                  <th className="px-4 py-2">Categoría</th>
                  <th className="px-4 py-2">Competencia</th>
                  <th className="px-4 py-2">Estado</th>
                  <th className="px-4 py-2">Creado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {candidates?.map((c) => (
                  <tr key={c.id}>
                    <td className="px-4 py-2">{c.title}</td>
                    <td className="px-4 py-2 font-mono text-xs">{c.asin ?? '—'}</td>
                    <td className="px-4 py-2">{c.category ?? '—'}</td>
                    <td className="px-4 py-2">{c.estimated_competition ?? '—'}</td>
                    <td className="px-4 py-2">
                      <span className={c.status === 'error' ? 'text-red-400' : 'text-slate-200'}>
                        {c.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-slate-400">
                      {new Date(c.created_at).toLocaleString('es-MX')}
                    </td>
                  </tr>
                ))}
                {candidates?.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                      Sin candidatos todavía.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
