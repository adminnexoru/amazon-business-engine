# Spec: Procurement Agent (Fase 4, parte 1)

## Qué
Un agente que, dado un `supplier_search` con proveedor ya elegido
(`selected_supplier_id` no nulo), redacta un RFQ (solicitud de cotización)
real en texto — listo para que el usuario lo copie y envíe manualmente al
proveedor — y, una vez que el usuario decide proceder, genera una plantilla
de orden de compra (PO). No envía nada automáticamente ni ejecuta ningún
pago.

## Por qué
Redactar un mensaje de negociación desde cero cada vez es trabajo repetido
que ya tiene toda la información necesaria dispersa en el sistema (specs del
candidato, precio/MOQ del proveedor elegido, fees de Amazon). Además, el RFQ
cumple una función que ningún otro agente puede cumplir: es el único
mecanismo del sistema para obtener flete real y tiempo de entrega real —
datos que Alibaba no expone públicamente (confirmado con evidencia en Fase
3) y que solo el proveedor puede cotizar directamente.

## Requerimientos funcionales
- Solo puede correr sobre un `supplier_searches` con `selected_supplier_id`
  no nulo — es la continuación natural de la selección hecha en Fase 3, no
  un flujo independiente.
- Trigger manual (el usuario pide explícitamente generar el RFQ).
- El RFQ generado debe incluir: especificaciones del producto (de
  `raw_data.catalog` del candidato), una cantidad de referencia (tomada de
  los price breaks de la opción seleccionada), y una solicitud EXPLÍCITA de
  cotización real de: precio final, costo de flete, tiempo de entrega, y
  condiciones de pago — precisamente los datos que el sistema no tiene.
- El RFQ debe declarar que el precio/MOQ visto en Alibaba es un punto de
  partida, pidiendo al proveedor confirmar formalmente — coherente con la
  regla ya establecida en Fase 3 de que ese precio nunca es una transacción
  cerrada.
- Debe existir un endpoint separado para capturar manualmente la respuesta
  real del proveedor una vez que el usuario la recibe: como mínimo, un
  landed cost total por unidad en MXN (mismo patrón que el costo manual del
  Product Analyst Agent — un número que el usuario calcula/ingresa, no algo
  que el sistema infiere). Esta captura es la que completa el landed cost
  parcial de Fase 3 y alimenta al Buy Simulator (ver spec 007).
- La plantilla de orden de compra (PO) solo se genera cuando el usuario
  indica explícitamente que decidió proceder — nunca automáticamente tras
  generar el RFQ.
- Toda corrida (generación de RFQ, generación de PO, captura de landed cost
  manual) queda registrada en `agent_runs`.

## Fuera de alcance (explícitamente)
- No envía el RFQ ni ningún mensaje al proveedor — el usuario copia/pega y
  envía por su cuenta (email, chat de Alibaba, WhatsApp, lo que use).
- No negocia ni ajusta precio automáticamente.
- No ejecuta, autoriza, ni programa ningún pago real — eso permanece 100%
  humano (🔴), sin excepción.
- La PO generada es una plantilla de referencia, no un documento legal
  vinculante ni una transacción real.
- No valida que la respuesta del proveedor sea razonable ni la coteja contra
  ninguna fuente — la captura manual de landed cost es un input de
  confianza del usuario, igual que el costo manual del Analyst.

## Criterios de aceptación
- [ ] Dado un `supplier_search` sin `selected_supplier_id`, el agente
      rechaza la corrida con un mensaje explícito.
- [ ] Dado un `supplier_search` con proveedor seleccionado, el RFQ generado
      incluye specs del producto, cantidad de referencia, y una solicitud
      explícita de flete/tiempo de entrega/condiciones de pago.
- [ ] El RFQ nunca se envía automáticamente — la única salida es texto para
      copiar.
- [ ] La captura manual de landed cost (MXN, por unidad) queda persistida y
      asociada al `supplier_search` correspondiente, con su propia marca de
      tiempo y una nota de que es un valor ingresado por el usuario, no
      calculado por el sistema.
- [ ] La PO solo se genera cuando el usuario lo solicita explícitamente
      después del RFQ — nunca como parte del mismo flujo automáticamente.
- [ ] Toda corrida queda en `agent_runs`.
