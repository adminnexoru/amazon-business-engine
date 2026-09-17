-- El Scout Agent corre server-side con la service_role key. Se retira el acceso público
-- temporal de product_candidates (Fase 0) y se deja explícito que solo service_role puede
-- leer/escribir en product_candidates y agent_runs.

drop policy if exists "Allow public read access" on product_candidates;
revoke select on public.product_candidates from anon;

create policy "Service role full access"
on product_candidates
for all
to service_role
using (true)
with check (true);

create policy "Service role full access"
on agent_runs
for all
to service_role
using (true)
with check (true);
