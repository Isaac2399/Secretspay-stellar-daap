# SCF Build — borrador

Listo el 8 de noviembre de 2026 para la convocatoria de SCF Build que esté abierta ese día. No se inventa fecha de cierre ni monto aprobado.

## Problema

En un evento de miles de personas la barra se atasca y cada venta con tarjeta paga comisión al procesador. PartyPay ya cubre boletería en Web2 para un productor de Costa Rica (eventos de 2.000 a 5.000 personas). Falta el pago dentro del venue.

## Qué está construido

El invitado entra con email, o con **Entrar al evento** en la demo. Carga saldo con SINPE Móvil, efectivo en el stand, o dólares por SEP-10 y SEP-24 (ancla de prueba `testanchor.stellar.org`). El pedido llama a `checkout` en el contrato Soroban `partypay-escrow`: cobra, baja inventario y parte el bruto en una sola llamada. La comisión de plataforma es 250 bps cuando el evento la tiene configurada. La comisión de red no la paga el invitado: la transacción la firma la cuenta administradora del contrato.

Contrato de testnet citado en el README: `CC633M77TFTEUWK4X4R35DVUB2WXAP5WFN7ZBR2KI5BCFEMTBBX7A2S4`.

La app en producción sigue en testnet. Mainnet no está hecho. La ruta está en `mainnet.md`.

## Tracción que sí se puede citar

Solo lo que esté en https://partypay-stellar-daap.vercel.app/traccion el día de la solicitud: hashes, tamaño de la lista de espera y, si existe, el texto del venue en `TRACTION_VENUE_NOTE`. Un piloto de 10–50 personas no se escribe como hecho.

## Uso de fondos

1. Desplegar el contrato y cobrar en USDC de Circle en la red pública, con la custodia del piloto SINPE todavía en testnet hasta el evento.
2. Pasar el depósito en dólares del ancla de prueba a un ancla con allowlist (MoneyGram Access sigue pendiente; no es un botón del producto).
3. Operar el piloto del 12 de diciembre de 2026: caja, conciliación SINPE y soporte en sala.

## Hitos

- 9 de noviembre de 2026: cierre de la solicitud del Instaward. Ese sprint paga la base de datos, el cambio visual y de marca, y el contrato en mainnet con la custodia de Eurek Corp ante la SUGEF.
- 14 y 21 de noviembre de 2026: Ballena Vibes sigue en testnet. El saldo es dinero real.
- 12 de diciembre de 2026: primer evento en mainnet, si `/traccion` ya tiene el hash. Si no hay hash, no se declara hecho.
- 14 de febrero de 2027: 50 a 100 personas con quien ya pidió en diciembre.
