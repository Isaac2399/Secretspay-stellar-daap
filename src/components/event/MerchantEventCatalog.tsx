import { useEffect, useState } from 'react'
import { ErrorModal } from '@/components/feedback/ErrorModal'
import { fieldClass } from '@/components/auth/AuthLayout'
import { readableError } from '@/lib/auth/readableError'
import {
  createEventProduct,
  deleteEventProduct,
  fetchEventSettings,
  fetchMerchantProducts,
  saveEventSettings,
  updateEventProduct,
} from '@/lib/events/api'
import { formatStockLabel, stockCountClass } from '@/lib/events/stock'
import { stellarConfig } from '@/lib/stellar/config'
import { formatAmount } from '@/lib/stellar/useAccountBalances'
import type { EventProduct, EventProductPromo, EventSettings } from '@/types/event'

type ProductDraft = {
  name: string
  price: string
  stock: string
  asset: string
  pickupLabel: string
  promoLabel: string
  discountPct: string
  buyQty: string
  getQty: string
}

function emptyDraft(pickupLabel: string): ProductDraft {
  return {
    name: '',
    price: '',
    stock: '10',
    asset: stellarConfig.loyalty.code,
    pickupLabel,
    promoLabel: '',
    discountPct: '',
    buyQty: '',
    getQty: '',
  }
}

function draftFromProduct(product: EventProduct): ProductDraft {
  return {
    name: product.name,
    price: product.price,
    stock: String(product.stock),
    asset: product.asset,
    pickupLabel: product.pickupLabel,
    promoLabel: product.promo?.label ?? '',
    discountPct:
      product.promo?.discountPct != null ? String(product.promo.discountPct) : '',
    buyQty: product.promo?.buyQty != null ? String(product.promo.buyQty) : '',
    getQty: product.promo?.getQty != null ? String(product.promo.getQty) : '',
  }
}

function promoFromDraft(draft: ProductDraft): EventProductPromo | null {
  if (!draft.promoLabel.trim()) {
    return null
  }
  return {
    label: draft.promoLabel.trim(),
    discountPct: draft.discountPct ? Number(draft.discountPct) : undefined,
    buyQty: draft.buyQty ? Number(draft.buyQty) : undefined,
    getQty: draft.getQty ? Number(draft.getQty) : undefined,
  }
}

