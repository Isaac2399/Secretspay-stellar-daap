import axios, { AxiosError, type AxiosInstance } from 'axios'
import { randomInt } from 'node:crypto'
import {
  cyberfuelEndpoint,
  loadInvoicingEnv,
  type InvoicingEnv,
} from '../config/env.config.js'
import { money } from './currency.service.js'
import {
  HaciendaDocType,
  IdType,
  InvoicingError,
  PaymentMethod,
  type CustomerInfo,
  type CyberfuelMakeXmlPayload,
  type CyberfuelMakeXmlResponse,
  type HaciendaDocTypeCode,
  type IdTypeCode,
  type InvoiceMoney,
  type PaymentMethodCode,
} from '../types.js'

let client: AxiosInstance | null = null

function http(env = loadInvoicingEnv()): AxiosInstance {
  if (client) {
    return client
  }
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
  if (env.CYBERFUEL_API_KEY) {
    headers['X-API-Key'] = env.CYBERFUEL_API_KEY
  }
  if (env.CYBERFUEL_BEARER_TOKEN) {
    headers.Authorization = `Bearer ${env.CYBERFUEL_BEARER_TOKEN}`
  }
  client = axios.create({
    timeout: 45_000,
    headers,
  })
  return client
}

export function resetCyberfuelClient(): void {
  client = null
}

function costaRicaNow(): {
  iso: string
  dia: string
  mes: string
  anno: string
} {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Costa_Rica',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date())
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? '00'
  const dia = get('day')
  const mes = get('month')
  const anno = get('year')
  return {
    iso: `${anno}-${mes}-${dia}T${get('hour')}:${get('minute')}:${get('second')}-06:00`,
    dia,
    mes,
    anno: anno.slice(-2),
  }
}

function pad(value: string | number, size: number): string {
  return String(value).replace(/\D/g, '').padStart(size, '0')
}

function codigoSeguridad(): string {
  return String(randomInt(0, 100_000_000)).padStart(8, '0')
}

function idType(value: string | undefined, fallback: IdTypeCode): IdTypeCode {
  const allowed = new Set<string>(Object.values(IdType))
  return value && allowed.has(value) ? (value as IdTypeCode) : fallback
}

function medioPago(value: string): PaymentMethodCode {
  const allowed = new Set<string>(Object.values(PaymentMethod))
  return allowed.has(value) ? (value as PaymentMethodCode) : PaymentMethod.Otros
}

function documentType(customer: CustomerInfo): HaciendaDocTypeCode {
  if (customer.numeroIdentificacion && customer.tipoIdentificacion) {
    return HaciendaDocType.FacturaElectronica
  }
  if (customer.numeroIdentificacion) {
    return HaciendaDocType.FacturaElectronica
  }
  return HaciendaDocType.TiqueteElectronico
}

function receptorFromCustomer(
  customer: CustomerInfo,
): CyberfuelMakeXmlPayload['receptor'] {
  const receptor: CyberfuelMakeXmlPayload['receptor'] = {
    nombre: customer.nombre,
  }
  if (customer.numeroIdentificacion) {
    receptor.identificacion = {
      tipo: idType(customer.tipoIdentificacion, IdType.CedulaFisica),
      numero: customer.numeroIdentificacion.replace(/\D/g, ''),
    }
  }
  if (customer.nombreComercial) {
    receptor.nombre_comercial = customer.nombreComercial
  }
  if (customer.correo) {
    receptor.correo_electronico = customer.correo
  }
  if (customer.telefono) {
    receptor.telefono = { cod_pais: '506', numero: customer.telefono.replace(/\D/g, '') }
  }
  if (customer.ubicacion) {
    receptor.ubicacion = {
      provincia: customer.ubicacion.provincia ?? '1',
      canton: customer.ubicacion.canton ?? '01',
      distrito: customer.ubicacion.distrito ?? '01',
      barrio: customer.ubicacion.barrio ?? '01',
      sennas: customer.ubicacion.sennas ?? 'Costa Rica',
    }
  }
  return receptor
}

function ivaTarifaCode(taxRate: number): string {
  if (taxRate <= 0) return '01'
  if (taxRate === 1) return '02'
  if (taxRate === 2) return '03'
  if (taxRate === 4) return '04'
  return '08'
}

