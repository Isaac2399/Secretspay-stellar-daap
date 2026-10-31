import { extractSinpeCodes, isSecretsCode } from '../server/sinpe/code.ts'
import {
  inboundEmailIsTrusted,
  isCompleteSinpeCreditEmail,
  looksLikeIncomingCredit,
} from '../server/sinpe/inboundEmail.ts'
import { parseSinpeSms } from '../server/sinpe/parseSms.ts'

const popularEmail = `
Estimado cliente, el Banco Popular le informa que ha recibido un Sinpe Móvil
por un monto de 1,150.00 CRC de Elizondo Mena Jonathan Mariano.
Referencia 2026103015283000821738269. Fecha y hora 30/10/2026 10:30:15 PM.
Transacción SINPE
Referencia SINPE: 2026103015283000821738269
Estado de la Transacción: Aplicado
Canal Origen: SM Entrante
Servicio SINPE: Sinpe Móvil
Teléfono Destino: 86266696
Monto Neto: 1,150.00
Monto Comisión: 00.00
Moneda: CRC
Descripción: j***********
Tipo de Movimiento: Crédito
`.trim()

const withVisibleCode = popularEmail.replace(
  'Descripción: j***********',
  'Descripción: sc23456789ts',
)

const liveCredit = `
Estimado cliente, el Banco Popular le informa que ha recibido un Sinpe Móvil por un monto de 00.10 CRC de CAMACHO NAVARRO ISACC. Referencia 2026103181483001010830281. Fecha y hora 31/10/2026 12:55:13 PM
En caso de duda o consulta por favor comunicarse al 22022020 o al correo electrónico Popularenlinea@bp.fi.cr
Transacción SINPE
Referencia SINPE: 2026103181483001010830281
Fecha: 31/10/2026 12:55:13 PM
Estado de la Transacción: Aplicado
Canal Origen: SM Entrante
Servicio SINPE: Sinpe Móvil
Nombre Origen: CAMACHO NAVARRO ISACC
Nombre Destino: GREIVIN RICARDO MADRIGAL HIDALGO
Identificación Destino: 01-1596-0034
Entidad Origen: 0814-Cooperativa Nacional de Educadores R.L. (COOPENAE)
Teléfono Destino: 86266696
Monto Neto: 00.10
Monto Comisión: 00.00
Moneda: CRC
Descripción: scVDC7E8CTts Transf
Tipo de Movimiento: Crédito
`.trim()

for (const sample of [
  { name: 'Correo real del Popular (descripción tapada)', text: popularEmail, from: 'rmadrigal.sb@gmail.com' },
  { name: 'El mismo correo si la descripción trajera el código', text: withVisibleCode, from: 'rmadrigal.sb@gmail.com' },
  { name: 'Abono de ₡0.10 con código visible', text: liveCredit, from: 'rmadrigal.sb@gmail.com' },
  { name: 'El mismo abono si llega directo del Popular', text: liveCredit, from: 'Popularenlinea@bp.fi.cr' },
]) {
  const parsed = parseSinpeSms(sample.text)
  const code = extractSinpeCodes(sample.text).find((entry) => isSecretsCode(entry))
  const credit = looksLikeIncomingCredit(sample.text)
  const complete = isCompleteSinpeCreditEmail(sample.text)
  const trusted = inboundEmailIsTrusted({
    from: sample.from,
    text: sample.text,
    bankFrom: sample.text.includes('@bp.fi.cr') ? 'popularenlinea@bp.fi.cr' : '',
  })
  console.log(`\n${sample.name}`)
  console.log(`  es abono: ${credit ? 'sí' : 'no'}`)
  console.log(`  comprobante completo: ${complete ? 'sí' : 'no'}`)
  console.log(`  remitente autorizado: ${trusted ? 'sí' : 'no'} (${sample.from})`)
  console.log(`  monto CRC: ${parsed?.crcAmount ?? 'no leído'}`)
  console.log(`  referencia: ${parsed?.referenceId ?? 'no leída'}`)
  console.log(`  nota leída: ${parsed?.comment || 'vacía'}`)
  console.log(`  código cuenta: ${code ?? 'no viene'}`)
  console.log(
    trusted && code
      ? '  resultado: se acredita a esa cuenta'
      : '  resultado: se guarda el correo, pero no recarga solo',
  )
}
