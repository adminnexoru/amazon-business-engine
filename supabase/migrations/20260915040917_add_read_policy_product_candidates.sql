-- Política temporal: permitir lectura pública de product_candidates (para pruebas de Fase 0)
create policy "Allow public read access"
on product_candidates
for select
to anon
using (true);