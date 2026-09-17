'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

interface ScoutItemResult {
  input: string;
  status: 'ok' | 'error';
  error?: string;
}

export function ScoutForm() {
  const router = useRouter();
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ScoutItemResult[] | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    const inputs = value
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    if (inputs.length === 0) return;

    setLoading(true);
    setErrorMessage(null);
    setResults(null);

    try {
      const res = await fetch('/api/agents/scout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputs }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? `Error ${res.status}`);
      }

      setResults(data.results);
      router.refresh();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={'B0DXXXXXXX\ncargador inalámbrico rápido\n...'}
        rows={6}
        className="rounded-lg border border-slate-700 bg-slate-900 p-3 font-mono text-sm text-white placeholder:text-slate-600"
      />
      <button
        type="submit"
        disabled={loading}
        className="w-fit rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white disabled:opacity-50"
      >
        {loading ? 'Buscando...' : 'Buscar oportunidades'}
      </button>

      {errorMessage && <p className="text-sm text-red-400">{errorMessage}</p>}

      {results && (
        <ul className="flex flex-col gap-1 text-sm">
          {results.map((r) => (
            <li key={r.input} className={r.status === 'error' ? 'text-red-400' : 'text-emerald-400'}>
              {r.input}: {r.status === 'error' ? r.error : 'ok'}
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
