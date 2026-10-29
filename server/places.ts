import { AuthError } from './errors.js'

const PLACE_CATEGORIES = new Set([
  'hotel',
  'restaurant',
  'cafe',
  'bar',
  'supermarket',
  'grocery',
  'bakery',
  'pharmacy',
  'salon',
  'spa',
  'gym',
  'shop',
  'clothing',
  'electronics',
  'gas',
  'clinic',
  'tourism',
  'other',
])

export type PlacePromo =
  | { kind: 'story'; rojos: string }
  | { kind: 'purchase'; spend: string; rojos: string }
  | { kind: 'usdc'; rojos: string }

export type PlaceInput = {
  name: string
  address: string
  lat: number
  lng: number
  category: string
  note?: string
  acceptsRojos?: boolean
  promos?: PlacePromo[]
}

export type GeocodeHit = {
  label: string
  lat: number
  lng: number
}

export function isPlaceCategory(value: string): boolean {
  return PLACE_CATEGORIES.has(value)
}

export function parsePlaceBody(body: Record<string, unknown>): PlaceInput {
  const name = String(body.name ?? '').trim()
  const address = String(body.address ?? '').trim()
  const note = String(body.note ?? '').trim()
  const category = String(body.category ?? '').trim()
  const lat = Number(body.lat)
  const lng = Number(body.lng)

  if (name.length < 2 || name.length > 80) {
    throw new AuthError('El nombre del negocio debe tener entre 2 y 80 caracteres', 400)
  }
  if (address.length < 4 || address.length > 200) {
    throw new AuthError('La dirección no es válida', 400)
  }
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    throw new AuthError('La latitud no es válida', 400)
  }
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
    throw new AuthError('La longitud no es válida', 400)
  }
  if (note.length > 140) {
    throw new AuthError('La nota es demasiado larga', 400)
  }
  if (!PLACE_CATEGORIES.has(category)) {
    throw new AuthError('Elige un tipo de negocio válido', 400)
  }

  const acceptsRojos = Boolean(body.acceptsRojos)
  const promos = parsePromos(body.promos)

  return {
    name,
    address,
    lat,
    lng,
    category,
    note: note || undefined,
    acceptsRojos: acceptsRojos || undefined,
    promos,
  }
}

function parsePromos(raw: unknown): PlacePromo[] | undefined {
  if (raw == null || raw === '') {
    return undefined
  }
  if (!Array.isArray(raw)) {
    throw new AuthError('Las promos no son válidas', 400)
  }
  if (raw.length > 3) {
    throw new AuthError('Puedes publicar como máximo 3 promos de ROJOS', 400)
  }

  const seen = new Set<string>()
  const promos: PlacePromo[] = []

  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') {
      throw new AuthError('Hay una promo inválida', 400)
    }
    const item = entry as Record<string, unknown>
    const kind = String(item.kind ?? '').trim()

    if (kind !== 'story' && kind !== 'purchase' && kind !== 'usdc') {
      throw new AuthError('El tipo de promo no es válido', 400)
    }
    if (seen.has(kind)) {
      throw new AuthError('No puedes repetir el mismo tipo de promo', 400)
    }
    seen.add(kind)

    const rojos = parsePromoAmount(item.rojos, 'La cantidad de ROJOS')
    if (kind === 'purchase') {
      promos.push({
        kind,
        spend: parsePromoAmount(item.spend, 'El monto de compra'),
        rojos,
      })
    } else {
      promos.push({ kind, rojos })
    }
  }

  return promos.length ? promos : undefined
}

function parsePromoAmount(value: unknown, label: string): string {
  const raw = String(value ?? '')
    .trim()
    .replace(',', '.')
  if (!/^\d+(\.\d{1,7})?$/.test(raw) || Number(raw) <= 0 || Number(raw) > 1_000_000) {
    throw new AuthError(`${label} no es válida`, 400)
  }
  const [whole, fraction = ''] = raw.split('.')
  if (!fraction) {
    return whole
  }
  return `${whole}.${fraction.replace(/0+$/, '')}`.replace(/\.$/, '')
}

export async function searchNominatim(query: string): Promise<GeocodeHit[]> {
  const q = query.trim()
  if (q.length < 3) {
    return []
  }
  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('q', q)
  url.searchParams.set('limit', '6')
  url.searchParams.set('addressdetails', '0')

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'StellarPay/1.0 (local wallet map)',
    },
  })
  if (!response.ok) {
    throw new AuthError('No se pudo buscar la dirección', 502)
  }
  const rows = (await response.json()) as Array<{
    display_name?: string
    lat?: string
    lon?: string
  }>
  return rows
    .map((row) => ({
      label: String(row.display_name ?? '').trim(),
      lat: Number(row.lat),
      lng: Number(row.lon),
    }))
    .filter(
      (row) =>
        row.label &&
        Number.isFinite(row.lat) &&
        Number.isFinite(row.lng),
    )
}

export async function reverseNominatim(
  lat: number,
  lng: number,
): Promise<string> {
  const url = new URL('https://nominatim.openstreetmap.org/reverse')
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('lat', String(lat))
  url.searchParams.set('lon', String(lng))

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'StellarPay/1.0 (local wallet map)',
    },
  })
  if (!response.ok) {
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`
  }
  const body = (await response.json()) as { display_name?: string }
  return String(body.display_name ?? '').trim() || `${lat.toFixed(5)}, ${lng.toFixed(5)}`
}
