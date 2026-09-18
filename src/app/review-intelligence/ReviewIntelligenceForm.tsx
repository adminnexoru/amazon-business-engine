'use client';

import { useState, type FormEvent } from 'react';
import ReactMarkdown from 'react-markdown';

interface ReviewInsightItem {
  texto: string;
  confianza: 'alta' | 'media';
  evidencia_count: number;
}

interface ReviewIntelligenceResult {
  problemas_reportados: ReviewInsightItem[];
  deseos_no_satisfechos: ReviewInsightItem[];
  caracteristicas_faltantes: ReviewInsightItem[];
  motivos_compra: ReviewInsightItem[];
  motivos_devolucion: ReviewInsightItem[];
  prd_document: string;
  confianza_general: 'alta' | 'media' | 'sin_dato';
  nota_metodologica: string;
}

interface ReviewIntelligenceResponse {
  reviewInsightId: string;
  status: 'complete' | 'sin_fuente_datos';
  confianza_general?: 'alta' | 'media' | 'sin_dato';
  result?: ReviewIntelligenceResult;
}

const CATEGORY_KEYS = [
  'problemas_reportados',
  'deseos_no_satisfechos',
  'caracteristicas_faltantes',
  'motivos_compra',
  'motivos_devolucion',
] as const;

const CATEGORY_LABELS: Record<(typeof CATEGORY_KEYS)[number], string> = {
  problemas_reportados: 'Problemas reportados',
  deseos_no_satisfechos: 'Deseos no satisfechos',
  caracteristicas_faltantes: 'Características faltantes',
  motivos_compra: 'Motivos de compra',
  motivos_devolucion: 'Motivos de devolución',
};

const CONFIANZA_STYLES: Record<'alta' | 'media' | 'sin_dato', string> = {
  alta: 'text-emerald-400',
  media: 'text-amber-400',
  sin_dato: 'text-slate-500',
};

interface Candidate {
  id: string;
  title: string;
  asin: string | null;
}

interface ReviewIntelligenceFormProps {
  candidates: Candidate[];
  preselectedCandidateId: string | null;
}

export function ReviewIntelligenceForm({
  candidates,
  preselectedCandidateId,
}: ReviewIntelligenceFormProps) {
  const [asinsText, setAsinsText] = useState('');
  const [candidateId, setCandidateId] = useState(preselectedCandidateId ?? '');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [response, setResponse] = useState<ReviewIntelligenceResponse | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    const competitorAsins = asinsText
      .split(/[\n,]/)
      .map((a) => a.trim())
      .filter(Boolean);

    if (competitorAsins.length === 0) return;

    setLoading(true);
    setErrorMessage(null);
    setResponse(null);

    try {
      const res = await fetch('/api/agents/review-intelligence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          competitor_asins: competitorAsins,
          ...(candidateId ? { product_candidate_id: candidateId } : {}),
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? `Error ${res.status}`);
      }

      setResponse(data as ReviewIntelligenceResponse);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }

  const result = response?.result ?? null;
  const confianzaGeneral = response?.confianza_general ?? result?.confianza_general ?? null;

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <textarea
          value={asinsText}
          onChange={(e) => setAsinsText(e.target.value)}
          placeholder={'B0DXXXXXXX\nB0DYYYYYYY\n...'}
          rows={4}
          className="rounded-lg border border-slate-700 bg-slate-900 p-3 font-mono text-sm text-white placeholder:text-slate-600"
        />

        <label className="flex flex-col gap-1 text-sm text-slate-400">
          Vincular a un candidato existente (opcional)
          <select
            value={candidateId}
            onChange={(e) => setCandidateId(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
          >
            <option value="">Ninguno</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title} {c.asin ? `(${c.asin})` : ''}
              </option>
            ))}
          </select>
        </label>

        <button
          type="submit"
          disabled={loading}
          className="w-fit rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white disabled:opacity-50"
        >
          {loading ? 'Analizando reviews...' : 'Analizar reviews'}
        </button>

        {errorMessage && <p className="text-sm text-red-400">{errorMessage}</p>}
      </form>

      {response?.status === 'sin_fuente_datos' && (
        <p className="text-sm text-amber-400">
          No hay fuente de reviews configurada (faltan `APIFY_API_TOKEN` / `APIFY_REVIEWS_ACTOR_ID`
          en el entorno). La corrida quedó guardada como `sin_fuente_datos`.
        </p>
      )}

      {response?.status === 'complete' && !result && (
        <p className="text-sm text-slate-500">
          No se encontraron reviews utilizables para esos ASINs (confianza: sin_dato).
        </p>
      )}

      {result && (
        <section className="flex flex-col gap-4">
          <p className={`text-sm font-semibold ${CONFIANZA_STYLES[confianzaGeneral ?? 'sin_dato']}`}>
            Confianza general: {confianzaGeneral}
          </p>

          {CATEGORY_KEYS.map((key) => {
            const items = result[key];
            return (
              <div key={key} className="flex flex-col gap-1">
                <h3 className="text-sm font-semibold text-slate-200">{CATEGORY_LABELS[key]}</h3>
                {items.length === 0 ? (
                  <p className="text-xs text-slate-500">Sin patrones con sustento suficiente.</p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {items.map((item, i) => (
                      <li key={i} className="text-xs text-slate-300">
                        <span className={`mr-2 font-semibold ${CONFIANZA_STYLES[item.confianza]}`}>
                          {item.confianza}
                        </span>
                        {item.texto}{' '}
                        <span className="text-slate-500">({item.evidencia_count} reviews)</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}

          <p className="max-w-2xl text-xs text-slate-500">{result.nota_metodologica}</p>

          <div
            className="max-w-2xl rounded-lg border border-slate-800 bg-slate-900 p-4 text-sm text-slate-200
              [&_h1]:mb-2 [&_h1]:text-lg [&_h1]:font-bold [&_h2]:mb-2 [&_h2]:mt-3 [&_h2]:text-base
              [&_h2]:font-semibold [&_p]:mb-2 [&_strong]:text-white [&_ul]:mb-2 [&_ul]:list-disc
              [&_ul]:pl-5 [&_ol]:mb-2 [&_ol]:list-decimal [&_ol]:pl-5"
          >
            <ReactMarkdown>{result.prd_document}</ReactMarkdown>
          </div>
        </section>
      )}
    </div>
  );
}
