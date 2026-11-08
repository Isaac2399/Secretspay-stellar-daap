# Mainnet — el evento que sigue a Ballena Vibes

Código Cordillera deja la ruta. No mueve el dinero de los invitados este fin de semana. PartyPay ya mueve dinero real con Eurek Corp, empresa consolidada ante la SUGEF. El piloto de Halloween fue de 5 usuarios y 50 ROJOS, unos $100. Ballena Vibes, Uvita, el 14 y el 21 de noviembre, se cobra en testnet. El evento del 12 de diciembre de 2026 es el de mainnet.

Revisado el 7 de noviembre de 2026. No hay un despliegue en la red pública, y no se va a inventar un hash.

Las cuentas públicas del proyecto no existen en mainnet: el admin del contrato `GC5YBV7I…`, el distribuidor `GC5IQE74…` y el emisor `GBSLP3N4…` responden `no-account` en `horizon.stellar.org`. En testnet el admin tiene XLM, así que el cobro del invitado puede salir sin que él pague la red.

## Qué se queda en testnet el 14 y el 21 de noviembre

Ballena Vibes. El saldo de esa gente es dinero real. Cambiar de red entre el 14 y el 21 partiría la custodia a mitad del evento. El contrato sigue cobrando en testnet, y la custodia sigue con Eurek.

El `checkout` del invitado ya no le cobra la red. La transacción la envía la cuenta administradora del contrato (`signAndSend` en `server/escrowContract.ts`). En la pantalla se lee "Sin comisión de red".

## Qué paga el Instaward

La solicitud cierra el 9 de noviembre de 2026. El sprint de 30 días es el preámbulo del evento del 12 de diciembre, no un cobro suelto el 20 de noviembre.

1. Migración de la base de datos de usuarios, pedidos y SINPE, para que cada recarga quede en la cuenta que corresponde.
2. Cambio visual y de marca de la app que sale a mainnet.
3. Contrato `partypay-escrow` desplegado en la red pública, con un producto, comisión de 250 bps y la custodia del evento en Eurek Corp, empresa consolidada ante la SUGEF.
4. Un cobro de ese producto en USDC de Circle, emisor `GA5ZSEJYB37JRC5RCJAELWUHTMYHMEKPVGFBMDLM5AH4VEKBE4SKZU7Z`. La comisión de red la paga la cuenta del contrato, igual que hoy en testnet.
5. El hash publicado en `/traccion`. Hasta ese hash, mainnet no está hecho.

## Si en diciembre no hay XLM

Se dice en voz alta. No se muestra un explorador de testnet como si fuera producción. SEP-10 y SEP-24 en el ancla de prueba siguen siendo la integración de ecosistema que el jurado puede abrir el domingo.
