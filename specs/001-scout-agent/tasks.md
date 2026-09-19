# Tasks: Scout Agent (Fase 1)

- [x] T1: Crear tabla `product_candidates` en Supabase con RLS
- [x] T2: Crear tabla `agent_runs` para bitácora
- [x] T3: Implementar cliente de SP-API Catalog Items
- [x] T4: Implementar llamada a Claude (`analyzeCatalogItem`) para análisis
      de candidato
- [x] T5: Proteger ruta `/api/agents/scout` con Basic Auth
- [x] T6: Registrar cada corrida en `agent_runs`
- [~] T7: Contract test — validar que el schema de salida de Claude siempre
      incluye los campos esperados antes de escribir a `product_candidates`.
      **Parcialmente cubierto**: `zodOutputFormat` fuerza el schema en cada
      llamada a la API (no es opcional ni dependiente de que Claude "decida"
      cumplirlo), lo cual es la garantía más fuerte posible en tiempo de
      ejecución. Sigue pendiente un test automatizado de regresión que
      falle explícitamente en CI si el schema se relaja sin querer.
- [ ] T8: Test de "no inventar datos" — correr con un ASIN de catálogo pobre
      y verificar que los campos quedan vacíos, no rellenados. No
      automatizado todavía; solo validado manualmente durante el desarrollo
      inicial.
