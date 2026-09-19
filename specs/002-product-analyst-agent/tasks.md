# Tasks: Product Analyst Agent (Fase 1.5)

- [x] T1: Implementar cliente de SP-API Pricing API
- [x] T2: Implementar cliente de SP-API Product Fees API (FBA y FBM)
- [x] T3: Implementar `analyzeProductCandidate()` con las 12 variables y
      confianza por variable
- [x] T4: Soportar costo manual opcional para calcular Margin
- [x] T5: Emitir veredicto `test` / `reject` / `necesita_mas_datos`
- [x] T6: Mergear resultado en `raw_data.analyst` y loggear en `agent_runs`
- [ ] T7: Capturar el riesgo hazmat como campo estructurado
      (`hazmat_risk: boolean`) en vez de texto libre dentro de
      `nota_metodologica`/`differentiation`. Pendiente conocido, no
      bloqueante.
- [ ] T8: Test de regresión que confirme que Trend/Sales estimate/Revenue
      estimate se mantienen en `sin_dato` mientras no exista una fuente de
      historial conectada — evita que una futura mejora los rellene "por
      accidente" con una estimación no solicitada.
