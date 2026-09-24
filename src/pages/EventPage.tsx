import { useEffect, useState } from 'react'
import { ErrorModal } from '@/components/feedback/ErrorModal'
import { useSearchParams } from 'react-router-dom'
import { CustomerEventMenu } from '@/components/event/CustomerEventMenu'
import { MerchantEventCatalog } from '@/components/event/MerchantEventCatalog'
import { MerchantOrderQueue } from '@/components/event/MerchantOrderQueue'
import { useAuth } from '@/lib/auth/AuthContext'
import { fetchEventVenues, fetchMyEventOrders } from '@/lib/events/api'
import { formatAmount } from '@/lib/stellar/useAccountBalances'
import { readableError } from '@/lib/auth/readableError'
import type { EventOrder, EventVenue } from '@/types/event'

const ORDER_STATUS: Record<EventOrder['status'], string> = {
  preparing: 'En preparación',
  ready: 'Listo para retirar',
  completed: 'Entregado',
  cancelled: 'Cancelado',
}

export default function EventPage() {
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const merchantFromUrl = params.get('merchant') ?? ''
  const [venues, setVenues] = useState<EventVenue[]>([])
  const [orders, setOrders] = useState<EventOrder[]>([])
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<'carta' | 'pedidos'>('carta')

  useEffect(() => {
    if (user?.role !== 'customer') {
      return
    }
    void Promise.all([fetchEventVenues(), fetchMyEventOrders()])
      .then(([venuesResult, ordersResult]) => {
        setVenues(venuesResult.venues)
        setOrders(ordersResult.orders)
      })
      .catch((err) => setError(readableError(err)))
  }, [user?.role])

  if (!user) {
    return null
  }

  if (user.role === 'merchant' && user.id) {
    return (
      <div className="space-y-5">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-app-accent">
            Empresa
          </p>
          <h1 className="mt-1 text-xl font-semibold">Barra del evento</h1>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className={`rounded-2xl py-2.5 text-sm ${
              tab === 'carta' ? 'bg-app-accent' : 'bg-app-chip'
            }`}
            onClick={() => setTab('carta')}
          >
            Productos
          </button>
          <button
            type="button"
            className={`rounded-2xl py-2.5 text-sm ${
              tab === 'pedidos' ? 'bg-app-accent' : 'bg-app-chip'
            }`}
            onClick={() => setTab('pedidos')}
          >
            Pedidos
          </button>
        </div>
        {tab === 'carta' ? (
          <MerchantEventCatalog merchantId={user.id} />
        ) : (
          <MerchantOrderQueue />
        )}
      </div>
    )
  }

  if (user.role !== 'customer') {
    return (
      <p className="text-sm text-app-muted">
        Esta pantalla es para clientes y empresas del evento.
      </p>
    )
  }

  if (merchantFromUrl) {
    return (
      <CustomerEventMenu
        merchantId={merchantFromUrl}
        onBack={
          venues.length > 1
            ? () => {
                params.delete('merchant')
                setParams(params)
              }
            : undefined
        }
      />
    )
  }

  if (venues.length === 1) {
    return <CustomerEventMenu merchantId={venues[0].merchantId} />
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-app-accent">Evento</p>
        <h1 className="mt-1 text-xl font-semibold">Barras</h1>
        <p className="mt-1 text-sm text-app-muted">
          Elige una barra, ordena y muestra tu número al retirar.
        </p>
      </div>
      {venues.map((venue) => {
        const mine = orders.filter((order) => order.merchantId === venue.merchantId)
        return (
          <article key={venue.merchantId} className="overflow-hidden rounded-[24px] bg-app-card">
            <button
              type="button"
              className="w-full p-4 text-left"
              onClick={() => setParams({ merchant: venue.merchantId })}
            >
              <h2 className="font-medium">{venue.title}</h2>
              <p className="mt-1 text-sm text-app-muted">
                {venue.productCount} productos · retiro en {venue.pickupLabel}
              </p>
            </button>
            {mine.length > 0 ? (
              <ul className="divide-y divide-white/10 border-t border-white/10">
                {mine.map((order) => (
                  <li key={order.id} className="flex items-start justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        #{order.orderNumber} · {ORDER_STATUS[order.status]}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-app-muted">
                        {order.items.map((item) => `${item.qty}× ${item.name}`).join(', ')}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm tabular-nums">
                      {formatAmount(order.total)} {order.asset}
                    </p>
                  </li>
                ))}
              </ul>
            ) : null}
          </article>
        )
      })}
      {venues.length === 0 ? (
        <p className="text-sm text-app-muted">Todavía no hay cartas publicadas.</p>
      ) : null}
      {error ? <ErrorModal message={error} onClose={() => setError(null)} /> : null}
    </div>
  )
}
