# Tasks: Review Intelligence Agent (Fase 2)

- [x] T1: Migración `review_insights` en Supabase con RLS
- [x] T2: `src/lib/reviews-provider.ts` — cliente de Apify
      (`getCompetitorReviews`), con `NoReviewsSourceConfiguredError` cuando
      faltan las variables de entorno
- [x] T3: `analyzeCompetitorReviews()` en `claude-analysis.ts` con las 5
      categorías, reglas de confianza por ítem, y `prd_document`
- [x] T4: Endpoint `POST /api/agents/review-intelligence` con las tres ramas
      (sin fuente / cero reviews / éxito) como `return` tempranos
- [x] T5: Proteger rutas `/review-intelligence` y
      `/api/agents/review-intelligence` con Basic Auth
- [x] T6: UI (`/review-intelligence`, `ReviewIntelligenceForm.tsx`) + link
      "Reviews →" desde `/scout`
- [x] T7: Prueba end-to-end real sobre `amazon.com.mx` (1 ASIN, 1 review) —
      confirmó `confianza_general: sin_dato` y categorías vacías sin
      sustento en vez de inventadas
- [x] T8: Documentar en AGENTS.md (Estado del proyecto, Database schema,
      Agents, Protected routes)
- [x] T9: Prueba end-to-end con 3–5 ASINs reales para validar el caso de
      confianza `alta` (≥3 reviews en ≥2 ASINs). Evidencia:
      - `reviewInsightId: b6ee5bed-87a8-43ac-aeec-6807de86c81d`
      - Corrida sobre 4 ASINs (B077HFMK1Z, B07J5462K1, B084H97Z7X,
        B095BJHWSP), 40 reviews totales
      - `confianza_general: alta`
      - Confirmado que también se alcanzó `confianza: alta` a nivel de ítem
        individual (no solo agregado) en 3 de las 4 categorías, ej.
        "Presencia de piedras en el café en grano" (problemas_reportados,
        `evidencia_count: 3`) y varios ítems en motivos_compra
        (`evidencia_count` hasta 12)
      - Validación cruzada manual: el hallazgo "discrepancia grano/molido"
        quedó correctamente en `confianza: media` (no alta) porque sus 2
        reviews de soporte vienen del mismo ASIN (B077HFMK1Z) — confirma que
        la regla de "≥2 ASINs distintos" se está aplicando, no solo el
        conteo de reviews
- [ ] T10: Resolver la condición de carrera en `raw_data` compartida entre
      Scout/Analyst/Review Intelligence (función `update` atómica o lock
      optimista) — pendiente, no bloqueante, afecta a las tres fases.
- [ ] T11: Verificar el tamaño real de `ourProductContext` (todo el
      `raw_data` del candidato serializado sin recortar) contra un
      candidato que ya tenga análisis del Analyst, para confirmar que no
      infla el costo del prompt sin que se note.
- [ ] T12: Agregar un campo opcional `asins_evidencia: string[]` a cada ítem del
      schema Zod de `ReviewInsightItem` (además de `evidencia_count`), para que
      cada hallazgo declare explícitamente de qué ASINs viene su evidencia.
      Hoy no hay forma de auditar de manera independiente si un ítem marcado
      `alta` realmente cumple el requisito de "≥2 ASINs distintos" sin cruzar
      a mano el JSON crudo de reviews contra el resultado de Claude — a
      diferencia de la regla de "nunca inventar un ítem", que sí está forzada
      estructuralmente por el schema, esta solo se verificó una vez de forma
      manual (ver evidencia de T9).
