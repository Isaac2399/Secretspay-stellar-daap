import { useState } from 'react'
import { Check, Copy, Landmark, LogOut, Shield, Store, User } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { CustomerFaq } from '@/components/customer/CustomerFaq'
import { useAuth } from '@/lib/auth/AuthContext'
import { categoryLabel } from '@/lib/places/categories'

export default function ProfilePage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [copied, setCopied] = useState(false)

  if (!user) {
    return null
  }

  const account = user

  async function copyKey() {
    await navigator.clipboard.writeText(account.publicKey)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  async function onLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <section className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Perfil</h1>
        <p className="mt-1 text-sm text-app-muted">Cuenta y sesión</p>
      </div>

      <div className="space-y-3 rounded-[24px] bg-app-card p-4">
        <div>
          <p className="text-xs text-app-muted">Email</p>
          <p className="mt-1 break-all text-sm">{account.email}</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          {account.role === 'admin' ? (
            <Shield className="h-4 w-4 text-app-accent" />
          ) : account.role === 'merchant' ? (
            <Store className="h-4 w-4 text-app-accent" />
          ) : account.role === 'cashier' || account.role === 'sinpe_ops' ? (
            <Shield className="h-4 w-4 text-app-accent" />
          ) : (
            <User className="h-4 w-4 text-app-accent" />
          )}
          {account.role === 'admin'
            ? 'Super admin / Distribuidor'
            : account.role === 'merchant'
              ? 'Empresa'
              : account.role === 'cashier'
                ? 'Caja del evento'
                : account.role === 'sinpe_ops'
                  ? 'Mesa SINPE'
                  : 'Cliente'}
        </div>
        {account.role === 'merchant' && account.business ? (
          <div>
            <p className="text-xs text-app-muted">Empresa</p>
            <p className="mt-1 text-sm">{account.business.businessName}</p>
            <p className="mt-1 text-xs text-white/70">
              {account.business.contactName} · {account.business.phone}
            </p>
            <p className="mt-1 text-xs text-white/70">Cédula {account.business.taxId}</p>
            <p className="mt-1 text-xs text-app-accent">
              {categoryLabel(account.business.category)}
            </p>
            <p className="mt-1 text-xs text-white/70">{account.business.address}</p>
            <p className="mt-1 text-xs leading-relaxed text-white/70">
              {account.business.description}
            </p>
          </div>
        ) : null}
        {account.role === 'merchant' && account.place ? (
          <div>
            <p className="text-xs text-app-muted">Local</p>
            <p className="mt-1 text-sm">{account.place.name}</p>
            <p className="mt-1 text-xs text-app-accent">
              {categoryLabel(account.place.category)}
            </p>
            <p className="mt-1 text-xs text-white/70">{account.place.address}</p>
          </div>
        ) : null}
        {account.role !== 'cashier' && account.role !== 'sinpe_ops' && account.role !== 'admin' ? (
          <div>
            <p className="text-xs text-app-muted">Código SINPE</p>
            <p className="mt-1 text-sm text-white/80">
              Se genera al copiarlo en Agregar → SINPE Móvil y dura 5 minutos.
            </p>
            {account.sinpeCode ? (
              <p className="mt-1 break-all font-mono text-xs tracking-wide text-app-muted">
                Último emitido: {account.sinpeCode}
              </p>
            ) : null}
          </div>
        ) : null}
        <div>
          <p className="text-xs text-app-muted">Public key</p>
          <p className="mt-1 break-all font-mono text-xs text-white/80">
            {account.publicKey}
          </p>
          <button
            type="button"
            onClick={() => void copyKey()}
            className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-app-chip px-3 py-1.5 text-xs text-white/80"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? 'Copiada' : 'Copiar'}
          </button>
        </div>
      </div>

      {account.role === 'customer' ? <CustomerFaq /> : null}

      {account.role === 'admin' ? (
        <Link
          to="/rwa"
          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-app-card py-3 text-sm font-medium"
        >
          <Landmark className="h-4 w-4 text-app-accent" />
          Activos reales (RWA)
        </Link>
      ) : null}

      <button
        type="button"
        onClick={() => void onLogout()}
        className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-app-card py-3 text-sm font-medium text-red-400"
      >
        <LogOut className="h-4 w-4" />
        Cerrar sesión
      </button>
    </section>
  )
}
