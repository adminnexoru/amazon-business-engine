-- Al igual que con el grant SELECT para anon (ver migración
-- 20260915042009), las políticas RLS de la migración anterior no bastan:
-- también hace falta el GRANT base de tabla para que service_role pueda
-- leer/escribir en product_candidates y agent_runs.

grant select, insert, update, delete on public.product_candidates to service_role;
grant select, insert, update, delete on public.agent_runs to service_role;