export function buildMakeXmlPayload(input: {
  consecutivo: number
  customer: CustomerInfo
  cabysCode: string
  description: string
  money: InvoiceMoney
  txHash: string
  walletAddress: string
  assetCode?: string
  network?: string
}): CyberfuelMakeXmlPayload {
  const env = loadInvoicingEnv()
  const now = costaRicaNow()
  const tipo = documentType(input.customer)
  const gravado = input.money.taxRate > 0
  const neto = money(input.money.netoCRC)
  const iva = money(input.money.ivaCRC)
  const total = money(input.money.totalCRC)

  return {
    api_key: env.CYBERFUEL_API_KEY,
    clave: {
      sucursal: env.CYBERFUEL_SUCURSAL,
      terminal: env.CYBERFUEL_TERMINAL,
      tipo,
      comprobante: String(input.consecutivo),
      pais: '506',
      dia: now.dia,
      mes: now.mes,
      anno: now.anno,
      situacion_presentacion: env.CYBERFUEL_SITUACION_PRESENTACION,
      codigo_seguridad: codigoSeguridad(),
    },
    encabezado: {
      fecha: now.iso,
      condicion_venta: '01',
      plazo_credito: '0',
      medio_pago: [medioPago(env.CYBERFUEL_MEDIO_PAGO)],
    },
    emisor: buildEmisor(env),
    receptor: receptorFromCustomer(input.customer),
    detalle: [
      {
        numero: '1',
        codigo_cabys: input.cabysCode,
        codigo: [{ tipo: '01', codigo: input.cabysCode }],
        cantidad: '1.00000',
        unidad_medida: 'Sp',
        unidad_medida_comercial: 'Servicio',
        detalle: input.description,
        precio_unitario: neto,
        monto_total: neto,
        descuento: '0.00000',
        naturaleza_descuento: '',
        subtotal: neto,
        impuesto: [
          {
            codigo: '01',
            codigo_tarifa: ivaTarifaCode(input.money.taxRate),
            tarifa: money(input.money.taxRate, 2),
            monto: iva,
          },
        ],
        montototallinea: total,
      },
    ],
    resumen: {
      moneda: 'CRC',
      tipo_cambio: money(input.money.tipoCambio, 5),
      totalserviciogravado: gravado ? neto : '0.00000',
      totalservicioexento: gravado ? '0.00000' : neto,
      totalmercaderiagravado: '0.00000',
      totalmercaderiaexento: '0.00000',
      totalgravado: gravado ? neto : '0.00000',
      totalexento: gravado ? '0.00000' : neto,
      totalventa: neto,
      totaldescuentos: '0.00000',
      totalventaneta: neto,
      totalimpuestos: iva,
      totalcomprobante: total,
    },
    otros: [
      {
        codigo: 'txHash',
        texto: 'Hash de transacción blockchain (idempotencia)',
        contenido: input.txHash,
      },
      {
        codigo: 'wallet',
        texto: 'Wallet pagadora',
        contenido: input.walletAddress,
      },
      {
        codigo: 'amountUSD',
        texto: 'Monto cobrado on-chain (USD equivalente)',
        contenido: money(input.money.amountUSD, 5),
      },
      {
        codigo: 'asset',
        texto: 'Activo / red',
        contenido: `${input.assetCode ?? 'USDC'} ${input.network ?? 'stellar-testnet'}`,
      },
    ],
    envio: {
      aplica: '1',
      emisor: { correo: env.EMISOR_CORREO },
      receptor: { correo: input.customer.correo || env.EMISOR_CORREO },
    },
  }
}

function buildEmisor(env: InvoicingEnv): CyberfuelMakeXmlPayload['emisor'] {
  return {
    nombre: env.EMISOR_NOMBRE,
    identificacion: {
      tipo: idType(env.EMISOR_TIPO_IDENTIFICACION, IdType.CedulaJuridica),
      numero: env.EMISOR_NUMERO,
    },
    nombre_comercial: env.EMISOR_NOMBRE_COMERCIAL || env.EMISOR_NOMBRE,
    ubicacion: {
      provincia: pad(env.EMISOR_PROVINCIA, 1).slice(-1) || '1',
      canton: pad(env.EMISOR_CANTON, 2),
      distrito: pad(env.EMISOR_DISTRITO, 2),
      barrio: pad(env.EMISOR_BARRIO, 2),
      sennas: env.EMISOR_SENNAS,
    },
    telefono: {
      cod_pais: '506',
      numero: env.EMISOR_TELEFONO.replace(/\D/g, '') || '22222222',
    },
    correo_electronico: env.EMISOR_CORREO,
  }
}

