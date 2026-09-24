import { useEffect, useMemo, useRef, useState } from 'react'
import { ErrorModal } from '@/components/feedback/ErrorModal'
import { MapPin, Navigation, Search, SlidersHorizontal } from 'lucide-react'
import { DarkLeafletMap } from '@/components/map/DarkLeafletMap'
import { fetchPublicPlaces } from '@/lib/places/api'
import { readableError } from '@/lib/auth/readableError'
import {
  BUSINESS_CATEGORIES,
  categoryLabel,
  placeCategory,
  type BusinessCategory,
} from '@/lib/places/categories'
import { PlacePromoDetails } from '@/components/map/PlacePromoDetails'
import {
  placeMatchesAnyOffer,
  placeMatchesOffer,
  placeOfferFilters,
  type PlaceOfferFilter,
} from '@/lib/places/promos'
import { stellarConfig } from '@/lib/stellar/config'
import type { PublicPlace } from '@/types/user'

export function CustomerPlacesMap() {
  const [places, setPlaces] = useState<PublicPlace[]>([])
  const [query, setQuery] = useState('')
  const [categories, setCategories] = useState<BusinessCategory[]>([])
  const [offers, setOffers] = useState<PlaceOfferFilter[]>([])
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const filtersRef = useRef<HTMLDivElement>(null)
  const loyaltyCode = stellarConfig.loyalty.code
  const offerFilters = placeOfferFilters(loyaltyCode)

  useEffect(() => {
    let cancelled = false
    void fetchPublicPlaces()
      .then((next) => {
        if (cancelled) {
          return
        }
        setPlaces(next)
        setSelectedId(next[0]?.id ?? null)
        setError(null)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(readableError(err))
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return places.filter((place) => {
      const matchesName =
        !needle ||
        place.name.toLowerCase().includes(needle) ||
        place.address.toLowerCase().includes(needle)
      const matchesCategory =
        categories.length === 0 ||
        categories.includes(placeCategory(place.category))
      return (
        matchesName &&
        matchesCategory &&
        placeMatchesAnyOffer(place, offers)
      )
    })
  }, [places, query, categories, offers])

  const visibleOfferFilters = useMemo(
    () =>
      offerFilters.filter((item) =>
        places.some((place) => placeMatchesOffer(place, item.id)),
      ),
    [offerFilters, places],
  )

  useEffect(() => {
    if (!filtersOpen) {
      return
    }
    function onPointerDown(event: MouseEvent) {
      if (!filtersRef.current?.contains(event.target as Node)) {
        setFiltersOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [filtersOpen])

  useEffect(() => {
    if (filtered.some((place) => place.id === selectedId)) {
      return
    }
    setSelectedId(filtered[0]?.id ?? null)
  }, [filtered, selectedId])

  const selected = filtered.find((place) => place.id === selectedId) ?? filtered[0]
  const hasAnyPlaces = places.length > 0
  const activeFilterCount = categories.length + offers.length
  const visibleCategories = BUSINESS_CATEGORIES.filter((item) =>
    places.some((place) => placeCategory(place.category) === item.id),
  )

  return (
    <div className="space-y-4">
      {hasAnyPlaces ? (
        <div ref={filtersRef} className="relative space-y-2">
          <div className="flex items-center gap-2">
            <label className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-app-muted" />
              <input
                className="w-full rounded-xl border border-app-line bg-app-chip py-2 pl-9 pr-3 text-sm text-white outline-none placeholder:text-white/35"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar por nombre"
                type="search"
                autoComplete="off"
              />
            </label>
            <button
              type="button"
              aria-expanded={filtersOpen}
              aria-label="Filtros"
              onClick={() => setFiltersOpen((open) => !open)}
              className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                filtersOpen || activeFilterCount > 0
                  ? 'bg-app-accent text-white'
                  : 'bg-app-chip text-white/80'
              }`}
            >
              <SlidersHorizontal className="h-4 w-4" />
              {activeFilterCount > 0 ? (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-black px-1 text-[10px] font-medium text-app-accent">
                  {activeFilterCount}
                </span>
              ) : null}
            </button>
          </div>

          {filtersOpen ? (
            <div className="space-y-3 rounded-2xl bg-app-card p-3">
              <div className="space-y-1.5">
                <p className="text-[11px] font-medium uppercase tracking-wide text-app-muted">
                  Tipo de negocio
                </p>
                <p className="text-[10px] text-app-muted">
                  Marca varios. Tipo y promo se combinan.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  <FilterChip
                    active={categories.length === 0}
                    label="Todos"
                    onClick={() => setCategories([])}
                  />
                  {visibleCategories.map((item) => (
                    <FilterChip
                      key={item.id}
                      active={categories.includes(item.id)}
                      label={item.label}
                      onClick={() =>
                        setCategories((current) => toggleValue(current, item.id))
                      }
                    />
                  ))}
                </div>
              </div>

              {visibleOfferFilters.length > 0 ? (
                <div className="space-y-1.5">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-app-muted">
                    Promo o descuento
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    <FilterChip
                      active={offers.length === 0}
                      label="Todas"
                      onClick={() => setOffers([])}
                    />
                    {visibleOfferFilters.map((item) => (
                      <FilterChip
                        key={item.id}
                        active={offers.includes(item.id)}
                        label={item.chip}
                        onClick={() =>
                          setOffers((current) => toggleValue(current, item.id))
                        }
                      />
                    ))}
                  </div>
                </div>
              ) : null}

              {activeFilterCount > 0 ? (
                <button
                  type="button"
                  className="text-[11px] text-app-muted"
                  onClick={() => {
                    setCategories([])
                    setOffers([])
                  }}
                >
                  Quitar filtros
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-[24px] bg-app-card">
        <div className="h-72">
          <DarkLeafletMap
            markers={filtered.map((place) => ({
              id: place.id,
              lat: place.lat,
              lng: place.lng,
              selected: place.id === selected?.id,
            }))}
            onSelect={setSelectedId}
          />
        </div>
      </div>

      {!hasAnyPlaces && !loading ? (
        <p className="rounded-[24px] bg-app-card px-4 py-5 text-center text-sm text-app-muted">
          Todavía no hay negocios publicados. Cuando una empresa fije su
          dirección, el pin aparece aquí.
        </p>
      ) : null}

      {error ? <ErrorModal message={error} onClose={() => setError(null)} /> : null}

      {hasAnyPlaces && filtered.length === 0 ? (
        <p className="rounded-[24px] bg-app-card px-4 py-5 text-center text-sm text-app-muted">
          No hay negocios con esta búsqueda. Prueba otro nombre o filtro.
        </p>
      ) : null}

      {selected ? (
        <article className="rounded-[24px] bg-app-card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-app-accent">
            {categoryLabel(selected.category)}
          </p>
          <h2 className="mt-1 text-lg font-semibold">{selected.name}</h2>
          <p className="mt-2 flex items-start gap-2 text-sm text-white/80">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-app-accent" />
            {selected.address}
          </p>
          {selected.note ? (
            <p className="mt-2 text-sm text-app-muted">{selected.note}</p>
          ) : null}
          <PlacePromoDetails
            acceptsRojos={selected.acceptsRojos}
            promos={selected.promos}
          />
          <a
            href={mapsUrl(selected.lat, selected.lng, selected.name)}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-app-accent py-3 text-sm font-medium text-white"
          >
            <Navigation className="h-4 w-4" />
            Cómo llegar
          </a>
        </article>
      ) : null}

      {filtered.length > 1 ? (
        <ul className="space-y-2">
          {filtered.map((place) => (
            <li key={place.id}>
              <button
                type="button"
                onClick={() => setSelectedId(place.id)}
                className={`w-full rounded-2xl px-4 py-3 text-left ${
                  place.id === selected?.id ? 'bg-app-card' : 'bg-app-chip'
                }`}
              >
                <p className="text-sm font-medium">{place.name}</p>
                <p className="mt-0.5 text-[11px] text-app-accent">
                  {categoryLabel(place.category)}
                </p>
                <p className="mt-0.5 truncate text-xs text-app-muted">
                  {place.address}
                </p>
                {place.acceptsRojos || (place.promos && place.promos.length > 0) ? (
                  <p className="mt-1 text-[11px] text-white/70">
                    {place.acceptsRojos && place.promos?.length
                      ? `Acepta ${stellarConfig.loyalty.code} y tiene regalos`
                      : place.acceptsRojos
                        ? `Acepta ${stellarConfig.loyalty.code} como descuento`
                        : `Regala ${stellarConfig.loyalty.code}`}
                  </p>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function FilterChip({
  active,
  label,
  onClick,
}: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
        active ? 'bg-app-accent text-white' : 'bg-app-chip text-white/75'
      }`}
    >
      {label}
    </button>
  )
}

function toggleValue<T>(current: T[], value: T): T[] {
  return current.includes(value)
    ? current.filter((item) => item !== value)
    : [...current, value]
}

function mapsUrl(lat: number, lng: number, name: string): string {
  const query = encodeURIComponent(`${name} ${lat},${lng}`)
  return `https://www.google.com/maps/search/?api=1&query=${query}`
}
