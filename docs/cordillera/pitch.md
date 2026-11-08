# PartyPay — pitch de 3 minutos

Código Cordillera, track Scale. Demo day 8 de noviembre de 2026.
Baseline: tag `kickoff` en `a30cef3` (pantalla de pedidos con QR para abrir la app).
App: https://partypay-stellar-daap.vercel.app/

Decir solo lo que se puede abrir. Si un número no tiene enlace, no se dice.

## 0:00 — Problema

Dentro de un evento la fila y la comisión de la tarjeta se comen la venta. PartyPay ya trabaja con Eurek Corp, empresa consolidada ante la SUGEF. El invitado recarga con SINPE, efectivo, tarjeta o USDC (₡1,000 = 1 ROJO), pide en la app y retira con QR. El contrato reparte la venta. El piloto de Halloween fue de 5 usuarios y 50 ROJOS, unos $100. Este hackathon deja el cobro listo para repetirlo. El 14 y el 21 de noviembre siguen en testnet, porque ese saldo es dinero real. El evento siguiente es el de mainnet.

## 0:40 — Demo en el teléfono del jurado

1. Abrir la app. Pulsar **Entrar como cliente**. No hay registro ni billetera.
2. En el evento, el saldo en ROJOS está arriba del nombre. Abajo, **Carta** y **Pedidos**.
3. En Carta, un producto, **Pagar y ordenar**.
4. El recibo muestra el número, el QR, lo que pagó, lo que recibió la barra, PartyPay y **Ver el pago**. La pestaña **Pedidos** queda arriba, sin bajar por la carta.
5. Salir. Pulsar **Entrar como empresa**. Se abre la carta y la cola de esa barra.
6. Si hay tiempo: Agregar dinero → Agregar dólares. Es SEP-10 y SEP-24 contra el ancla de prueba.

## 1:40 — Qué se construyó desde `kickoff`

- Entrar como cliente y entrar como empresa, sin cuenta.
- Saldo arriba del nombre del evento, y pestañas **Carta** y **Pedidos**.
- Al pagar, el número y el QR salen de una vez. Si el producto se acaba, se ofrece otro con stock.
- La comisión de red la paga la cuenta que envía el contrato, no el invitado.
- Recibo con el reparto y el enlace a la transacción.
- Agregar dólares otra vez en el camino del invitado. Es SEP-10 y SEP-24 en el ancla de prueba.
- `/traccion`: pedidos con hash, y la ruta del evento siguiente.

## 2:20 — Prueba

El piloto citado en el Instaward: 5 usuarios y 50 ROJOS en Halloween. En `/traccion` solo se leen filas que tengan hash. Los siguientes eventos ya tienen fecha: Ballena Vibes, Uvita, el 14 y el 21 de noviembre. Esos dos se cobran en testnet. El saldo es dinero real y no se mueve de red a mitad del evento.

## 2:40 — El evento siguiente es mainnet

Este fin de semana no declara mainnet. Deja la ruta con fecha y con quién la paga.

- 14 y 21 de noviembre: Ballena Vibes, testnet, custodia con Eurek.
- El evento posterior, el 12 de diciembre de 2026, es el de la red pública.
- El Instaward, que cierra el 9 de noviembre, financia ese corte: migración de la base de datos, cambio visual y de marca, y el contrato desplegado en mainnet con la custodia de Eurek Corp ante la SUGEF.
- Hasta que `/traccion` tenga un hash de la red pública, mainnet no está hecho. Las cuentas del proyecto hoy responden `no-account` en `horizon.stellar.org`.
- SCF Build queda como el financiamiento que sigue, con este demo y con el evento de diciembre.

Cerrar: el jurado pidió como cliente, vio su saldo y su pedido sin bajar, y vio la cola como empresa. Stellar hace el cobro. El próximo evento se queda en testnet. El que sigue sale a mainnet con Eurek.
