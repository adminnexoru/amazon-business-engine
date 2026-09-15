-- Otorgar permiso base de lectura al rol anon (requerido además de la política RLS)
grant select on public.product_candidates to anon;