-- Product Analyst Agent: agrega costo manual (opcional, cuando no hay costo real de
-- abastecimiento) y amplía los posibles valores de status para reflejar el veredicto
-- del análisis.

alter table product_candidates
  add column cost_manual numeric,
  add column cost_source text;

alter table product_candidates
  add constraint product_candidates_cost_source_check
  check (cost_source is null or cost_source = 'manual_estimate');

comment on column product_candidates.cost_manual is
  'Costo unitario estimado a mano por el humano cuando no hay costo real de abastecimiento.';
comment on column product_candidates.cost_source is
  'Origen del costo usado en el análisis: ''manual_estimate'' si vino de cost_manual, null si no hay costo.';

-- El status inicial de un candidato es 'pending' (Scout Agent). El Product Analyst Agent
-- lo mueve a 'analyzing' mientras corre y lo deja en 'test' | 'reject' | 'necesita_mas_datos'
-- según el veredicto de Claude, o 'error' si la corrida falla.
alter table product_candidates
  add constraint product_candidates_status_check
  check (status in ('pending', 'analyzing', 'test', 'reject', 'necesita_mas_datos', 'error'));

comment on column product_candidates.status is
  'pending (recién creado por Scout) | analyzing (Analyst Agent corriendo) | test | reject | '
  'necesita_mas_datos (veredicto del Analyst Agent) | error (falló la corrida de algún agente).';
