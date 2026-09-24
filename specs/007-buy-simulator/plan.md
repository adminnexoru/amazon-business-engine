# Plan: Buy Simulator (Fase 4, parte 2)

## Stack
- **Sin llamada a Claude.** A diferencia de los demás agentes, esto es
  aritmética determinística (inversión, revenue, profit, meses para
  recuperar capital) — no hay juicio cualitativo que requiera un LLM, y
  usar uno aquí solo agregaría costo, latencia, y un riesgo de
  inconsistencia numérica sin ningún beneficio real. Implementar como
  funciones puras de TypeScript en `src/lib/buy-simulator.ts`.
- Persistencia: tabla nueva `buy_simulations` (RLS activo, `service_role`).
- Exposición: `POST /api/agents/buy-simulator`, mismo Basic Auth que el
  resto. Se sigue registrando en `agent_runs` pese a no llamar a Claude —
  la trazabilidad de corridas no depende de si hubo IA de por medio.

## Migración — tabla `buy_simulations`

```sql
create table public.buy_simulations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  product_candidate_id uuid not null references public.product_candidates(id) on delete cascade,
  supplier_search_id uuid not null references public.supplier_searches(id) on delete cascade,
  capital_disponible_mxn numeric not null,
  unidades_por_mes_asumidas integer not null,
  escenarios jsonb not null
);

alter table public.buy_simulations enable row level security;
create index buy_simulations_product_candidate_id_idx
  on public.buy_simulations (product_candidate_id);
revoke all on public.buy_simulations from anon, authenticated;
grant all on public.buy_simulations to service_role;
```

## Forma de cada escenario (dentro de `escenarios` jsonb)

```typescript
interface BuyScenario {
  cantidadComprada: number;
  inversionTotalMxn: number;      // cantidad × landed_cost_mxn_manual
  revenueEsperadoMxn: number;     // cantidad × precio de venta (Buy Box)
  profitEsperadoMxn: number;      // revenue - inversión
  mesesParaVenderTodo: number;    // cantidad / unidades_por_mes_asumidas
  mesesParaRecuperarCapital: number; // inversión / (unidades_por_mes_asumidas × precio de venta)
}
```

## Flujo del endpoint

`POST /api/agents/buy-simulator` — body
`{ product_candidate_id, supplier_search_id, capital_disponible_mxn, unidades_por_mes_asumidas }`.

1. Lee `supplier_searches.landed_cost_mxn_manual`. **Si es null, rechaza la
   corrida con 422** ("captura primero el landed cost real vía el
   Procurement Agent") — de las dos opciones que dejaba abierta spec.md
   (rechazar vs. advertir con el parcial de Fase 3), se elige rechazar: más
   simple, y fuerza la secuencia natural RFQ → captura → simulación en vez
   de dejar al usuario simular con un costo que sabíamos incompleto desde
   Fase 3.
2. Lee el precio de venta desde
   `raw_data.analyst.competitivePricing.buyBoxNewPrice.Amount` del
   candidato — **no** desde `raw_data.analyst.verdict.variables.precio.valor`
   (ese campo es texto descriptivo tipo `"$456.90 MXN (Buy Box New, envío $0)"`
   pensado para lectura humana, no un número parseable de forma confiable).
3. Toma los `priceBreaks` de la opción seleccionada dentro de
   `supplier_searches.options` y genera un escenario por cada tier de
   cantidad cuya `inversionTotalMxn` quepa dentro de
   `capital_disponible_mxn` — hasta un máximo razonable (p. ej. 4). Si
   ningún tier cabe en el capital disponible (ni el MOQ mínimo), la
   respuesta debe decirlo explícitamente en vez de forzar un escenario
   inventado con cantidad fraccionaria o por debajo del MOQ real.
4. Calcula los 5 campos de cada `BuyScenario` con las fórmulas de arriba.
5. Inserta en `buy_simulations`, loggea en `agent_runs`
   (`agent_name: 'buy_simulator'`, sin costo de tokens que reportar).

## Decisiones y su razón

- **"Capital recovery" se opera como "meses para recuperar capital"**, no
  como un porcentaje — el roadmap original (AGENTS.md) usaba el término
  genéricamente; un número de meses es más directamente accionable que un
  % sin periodo de referencia explícito.
- **Los escenarios se derivan de los price breaks reales del proveedor
  elegido**, no de cantidades redondas arbitrarias — evita proponer una
  cantidad que el proveedor no honraría a ese precio en la práctica.
- **Ningún escenario recomendado ni destacado** — coincide con el criterio
  de aceptación del spec; el output es una tabla de opciones, no una
  sugerencia.
- **Rechazo explícito si no hay landed cost real capturado**, en vez de
  simular en silencio con el parcial — es la aplicación más directa posible
  del principio "nunca inventar/completar datos faltantes sin decirlo" a
  esta fase.
