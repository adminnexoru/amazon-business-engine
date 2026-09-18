'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

interface AnalystVariable {
  valor: string;
  confianza: 'alta' | 'media' | 'sin_dato';
}

interface AnalystVerdict {
  variables: Record<string, AnalystVariable>;
  veredicto: 'test' | 'reject' | 'necesita_mas_datos';
  justificacion: string;
  nota_metodologica: string;
}

const VARIABLE_LABELS: Record<string, string> = {
  precio: 'Precio',
  bsr: 'BSR',
  reviews: 'Reviews',
  rating: 'Rating',
  competencia: 'Competencia',
  trend: 'Trend',
  sales_estimate: 'Sales estimate',
  revenue_estimate: 'Revenue estimate',
  amazon_fees: 'Amazon fees',
  cost: 'Cost',
  margin: 'Margin',
  differentiation: 'Differentiation',
};

const VEREDICTO_STYLES: Record<AnalystVerdict['veredicto'], string> = {
  test: 'text-emerald-400',
  reject: 'text-red-400',
  necesita_mas_datos: 'text-amber-400',
};

const CONFIANZA_STYLES: Record<AnalystVariable['confianza'], string> = {
  alta: 'text-emerald-400',
  media: 'text-amber-400',
  sin_dato: 'text-slate-500',
};

interface AnalystPanelProps {
  candidateId: string;
  status: string;
  verdict: AnalystVerdict | null;
}

export function AnalystPanel({ candidateId, status, verdict }: AnalystPanelProps) {
  const router = useRouter();
  const [manualCost, setManualCost] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const canAnalyze = status === 'pending' || status === 'necesita_mas_datos';

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setErrorMessage(null);

    const parsedCost = manualCost.trim() === '' ? null : Number(manualCost);

    try {
      const res = await fetch('/api/agents/analyst', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_candidate_id: candidateId,
          ...(parsedCost != null ? { manual_cost: parsedCost } : {}),
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? `Error ${res.status}`);
      }

      router.refresh();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {verdict && (
        <div className="flex flex-col gap-1">
          <span className={`text-sm font-semibold ${VEREDICTO_STYLES[verdict.veredicto]}`}>
            {verdict.veredicto}
          </span>
          <p className="max-w-md text-xs text-slate-400">{verdict.justificacion}</p>
          <details className="text-xs">
            <summary className="cursor-pointer text-slate-400">Ver las 12 variables</summary>
            <table className="mt-2 min-w-[20rem] text-xs">
              <tbody className="divide-y divide-slate-800">
                {Object.entries(VARIABLE_LABELS).map(([key, label]) => {
                  const variable = verdict.variables[key];
                  if (!variable) return null;
                  return (
                    <tr key={key}>
                      <td className="py-1 pr-3 text-slate-400">{label}</td>
                      <td className="py-1 pr-3 text-slate-200">{variable.valor}</td>
                      <td className={`py-1 ${CONFIANZA_STYLES[variable.confianza]}`}>
                        {variable.confianza}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-2 max-w-md text-slate-500">{verdict.nota_metodologica}</p>
          </details>
        </div>
      )}

      {canAnalyze && (
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <input
            type="number"
            step="0.01"
            min="0"
            value={manualCost}
            onChange={(e) => setManualCost(e.target.value)}
            placeholder="Costo manual (opcional)"
            className="w-40 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-white placeholder:text-slate-600"
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded bg-emerald-600 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
          >
            {loading ? 'Analizando...' : verdict ? 'Reanalizar' : 'Analizar'}
          </button>
        </form>
      )}

      {errorMessage && <p className="text-xs text-red-400">{errorMessage}</p>}
    </div>
  );
}
