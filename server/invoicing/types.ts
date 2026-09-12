/**
 * Contratos del middleware de facturación electrónica (Cyberfuel / DGT).
 *
 * La documentación pública de ComprobantesElectronicosCR.com documenta
 * MakeXML sobre la estructura DGT 4.2 (`makeXML.stag.42`). El JSON 4.3/4.4
 * añade CAByS, IVA por línea y medio de pago. Este módulo tipa ambos mundos:
 * los campos documentados + las extensiones que Hacienda exige hoy.
 *
 * Códigos oficiales (Anexo 2 DGT):
 * - tipo de comprobante: 01 FE, 02 NC, 03 ND, 04 Tiquete, 08 FEE, 09 FEC
 * - identificación: 01 Física, 02 Jurídica, 03 DIMEX, 04 NITE, 05 Extranjero
 * - condición venta: 01 Contado, 02 Crédito, 03 Consignación, 04 Aparte, 05 Apartado, 06 Otros
 * - medio pago: 01 Efectivo, 02 Tarjeta, 03 Cheque, 04 Transferencia, 05 Recaudado terceros, 06 SINPE Móvil, 99 Otros
 * - IVA codigo: 01 ; codigo_tarifa 08 = 13 % general
 */

export const HaciendaDocType = {
  FacturaElectronica: '01',
  NotaCredito: '02',
  NotaDebito: '03',
  TiqueteElectronico: '04',
  FacturaCompra: '08',
  FacturaExportacion: '09',
} as const

export const IdType = {
  CedulaFisica: '01',
  CedulaJuridica: '02',
  Dimex: '03',
  Nite: '04',
  ExtranjeroNoDomiciliado: '05',
} as const

export const SaleCondition = {
  Contado: '01',
  Credito: '02',
} as const

/** 99 = Otros: el cobro on-chain no encaja en efectivo/tarjeta/SINPE. */
export const PaymentMethod = {
  Efectivo: '01',
  Tarjeta: '02',
  Transferencia: '04',
  SinpeMovil: '06',
  Otros: '99',
} as const

export const IvaTarifa = {
  Exento: { codigoTarifa: '01', tarifa: 0 },
  Reducida1: { codigoTarifa: '02', tarifa: 1 },
  Reducida2: { codigoTarifa: '03', tarifa: 2 },
  Reducida4: { codigoTarifa: '04', tarifa: 4 },
  General13: { codigoTarifa: '08', tarifa: 13 },
} as const

export type HaciendaDocTypeCode =
  (typeof HaciendaDocType)[keyof typeof HaciendaDocType]
export type IdTypeCode = (typeof IdType)[keyof typeof IdType]
export type PaymentMethodCode =
  (typeof PaymentMethod)[keyof typeof PaymentMethod]

export type CustomerInfo = {
  nombre: string
  /** 01 física / 02 jurídica / 03 DIMEX / 04 NITE / 05 extranjero. */
  tipoIdentificacion?: IdTypeCode
  numeroIdentificacion?: string
  nombreComercial?: string
  correo?: string
  telefono?: string
  ubicacion?: {
    provincia?: string
    canton?: string
    distrito?: string
    barrio?: string
    sennas?: string
  }
}

/**
 * Evento de pago completado (webhook o stream de Horizon).
 * `amountUSD` es el equivalente en dólares del cobro on-chain (USDC ≈ 1:1).
 */
export type PaymentCompletedEvent = {
  txHash: string
  walletAddress: string
  amountUSD: number
  customerInfo: CustomerInfo
  cabysCode: string
  description?: string
  /** IVA % (por defecto 13). Debe coincidir con el CAByS. */
  taxRate?: number
  /**
   * Si es true (default) el monto cobrado ya incluye IVA y se desglosa.
   * Si es false, el monto es neto y se suma el IVA (el total de factura
   * será mayor que el pago on-chain — úsalo solo si el cobro es neto).
   */
  taxIncluded?: boolean
  assetCode?: string
  network?: string
}

export type ExchangeRateQuote = {
  monedaOrigen: 'USD'
  monedaDestino: 'CRC'
  /** Tipo de cambio de venta BCCR / Hacienda (CRC por 1 USD). */
  venta: number
  compra?: number
  fecha: string
  fuente: string
}

