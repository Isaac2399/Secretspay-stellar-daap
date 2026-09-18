import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AdminDashboard } from '@/components/admin/AdminDashboard'
import { SinpeOpsDashboard } from '@/components/admin/SinpeOpsDashboard'
import { CashierDashboard } from '@/components/cashier/CashierDashboard'
import { AccountStrip } from '@/components/dashboard/AccountStrip'
import { MySinpeCredits } from '@/components/dashboard/MySinpeCredits'
import { ActivityList } from '@/components/dashboard/ActivityList'
import { DashboardHero } from '@/components/dashboard/DashboardHero'
import { CreateInvoiceQR } from '@/components/merchant/CreateInvoiceQR'
import { ScanAndPay } from '@/components/customer/ScanAndPay'
import { SendByPublicKey } from '@/components/customer/SendByPublicKey'
import { useAuth } from '@/lib/auth/AuthContext'
import { stellarConfig } from '@/lib/stellar/config'
import { useAccountBalances } from '@/lib/stellar/useAccountBalances'
import { useRecentActivity } from '@/lib/stellar/useRecentActivity'

export default function HomePage() {
  const { user } = useAuth()
  const { balances, error, reload } = useAccountBalances(user?.publicKey ?? '')
  const activity = useRecentActivity(user?.publicKey ?? '')
  const [sendOpen, setSendOpen] = useState(false)
  const sendRef = useRef<HTMLElement>(null)
  const scanRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!sendOpen) {
      return
    }
    sendRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [sendOpen])

  if (!user) {
    return null
  }

  if (user.role === 'admin') {
    return <AdminDashboard />
  }

  if (user.role === 'cashier') {
    return <CashierDashboard />
  }

  if (user.role === 'sinpe_ops') {
    return <SinpeOpsDashboard />
  }

  const isCustomer = user.role === 'customer'

  return (
    <div className="space-y-6">
      <DashboardHero
        user={user}
        balances={balances}
        error={error}
        onScan={() =>
          scanRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
        onSend={() => setSendOpen(true)}
        onDepositCompleted={(tx) => {
          void reload()
          void activity.reloadAfterDeposit(tx)
        }}
        onRojosCredited={() => {
          void reload()
          void activity.reload()
        }}
      />

      <AccountStrip balances={balances} />

      <Link
        to="/event"
        className="block rounded-[24px] bg-app-card p-5"
      >
        <p className="text-xs font-medium uppercase tracking-wide text-app-accent">
          Evento
        </p>
        <h2 className="mt-1 text-[17px] font-semibold">
          {isCustomer ? 'Ordenar en barra' : 'Carta y pedidos de barra'}
        </h2>
        <p className="mt-1 text-sm text-app-muted">
          {isCustomer
            ? 'Pide, paga en la app y muestra el QR al retirar.'
            : 'Añade productos, marca pedidos listos y abre la pantalla de TV.'}
        </p>
      </Link>

      <MySinpeCredits />

      <ActivityList
        publicKey={user.publicKey}
        items={activity.items}
        loading={activity.loading}
        error={activity.error}
      />

      {sendOpen ? (
        <section
          ref={sendRef}
          id="enviar"
          className="scroll-mt-4 rounded-[24px] bg-app-card p-5"
        >
          <h2 className="mb-2 text-[17px] font-semibold">
            Enviar {stellarConfig.loyalty.code}
          </h2>
          <p className="mb-4 text-sm text-app-muted">
            Transfiere en Testnet a otra public key. El asset por defecto es{' '}
            {stellarConfig.loyalty.code}.
          </p>
          <SendByPublicKey defaultAsset={stellarConfig.loyalty.code} />
        </section>
      ) : null}

      {isCustomer ? (
        <section
          ref={scanRef}
          id="qr"
          className="scroll-mt-4 rounded-[24px] bg-app-card p-5"
        >
          <h2 className="mb-4 text-[17px] font-semibold">Pagar con QR</h2>
          <ScanAndPay />
        </section>
      ) : (
        <section
          ref={scanRef}
          id="cobrar"
          className="scroll-mt-4 rounded-[24px] bg-app-card p-5"
        >
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-app-accent">
            Empresa
          </p>
          <h2 className="mb-1 text-[17px] font-semibold">Cobrar / Factura QR</h2>
          <p className="mb-4 text-sm text-app-muted">
            Genera un QR para que el cliente pague en Testnet.
          </p>
          <CreateInvoiceQR
            merchantPublicKey={user.publicKey}
            loyaltyBalance={balances.loyalty}
          />
        </section>
      )}
    </div>
  )
}
