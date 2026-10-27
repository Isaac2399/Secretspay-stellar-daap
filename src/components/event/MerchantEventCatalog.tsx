import { useEffect, useState } from 'react'
import { Networks } from '@stellar/stellar-sdk'
import { ErrorModal } from '@/components/feedback/ErrorModal'
import { fieldClass } from '@/components/auth/AuthLayout'
import { readableError } from '@/lib/auth/readableError'
import {
  createAdminEventProduct,
  createEventProduct,
  deleteAdminEventProduct,
  deleteEventProduct,
  fetchAdminEventDetail,
  fetchEventSettings,
  fetchMerchantProducts,
  saveAdminEvent,
  saveEventSettings,
  updateAdminEventProduct,
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

const explorer =
  stellarConfig.networkPassphrase === Networks.PUBLIC ? 'public' : 'testnet'

function expertTx(hash: string): string {
  return `https://stellar.expert/explorer/${explorer}/tx/${hash}`
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

export function MerchantEventCatalog({
  merchantId,
  asAdmin = false,
  merchantEmail,
  onSettingsSaved,
}: {
  merchantId: string
  asAdmin?: boolean
  merchantEmail?: string
  onSettingsSaved?: () => void
}) {
  const [settings, setSettings] = useState<EventSettings | null>(null)
  const [products, setProducts] = useState<EventProduct[]>([])
  const [title, setTitle] = useState('')
  const [pickupLabel, setPickupLabel] = useState('Barra')
  const [active, setActive] = useState(true)
  const [feePercent, setFeePercent] = useState('0')
  const [feeAccount, setFeeAccount] = useState('')
  const [createDraft, setCreateDraft] = useState(() => emptyDraft('Barra'))
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<ProductDraft | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function reload() {
    if (asAdmin) {
      const detail = await fetchAdminEventDetail(merchantId)
      setSettings(detail.settings)
      setTitle(detail.settings.title)
      setPickupLabel(detail.settings.pickupLabel)
      setActive(detail.settings.active !== false)
      setFeePercent(feePercentFromBps(detail.settings.feeBps))
      setFeeAccount(detail.settings.feeAccount ?? '')
      setProducts(detail.products)
      return
    }
    const [settingsResult, productsResult] = await Promise.all([
      fetchEventSettings(),
      fetchMerchantProducts(),
    ])
    setSettings(settingsResult.settings)
    setTitle(settingsResult.settings.title)
    setPickupLabel(settingsResult.settings.pickupLabel)
    setActive(settingsResult.settings.active !== false)
    setFeePercent(feePercentFromBps(settingsResult.settings.feeBps))
    setFeeAccount(settingsResult.settings.feeAccount ?? '')
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
      if (asAdmin) {
        void fetchAdminEventDetail(merchantId)
          .then((detail) => {
            if (!cancelled) {
              setProducts(detail.products)
            }
          })
          .catch(() => undefined)
        return
      }
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
  }, [merchantId, asAdmin])

  async function saveSettings() {
    setBusy(true)
    setError(null)
    try {
      const result = asAdmin
        ? await saveAdminEvent({
            merchantId,
            title,
            pickupLabel,
            active,
            feePercent,
            feeAccount,
          })
        : await saveEventSettings({
            title,
            pickupLabel,
            active,
            feePercent,
            feeAccount,
          })
      setSettings(result.settings)
      setActive(result.settings.active !== false)
      setCreateDraft((prev) => ({ ...prev, pickupLabel }))
      setMessage(
        result.settings.active !== false
          ? 'Evento activo y visible para clientes'
          : 'Evento inactivo: oculto para clientes',
      )
      onSettingsSaved?.()
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
      const payload = {
        name: createDraft.name,
        price: createDraft.price,
        stock: Number(createDraft.stock),
        asset: createDraft.asset,
        pickupLabel: createDraft.pickupLabel || pickupLabel,
        promo: promoFromDraft(createDraft),
      }
      if (asAdmin) {
        await createAdminEventProduct(merchantId, payload)
      } else {
        await createEventProduct(payload)
      }
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
      const payload = {
        id: editingId,
        name: editDraft.name,
        price: editDraft.price,
        stock: Number(editDraft.stock),
        asset: editDraft.asset,
        pickupLabel: editDraft.pickupLabel || pickupLabel,
        promo: promoFromDraft(editDraft),
      }
      if (asAdmin) {
        await updateAdminEventProduct(merchantId, payload)
      } else {
        await updateEventProduct(payload)
      }
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

  async function toggleProductActive(product: EventProduct) {
    try {
      if (asAdmin) {
        await updateAdminEventProduct(merchantId, {
          id: product.id,
          active: !product.active,
        })
      } else {
        await updateEventProduct({ id: product.id, active: !product.active })
      }
      await reload()
    } catch (err) {
      setError(readableError(err))
    }
  }

  async function removeProduct(productId: string) {
    try {
      if (asAdmin) {
        await deleteAdminEventProduct(merchantId, productId)
      } else {
        await deleteEventProduct(productId)
      }
      if (editingId === productId) {
        setEditingId(null)
        setEditDraft(null)
      }
      await reload()
    } catch (err) {
      setError(readableError(err))
    }
  }

  const displayUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/event/display/${merchantId}`
      : `/event/display/${merchantId}`

  return (
    <div className="space-y-5">
      <section className="space-y-3 rounded-[24px] bg-app-card p-4">
        <h2 className="text-[17px] font-semibold">
          {asAdmin ? 'Editar evento' : 'Evento / barra'}
        </h2>
        {asAdmin && merchantEmail ? (
          <p className="text-xs text-app-muted">{merchantEmail}</p>
        ) : null}
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
        <label className="flex items-center justify-between gap-3 rounded-2xl bg-app-chip px-3 py-3 text-sm">
          <span>
            Visible para clientes
            <span className="mt-0.5 block text-xs text-app-muted">
              {active ? 'Activo en la app' : 'Oculto / inactivo'}
            </span>
          </span>
          <input
            type="checkbox"
            className="h-5 w-5 accent-[var(--app-accent,#e11d48)]"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />
        </label>
        <label className="grid gap-1 text-sm">
          Comisión por compra (%)
          <input
            className={fieldClass}
            inputMode="decimal"
            value={feePercent}
            onChange={(e) => setFeePercent(e.target.value)}
            placeholder="2.5"
          />
        </label>
        <label className="grid gap-1 text-sm">
          Cuenta que recibe la comisión
          <input
            className={fieldClass}
            value={feeAccount}
            onChange={(e) => setFeeAccount(e.target.value)}
            placeholder="G…"
            spellCheck={false}
          />
        </label>
        <p className="text-xs text-app-muted">
          Al guardar, la comisión queda en el contrato. Cada compra entra a ese
          contrato y se reparte ahí: este porcentaje a la cuenta de abajo y el
          resto a la empresa. La cuenta tiene que tener trustline del token.
        </p>
        {settings?.chainHash ? (
          <a
            className="text-xs text-app-accent underline"
            href={expertTx(settings.chainHash)}
            target="_blank"
            rel="noreferrer"
          >
            Ver el evento en Stellar Expert
          </a>
        ) : null}
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
                      {product.chainHash ? (
                        <a
                          className="mt-1 inline-block text-xs text-app-accent underline"
                          href={expertTx(product.chainHash)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Ver en Stellar Expert
                        </a>
                      ) : null}
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
                      onClick={() => void toggleProductActive(product)}
                    >
                      {product.active ? 'Ocultar' : 'Mostrar'}
                    </button>
                    <button
                      type="button"
                      className="rounded-xl bg-app-chip py-2 text-xs text-red-300"
                      onClick={() => void removeProduct(product.id)}
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

function feePercentFromBps(feeBps: number | undefined): string {
  const percent = (feeBps ?? 0) / 100
  return Number.isInteger(percent) ? String(percent) : String(percent)
}
