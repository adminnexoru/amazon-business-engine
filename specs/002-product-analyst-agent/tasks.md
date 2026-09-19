# Tasks: Product Analyst Agent (Fase 1.5)

- [x] T1: Implementar cliente de SP-API Pricing API
- [x] T2: Implementar cliente de SP-API Product Fees API (FBA y FBM)
- [x] T3: Implementar `analyzeProductCandidate()` con las 12 variables y
      confianza por variable
- [x] T4: Soportar costo manual opcional para calcular Margin
- [x] T5: Emitir veredicto `test` / `reject` / `necesita_mas_datos`
- [x] T6: Mergear resultado en `raw_data.analyst` y loggear en `agent_runs`
- [ ] T7: Generalizar la detección de riesgos cualitativos a un campo
      estructurado `risk_flags` (array de objetos, no un booleano suelto),
      en vez de dejarlos como texto libre dentro de
      `justificacion`/`differentiation`/`nota_metodologica`. La versión
      anterior de esta tarea (`hazmat_risk: boolean`) queda obsoleta por
      insuficiente — evidencia real de tres candidatos en producción:

      - ASIN B0FJ4QYJ63 (reloj Nivada Swiss): hazmat presente (UN9998,
        batería litio-polímero 2Wh) pero con excepción "Unregulated" en
        prácticamente todos los países, incluido MX — riesgo bajo en la
        práctica.
      - ASIN B0DK8X1WWV (auriculares JKMX): hazmat presente (UN3481a,
        Grupo de Embalaje II) — clasificación de peligro real, sin
        excepción amplia, con implicaciones reales de costo/restricción de
        flete aéreo y marítimo (relevante directamente para Fase 3,
        Supplier Agent).
      - ASIN B076TMYWFC (café La Parroquia de Veracruz): dos riesgos
        cualitativos distintos identificados solo en prosa dentro de
        `justificacion` — riesgo de autorización de reventa (marca de
        tercero con brand owner activo, Comercializadora Fernández Rivero,
        posible Brand Registry) y riesgo de perecibilidad (fecha de
        caducidad, merma en FBA no reflejada en el margen calculado).

      Diseño propuesto (a validar, no cerrado):
      `risk_flags: { tipo: 'hazmat' | 'brand_authorization' | 'perishable'
      | ..., severidad: 'alta' | 'media' | 'baja', detalle: string }[]`.

      Para `tipo: 'hazmat'` específicamente, `severidad` debe distinguir
      entre una excepción regulatoria real (caso del reloj: bajo) y una
      clasificación de peligro real con grupo de embalaje asignado (caso
      de los auriculares: alto) — un solo booleano perdería justo esa
      distinción, que es la que más importa para estimar costo/riesgo de
      flete en Fase 3.
- [ ] T8: Test de regresión que confirme que Trend/Sales estimate/Revenue
      estimate se mantienen en `sin_dato` mientras no exista una fuente de
      historial conectada — evita que una futura mejora los rellene "por
      accidente" con una estimación no solicitada.
