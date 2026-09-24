# Spec: Buy Simulator (Fase 4, parte 2)

## Qué
Dado un candidato con landed cost real (capturado manualmente vía
Procurement Agent), precio de venta (Buy Box del Product Analyst Agent), y
capital disponible, simula distintos volúmenes de compra mostrando
inversión, revenue esperado, profit, sell-through estimado y capital
recovery — para decidir CUÁNTO comprar, no solo SI comprar.

## Por qué
El Product Analyst Agent da un veredicto binario (`test`/`reject`) basado en
margen por unidad. Eso no dice cuánto capital invertir ni qué tan rápido se
recupera — dos preguntas centrales antes de poner dinero real en inventario.
El Buy Simulator responde eso con distintos escenarios de volumen, dejando
la decisión final 100% en manos del usuario.

## Requerimientos funcionales
- Input: `product_candidate_id`, capital disponible (MXN, manual), y el
  landed cost real capturado en Procurement Agent (spec 006) — si ese
  candidato no tiene una captura manual de landed cost todavía, el
  simulador debe rechazar la corrida o advertir explícitamente que solo
  puede trabajar con el landed cost parcial de Fase 3 (sin flete/aranceles),
  nunca simular en silencio con un costo incompleto sin decirlo.
- El **sell-through/velocidad de venta usado en la simulación es un input
  manual del usuario**, no una estimación del sistema — porque
  `sales_estimate`/`revenue_estimate` siguen en `sin_dato` sin una fuente de
  historial tipo Keepa (Fase 1.5). Inventar una velocidad de venta dentro
  del simulador violaría directamente el principio de "nunca inventar
  datos" — es preferible pedirle al usuario su propio supuesto y dejarlo
  explícito en el resultado.
- Simula al menos 3 escenarios de cantidad de compra (p. ej. alineados a los
  price breaks del proveedor elegido en Fase 3, o cantidades que el usuario
  defina), cada uno mostrando: inversión total, unidades compradas, revenue
  esperado (`unidades × precio de venta × sell-through asumido`), profit
  esperado, y % de capital recovery.
- Cada escenario debe traer visible el supuesto de sell-through que lo
  generó — nunca un número de revenue "pelón" sin decir de qué supuesto
  salió.
- No debe simular una cantidad que exceda el capital disponible declarado.
- Toda corrida queda registrada en `agent_runs`.

## Fuera de alcance (explícitamente)
- No recomienda una cantidad de compra específica ni marca un escenario como
  "el mejor" — solo presenta los números, la decisión es enteramente
  humana.
- No ejecuta ninguna compra ni reserva capital.
- No calcula TIR, valor presente neto, ni ningún modelo financiero más allá
  de un flujo simple de inversión/revenue/profit — es una calculadora de
  escenarios, no un modelo financiero completo.
- No valida ni cuestiona el supuesto de sell-through que el usuario ingresa
  — lo toma tal cual, con la responsabilidad de que sea razonable recayendo
  en el usuario, igual que el costo manual del Analyst.

## Criterios de aceptación
- [ ] Dado un candidato sin captura manual de landed cost, el simulador
      rechaza la corrida o advierte explícitamente que el costo es parcial
      — nunca simula con un costo incompleto sin decirlo.
- [ ] Dado un candidato con landed cost real y un sell-through manual, el
      simulador devuelve al menos 3 escenarios de cantidad, cada uno con
      inversión, revenue, profit y capital recovery.
- [ ] Cada escenario muestra explícitamente el supuesto de sell-through que
      lo generó.
- [ ] Ningún escenario simulado excede el capital disponible declarado.
- [ ] El resultado no marca ni sugiere un escenario como recomendado.
- [ ] Toda corrida queda en `agent_runs`.