function pickString(raw: unknown, keys: string[]): string | undefined {
  if (!raw || typeof raw !== 'object') {
    return undefined
  }
  const record = raw as Record<string, unknown>
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) {
      return value
    }
  }
  return undefined
}

function parseMakeXmlResponse(raw: unknown): CyberfuelMakeXmlResponse {
  return {
    raw,
    clave: pickString(raw, ['clave', 'Clave', 'claveNumerica', 'numero_documento']),
    consecutivo: pickString(raw, ['consecutivo', 'comprobante', 'numeroConsecutivo']),
    estado: pickString(raw, ['estado', 'status', 'ind-estado', 'ind_estado']),
    mensaje: pickString(raw, ['mensaje', 'mensajeHacienda', 'mensaje-hacienda', 'error']),
  }
}

function isHaciendaUnavailable(status?: number, body?: unknown): boolean {
  const text = JSON.stringify(body ?? '').toLowerCase()
  if (status && status >= 500) {
    return true
  }
  return (
    text.includes('hacienda') &&
    (text.includes('inacces') ||
      text.includes('timeout') ||
      text.includes('no disponible') ||
      text.includes('unavailable'))
  )
}

/**
 * Firma, genera XML y presenta el comprobante en el sandbox de Cyberfuel.
 */
export async function createInvoice(
  invoiceData: CyberfuelMakeXmlPayload,
): Promise<CyberfuelMakeXmlResponse> {
  const url = cyberfuelEndpoint('makeXML')
  try {
    const response = await http().post(url, invoiceData)
    const parsed = parseMakeXmlResponse(response.data)
    const estado = (parsed.estado ?? '').toLowerCase()
    if (
      estado.includes('rechaz') ||
      estado.includes('reject') ||
      estado.includes('error')
    ) {
      throw new InvoicingError(
        `Cyberfuel/Hacienda rechazó el comprobante: ${parsed.mensaje || estado}`,
        422,
        false,
        { url, status: response.status, body: response.data },
      )
    }
    return parsed
  } catch (error) {
    throw wrapCyberfuelError('createInvoice/makeXML', url, error)
  }
}

export async function consultarHacienda(clave: string): Promise<unknown> {
  const env = loadInvoicingEnv()
  const url = cyberfuelEndpoint('consultahacienda')
  try {
    const response = await http().post(url, {
      api_key: env.CYBERFUEL_API_KEY,
      frm_ws_ambiente: Buffer.from(env.CYBERFUEL_ENV).toString('base64'),
      clave,
    })
    return response.data
  } catch (error) {
    throw wrapCyberfuelError('consultahacienda', url, error)
  }
}

function wrapCyberfuelError(
  operation: string,
  url: string,
  error: unknown,
): InvoicingError {
  if (error instanceof InvoicingError) {
    return error
  }
  if (error instanceof AxiosError) {
    const status = error.response?.status
    const body = error.response?.data
    const retryable =
      !status || status >= 500 || status === 429 || isHaciendaUnavailable(status, body)
    const message =
      typeof body === 'object' && body && 'mensaje' in body
        ? String((body as { mensaje: unknown }).mensaje)
        : error.message
    console.error('[invoicing] Cyberfuel error', {
      operation,
      url,
      status,
      code: error.code,
      message,
      body,
      retryable,
    })
    return new InvoicingError(
      `Fallo ${operation}: ${message}`,
      status && status >= 400 ? status : 502,
      retryable,
      { url, status, code: error.code, body },
    )
  }
  console.error('[invoicing] Error inesperado en Cyberfuel', { operation, url, error })
  return new InvoicingError(
    `Fallo ${operation}: ${error instanceof Error ? error.message : 'error desconocido'}`,
    500,
    true,
    error,
  )
}