export function MerchantEventCatalog({ merchantId }: { merchantId: string }) {
  const [settings, setSettings] = useState<EventSettings | null>(null)
  const [products, setProducts] = useState<EventProduct[]>([])
  const [title, setTitle] = useState('')
  const [pickupLabel, setPickupLabel] = useState('Barra')
  const [createDraft, setCreateDraft] = useState(() => emptyDraft('Barra'))
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<ProductDraft | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function reload() {
    const [settingsResult, productsResult] = await Promise.all([
      fetchEventSettings(),
      fetchMerchantProducts(),
    ])
    setSettings(settingsResult.settings)
    setTitle(settingsResult.settings.title)
    setPickupLabel(settingsResult.settings.pickupLabel)
    setProducts(productsResult.products)
  }

  useEffect(() => {
    let cancelled = false
    void reload().catch((err) => {
      if (!cancelled) {
        setError(readableError(err))
      }
    })
    const id = window.setInterval(() => {
      void fetchMerchantProducts()
        .then((result) => {
          if (!cancelled) {
            setProducts(result.products)
          }
        })
        .catch(() => undefined)
    }, 4000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [])

  async function saveSettings() {
    setBusy(true)
    setError(null)
    try {
      const result = await saveEventSettings({ title, pickupLabel })
      setSettings(result.settings)
      setCreateDraft((prev) => ({ ...prev, pickupLabel }))
      setMessage('Evento actualizado')
    } catch (err) {
      setError(readableError(err))
    } finally {
      setBusy(false)
    }
  }

  async function addProduct() {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      await createEventProduct({
        name: createDraft.name,
        price: createDraft.price,
        stock: Number(createDraft.stock),
        asset: createDraft.asset,
        pickupLabel: createDraft.pickupLabel || pickupLabel,
        promo: promoFromDraft(createDraft),
      })
      setCreateDraft(emptyDraft(pickupLabel))
      setMessage('Producto añadido')
      await reload()
    } catch (err) {
      setError(readableError(err))
    } finally {
      setBusy(false)
    }
  }

  async function saveEdit() {
    if (!editingId || !editDraft) {
      return
    }
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      await updateEventProduct({
        id: editingId,
        name: editDraft.name,
        price: editDraft.price,
        stock: Number(editDraft.stock),
        asset: editDraft.asset,
        pickupLabel: editDraft.pickupLabel || pickupLabel,
        promo: promoFromDraft(editDraft),
      })
      setEditingId(null)
      setEditDraft(null)
      setMessage('Producto actualizado')
      await reload()
    } catch (err) {
      setError(readableError(err))
    } finally {
      setBusy(false)
    }
  }

  const displayUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/event/display/${merchantId}`
      : `/event/display/${merchantId}`

  return (
    <div className="space-y-5">
      <section className="space-y-3 rounded-[24px] bg-app-card p-4">
        <h2 className="text-[17px] font-semibold">Evento / barra</h2>
        <label className="grid gap-1 text-sm">
          Nombre
          <input className={fieldClass} value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="grid gap-1 text-sm">
          Punto de retiro
          <input
            className={fieldClass}
            value={pickupLabel}
            onChange={(e) => setPickupLabel(e.target.value)}
            placeholder="Barra A"
          />
        </label>
        <button
          type="button"
          className="w-full rounded-2xl bg-app-accent py-2.5 text-sm font-medium disabled:opacity-60"
          disabled={busy}
          onClick={() => void saveSettings()}
        >
          Guardar evento
        </button>
        <p className="break-all text-xs text-app-muted">
          Pantalla de barra: {displayUrl}
        </p>
        {settings ? (
          <a
            className="block rounded-2xl bg-app-chip py-2.5 text-center text-sm"
            href={displayUrl}
            target="_blank"
            rel="noreferrer"
          >
            Abrir pantalla de TV
          </a>
        ) : null}
      </section>

      <section className="space-y-3 rounded-[24px] bg-app-card p-4">
        <h2 className="text-[17px] font-semibold">Añadir producto</h2>
        <ProductFields draft={createDraft} onChange={setCreateDraft} />
        <button
          type="button"
          className="w-full rounded-2xl bg-app-accent py-2.5 text-sm font-medium disabled:opacity-60"
          disabled={busy}
          onClick={() => void addProduct()}
        >
          Añadir a la carta
        </button>
      </section>

      <section className="space-y-3">
        <h2 className="text-[17px] font-semibold">Carta</h2>
        {products.map((product) => {
          const editing = editingId === product.id && editDraft
          return (
            <article key={product.id} className="space-y-3 rounded-[24px] bg-app-card p-4">
              {editing ? (
                <>
                  <ProductFields draft={editDraft} onChange={setEditDraft} />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="flex-1 rounded-xl bg-app-chip py-2 text-xs"
                      onClick={() => {
                        setEditingId(null)
                        setEditDraft(null)
                      }}
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      className="flex-1 rounded-xl bg-app-accent py-2 text-xs font-medium disabled:opacity-60"
                      disabled={busy}
                      onClick={() => void saveEdit()}
                    >
                      Guardar cambios
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-medium">{product.name}</h3>
                      <p className="text-sm text-white/80">
                        {formatAmount(product.price)} {product.asset}
                      </p>
                      {product.promo ? (
                        <p className="text-xs text-app-accent">{product.promo.label}</p>
                      ) : null}
                      <p className={`mt-1 text-sm ${stockCountClass(product.stock)}`}>
                        {formatStockLabel(product.stock)}
                      </p>
                    </div>
                    <span
                      className={`text-xs ${product.active ? 'text-app-accent' : 'text-app-muted'}`}
                    >
                      {product.active ? 'Visible' : 'Oculto'}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      className="rounded-xl bg-app-chip py-2 text-xs"
                      onClick={() => {
                        setEditingId(product.id)
                        setEditDraft(draftFromProduct(product))
                      }}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className="rounded-xl bg-app-chip py-2 text-xs"
                      onClick={() =>
                        void updateEventProduct({ id: product.id, active: !product.active })
                          .then(() => reload())
                          .catch((err) => setError(readableError(err)))
                      }
                    >
                      {product.active ? 'Ocultar' : 'Mostrar'}
                    </button>
                    <button
                      type="button"
                      className="rounded-xl bg-app-chip py-2 text-xs text-red-300"
                      onClick={() =>
                        void deleteEventProduct(product.id)
                          .then(() => {
                            if (editingId === product.id) {
                              setEditingId(null)
                              setEditDraft(null)
                            }
                            return reload()
                          })
                          .catch((err) => setError(readableError(err)))
                      }
                    >
                      Borrar
                    </button>
                  </div>
                </>
              )}
            </article>
          )
        })}
      </section>

      {message ? <p className="text-sm text-app-accent">{message}</p> : null}
      {error ? <ErrorModal message={error} onClose={() => setError(null)} /> : null}
    </div>
  )
}

function ProductFields({
  draft,
  onChange,
}: {
  draft: ProductDraft
  onChange: (next: ProductDraft) => void
}) {
  function patch(partial: Partial<ProductDraft>) {
    onChange({ ...draft, ...partial })
  }

  return (
    <div className="space-y-3">
      <label className="grid gap-1 text-sm">
        Nombre
        <input
          className={fieldClass}
          value={draft.name}
          onChange={(e) => patch({ name: e.target.value })}
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="grid gap-1 text-sm">
          Precio
          <input
            className={fieldClass}
            inputMode="decimal"
            value={draft.price}
            onChange={(e) => patch({ price: e.target.value })}
          />
        </label>
        <label className="grid gap-1 text-sm">
          Cantidad
          <input
            className={fieldClass}
            inputMode="numeric"
            value={draft.stock}
            onChange={(e) => patch({ stock: e.target.value })}
          />
        </label>
      </div>
      <label className="grid gap-1 text-sm">
        Asset
        <select
          className={fieldClass}
          value={draft.asset}
          onChange={(e) => patch({ asset: e.target.value })}
        >
          <option value={stellarConfig.loyalty.code}>{stellarConfig.loyalty.code}</option>
          <option value="USDC">USDC</option>
          <option value="XLM">XLM</option>
        </select>
      </label>
      <label className="grid gap-1 text-sm">
        Punto de retiro
        <input
          className={fieldClass}
          value={draft.pickupLabel}
          onChange={(e) => patch({ pickupLabel: e.target.value })}
          placeholder="Barra A"
        />
      </label>
      <label className="grid gap-1 text-sm">
        Promo (opcional)
        <input
          className={fieldClass}
          value={draft.promoLabel}
          onChange={(e) => patch({ promoLabel: e.target.value })}
          placeholder="2x1, happy hour…"
        />
      </label>
      <div className="grid grid-cols-3 gap-2">
        <input
          className={fieldClass}
          inputMode="decimal"
          value={draft.discountPct}
          onChange={(e) => patch({ discountPct: e.target.value })}
          placeholder="% desc."
        />
        <input
          className={fieldClass}
          inputMode="numeric"
          value={draft.buyQty}
          onChange={(e) => patch({ buyQty: e.target.value })}
          placeholder="Paga"
        />
        <input
          className={fieldClass}
          inputMode="numeric"
          value={draft.getQty}
          onChange={(e) => patch({ getQty: e.target.value })}
          placeholder="Gratis"
        />
      </div>
    </div>
  )
}
