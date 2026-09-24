import { useEffect, useState } from 'react'
import { ErrorModal } from '@/components/feedback/ErrorModal'
import { MapPin, Search } from 'lucide-react'
import { fieldClass } from '@/components/auth/AuthLayout'
import {
  DarkLeafletMap,
  DEFAULT_MAP_CENTER,
} from '@/components/map/DarkLeafletMap'
import {
  deleteBusinessPlace,
  reversePlace,
  saveBusinessPlace,
  searchPlaceQuery,
  type GeocodeHit,
} from '@/lib/places/api'
import { readableError } from '@/lib/auth/readableError'
import type { AppUser, BusinessPlace, PlacePromo } from '@/types/user'
import {
  BUSINESS_CATEGORIES,
  isBusinessCategory,
} from '@/lib/places/categories'
import { promoByKind } from '@/lib/places/promos'
import { stellarConfig } from '@/lib/stellar/config'

export function MerchantPlaceEditor({
  user,
  onSaved,
}: {
  user: AppUser
  onSaved: (next: AppUser) => void
}) {
  const saved = user.place
  const savedStory = promoByKind(saved?.promos, 'story')
  const savedPurchase = promoByKind(saved?.promos, 'purchase')
  const savedUsdc = promoByKind(saved?.promos, 'usdc')
  const loyaltyCode = stellarConfig.loyalty.code
  const [name, setName] = useState(saved?.name ?? '')
  const [address, setAddress] = useState(saved?.address ?? '')
  const [note, setNote] = useState(saved?.note ?? '')
  const [category, setCategory] = useState(saved?.category ?? 'restaurant')
  const [acceptsRojos, setAcceptsRojos] = useState(Boolean(saved?.acceptsRojos))
  const [storyOn, setStoryOn] = useState(Boolean(savedStory))
  const [storyRojos, setStoryRojos] = useState(savedStory?.rojos ?? '')
  const [purchaseOn, setPurchaseOn] = useState(Boolean(savedPurchase))
  const [purchaseSpend, setPurchaseSpend] = useState(
    savedPurchase?.kind === 'purchase' ? savedPurchase.spend : '',
  )
  const [purchaseRojos, setPurchaseRojos] = useState(savedPurchase?.rojos ?? '')
  const [usdcOn, setUsdcOn] = useState(Boolean(savedUsdc))
  const [usdcRojos, setUsdcRojos] = useState(savedUsdc?.rojos ?? '')
  const [lat, setLat] = useState(saved?.lat ?? DEFAULT_MAP_CENTER[0])
  const [lng, setLng] = useState(saved?.lng ?? DEFAULT_MAP_CENTER[1])
  const [pinned, setPinned] = useState(Boolean(saved))
  const [hits, setHits] = useState<GeocodeHit[]>([])
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const q = query.trim()
    if (q.length < 3) {
      setHits([])
      return
    }
    const id = window.setTimeout(() => {
      void searchPlaceQuery(q)
        .then(setHits)
        .catch(() => setHits([]))
    }, 420)
    return () => window.clearTimeout(id)
  }, [query])

  function applyHit(hit: GeocodeHit) {
    setAddress(hit.label)
    setQuery('')
    setHits([])
    setLat(hit.lat)
    setLng(hit.lng)
    setPinned(true)
  }

  async function onMapClick(nextLat: number, nextLng: number) {
    setLat(nextLat)
    setLng(nextLng)
    setPinned(true)
    try {
      const reversed = await reversePlace(nextLat, nextLng)
      setAddress(reversed.address)
    } catch {
      setAddress(`${nextLat.toFixed(5)}, ${nextLng.toFixed(5)}`)
    }
  }

  async function onSave() {
    setSaving(true)
    setError(null)
    setStatus(null)
    const promos = collectPromos({
      storyOn,
      storyRojos,
      purchaseOn,
      purchaseSpend,
      purchaseRojos,
      usdcOn,
      usdcRojos,
    })
    const place: BusinessPlace = {
      name: name.trim(),
      address: address.trim(),
      lat,
      lng,
      category,
      note: note.trim() || undefined,
      acceptsRojos: acceptsRojos || undefined,
      promos: promos.length ? promos : undefined,
    }
    try {
      onSaved(await saveBusinessPlace(place))
      setStatus('Local publicado. Los clientes ya pueden verlo en el mapa.')
      setPinned(true)
    } catch (err) {
      setError(readableError(err))
    } finally {
      setSaving(false)
    }
  }

  async function onRemove() {
    setSaving(true)
    setError(null)
    try {
      onSaved(await deleteBusinessPlace())
      setPinned(false)
      setStatus('Quitamos tu local del mapa.')
    } catch (err) {
      setError(readableError(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-[24px] bg-app-card">
        <div className="h-72">
          <DarkLeafletMap
            markers={
              pinned
                ? [{ id: 'mine', lat, lng, selected: true }]
                : []
            }
            center={[lat, lng]}
            zoom={pinned ? 15 : 13}
            onMapClick={(nextLat, nextLng) => void onMapClick(nextLat, nextLng)}
          />
        </div>
        <p className="px-4 py-3 text-xs text-app-muted">
          Toca el mapa para dejar el pin, o busca la dirección abajo.
        </p>
      </div>

      <div className="space-y-3 rounded-[24px] bg-app-card p-4">
        <label className="grid gap-1.5 text-sm font-medium text-white/80">
          Nombre del negocio
          <input
            className={fieldClass}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Café Estrella"
          />
        </label>

        <label className="grid gap-1.5 text-sm font-medium text-white/80">
          Tipo de negocio
          <select
            className={fieldClass}
            value={isBusinessCategory(category) ? category : 'other'}
            onChange={(event) => setCategory(event.target.value)}
          >
            {BUSINESS_CATEGORIES.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-1.5 text-sm font-medium text-white/80">
          Buscar dirección
          <span className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-app-muted" />
            <input
              className={`${fieldClass} pl-10`}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Calle, barrio, ciudad"
            />
          </span>
        </label>

        {hits.length > 0 ? (
          <ul className="overflow-hidden rounded-2xl bg-app-chip">
            {hits.map((hit) => (
              <li key={`${hit.lat}-${hit.lng}-${hit.label}`}>
                <button
                  type="button"
                  className="flex w-full items-start gap-2 px-3 py-2.5 text-left text-sm hover:bg-white/5"
                  onClick={() => applyHit(hit)}
                >
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-app-accent" />
                  <span className="text-white/85">{hit.label}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        <label className="grid gap-1.5 text-sm font-medium text-white/80">
          Dirección publicada
          <textarea
            className={`${fieldClass} min-h-20`}
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            placeholder="Se completa al buscar o al tocar el mapa"
          />
        </label>

        <label className="grid gap-1.5 text-sm font-medium text-white/80">
          Nota (opcional)
          <input
            className={fieldClass}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Horario, piso, cómo entrar…"
            maxLength={140}
          />
        </label>

        <div className="space-y-3 rounded-2xl bg-app-chip p-3">
          <p className="text-sm font-medium text-white/80">Promos con {loyaltyCode}</p>
          <p className="text-xs font-normal text-app-muted">
            Los clientes ven esto en la ficha del mapa. Activa solo lo que
            ofrezcas.
          </p>

          <label className="flex items-start gap-3 text-sm text-white/85">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 accent-app-accent"
              checked={acceptsRojos}
              onChange={(event) => setAcceptsRojos(event.target.checked)}
            />
            <span>Aceptamos {loyaltyCode} como descuento</span>
          </label>

          <div className="flex items-start gap-3 text-sm text-white/85">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 shrink-0 accent-app-accent"
              checked={storyOn}
              onChange={(event) => setStoryOn(event.target.checked)}
            />
            <div className="grid min-w-0 flex-1 gap-1.5">
              <span>Por subir historia te regalamos</span>
              <input
                className={fieldClass}
                inputMode="decimal"
                disabled={!storyOn}
                value={storyRojos}
                onChange={(event) => setStoryRojos(event.target.value)}
                placeholder={`Cantidad de ${loyaltyCode}`}
              />
            </div>
          </div>

          <div className="flex items-start gap-3 text-sm text-white/85">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 shrink-0 accent-app-accent"
              checked={purchaseOn}
              onChange={(event) => setPurchaseOn(event.target.checked)}
            />
            <div className="grid min-w-0 flex-1 gap-1.5">
              <span>Por compra de</span>
              <input
                className={fieldClass}
                inputMode="decimal"
                disabled={!purchaseOn}
                value={purchaseSpend}
                onChange={(event) => setPurchaseSpend(event.target.value)}
                placeholder="Monto en USDC"
              />
              <span>te regalamos</span>
              <input
                className={fieldClass}
                inputMode="decimal"
                disabled={!purchaseOn}
                value={purchaseRojos}
                onChange={(event) => setPurchaseRojos(event.target.value)}
                placeholder={`Cantidad de ${loyaltyCode}`}
              />
            </div>
          </div>

          <div className="flex items-start gap-3 text-sm text-white/85">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 shrink-0 accent-app-accent"
              checked={usdcOn}
              onChange={(event) => setUsdcOn(event.target.checked)}
            />
            <div className="grid min-w-0 flex-1 gap-1.5">
              <span>Si pagas con USDC te damos</span>
              <input
                className={fieldClass}
                inputMode="decimal"
                disabled={!usdcOn}
                value={usdcRojos}
                onChange={(event) => setUsdcRojos(event.target.value)}
                placeholder={`Cantidad de ${loyaltyCode}`}
              />
            </div>
          </div>
        </div>

        {error ? <ErrorModal message={error} onClose={() => setError(null)} /> : null}
        {status ? <p className="text-sm text-green-400">{status}</p> : null}

        <button
          type="button"
          onClick={() => void onSave()}
          disabled={saving}
          className="w-full rounded-2xl bg-app-accent py-3 text-sm font-medium text-white disabled:opacity-60"
        >
          {saving ? 'Guardando…' : 'Publicar en el mapa'}
        </button>
        {saved ? (
          <button
            type="button"
            onClick={() => void onRemove()}
            disabled={saving}
            className="w-full rounded-2xl bg-app-chip py-3 text-sm text-white/70"
          >
            Quitar del mapa
          </button>
        ) : null}
      </div>
    </div>
  )
}

function collectPromos(input: {
  storyOn: boolean
  storyRojos: string
  purchaseOn: boolean
  purchaseSpend: string
  purchaseRojos: string
  usdcOn: boolean
  usdcRojos: string
}): PlacePromo[] {
  const promos: PlacePromo[] = []
  if (input.storyOn) {
    promos.push({ kind: 'story', rojos: input.storyRojos.trim() })
  }
  if (input.purchaseOn) {
    promos.push({
      kind: 'purchase',
      spend: input.purchaseSpend.trim(),
      rojos: input.purchaseRojos.trim(),
    })
  }
  if (input.usdcOn) {
    promos.push({ kind: 'usdc', rojos: input.usdcRojos.trim() })
  }
  return promos
}