export type InvoiceMoney = {
  amountUSD: number
  amountCRC: number
  tipoCambio: number
  tipoCambioFecha: string
  netoCRC: number
  ivaCRC: number
  totalCRC: number
  taxRate: number
  codigoTarifa: string
}

export type InvoiceStatus =
  | 'pending'
  | 'submitted'
  | 'accepted'
  | 'rejected'
  | 'failed'

export type InvoiceRecord = {
  txHash: string
  walletAddress: string
  amountUSD: number
  amountCRC: number
  tipoCambio: number
  tipoCambioFecha: string
  cabysCode: string
  description: string
  customerInfo: CustomerInfo
  taxRate: number
  taxIncluded: boolean
  assetCode?: string
  network?: string
  status: InvoiceStatus
  retryable: boolean
  consecutivo: number
  clave?: string
  cyberfuelResponse?: unknown
  lastError?: {
    message: string
    status?: number
    body?: unknown
    at: string
  }
  createdAt: string
  updatedAt: string
}

/** Ubicación del emisor según catálogo de Hacienda (provincia/cantón/distrito). */
export type CyberfuelUbicacion = {
  provincia: string
  canton: string
  distrito: string
  barrio?: string
  sennas: string
}

export type CyberfuelTelefono = {
  cod_pais: string
  numero: string
}

export type CyberfuelIdentificacion = {
  tipo: IdTypeCode
  numero: string
}

export type CyberfuelLineTax = {
  /** 01 = Impuesto al Valor Agregado. */
  codigo: '01'
  codigo_tarifa: string
  tarifa: string
  monto: string
}

export type CyberfuelDetalleLinea = {
  numero: string
  /** CAByS de 13 dígitos (obligatorio desde estructura 4.3). */
  codigo_cabys: string
  codigo: { tipo: string; codigo: string }[]
  cantidad: string
  unidad_medida: string
  unidad_medida_comercial: string
  detalle: string
  precio_unitario: string
  monto_total: string
  descuento: string
  naturaleza_descuento: string
  subtotal: string
  impuesto: CyberfuelLineTax[]
  montototallinea: string
}

/**
 * Payload MakeXML documentado por Cyberfuel (api_key va en el body).
 * https://www.comprobanteselectronicoscr.com/doc-api.html
 */
export type CyberfuelMakeXmlPayload = {
  api_key: string
  clave: {
    sucursal: string
    terminal: string
    tipo: HaciendaDocTypeCode
    comprobante: string
    pais: string
    dia: string
    mes: string
    anno: string
    situacion_presentacion: string
    codigo_seguridad: string
  }
  encabezado: {
    fecha: string
    condicion_venta: string
    plazo_credito: string
    medio_pago?: PaymentMethodCode[]
  }
  emisor: {
    nombre: string
    identificacion: CyberfuelIdentificacion
    nombre_comercial: string
    ubicacion: CyberfuelUbicacion
    telefono: CyberfuelTelefono
    fax?: CyberfuelTelefono
    correo_electronico: string
  }
  receptor: {
    nombre: string
    identificacion?: CyberfuelIdentificacion
    nombre_comercial?: string
    correo_electronico?: string
    telefono?: CyberfuelTelefono
    ubicacion?: CyberfuelUbicacion
  }
  detalle: CyberfuelDetalleLinea[]
  resumen: {
    moneda: 'CRC' | 'USD'
    tipo_cambio: string
    totalserviciogravado: string
    totalservicioexento: string
    totalmercaderiagravado: string
    totalmercaderiaexento: string
    totalgravado: string
    totalexento: string
    totalventa: string
    totaldescuentos: string
    totalventaneta: string
    totalimpuestos: string
    totalcomprobante: string
  }
  otros: { codigo: string; texto: string; contenido: string }[]
  envio: {
    aplica: string
    emisor: { correo: string }
    receptor: { correo: string }
  }
}

export type CyberfuelMakeXmlResponse = {
  raw: unknown
  clave?: string
  consecutivo?: string
  estado?: string
  mensaje?: string
}

export class InvoicingError extends Error {
  status: number
  retryable: boolean
  details?: unknown

  constructor(
    message: string,
    status = 500,
    retryable = false,
    details?: unknown,
  ) {
    super(message)
    this.name = 'InvoicingError'
    this.status = status
    this.retryable = retryable
    this.details = details
  }
}
