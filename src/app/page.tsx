import { supabase } from '@/lib/supabase';

export default async function Home() {
  const { count, error } = await supabase
    .from('product_candidates')
    .select('*', { count: 'exact', head: true });

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-950 text-white">
      <h1 className="text-4xl font-bold">Autonomous Amazon Business Engine</h1>
      <p className="text-slate-400">Fase 0 — Hola mundo desplegado ✅</p>
      {error ? (
        <pre className="text-red-400 text-sm max-w-xl overflow-auto">
          {JSON.stringify(error, null, 2)}
        </pre>
      ) : (
        <p className="text-green-400">
          Conectado a Supabase ✅ — product_candidates: {count} registros
        </p>
      )}
    </main>
  );
}