import { Smartphone } from 'lucide-react'
import { ClaimLookupPanel } from '@/components/admin/ClaimLookupPanel'
import { UnassignedDepositsPanel } from '@/components/admin/UnassignedDepositsPanel'

export function SinpeOpsDashboard() {
  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-app-accent">
          Mesa SINPE
        </p>
        <h1 className="mt-1 text-xl font-semibold">Depósitos y reclamos</h1>
        <p className="mt-1 text-sm text-app-muted">
          Empareja SMS sin cuenta y reclamos por número de referencia. Si
          otorgás a mano, ese comprobante queda marcado y no se acredita otra
          vez cuando llegue el SMS.
        </p>
      </div>
      <p className="flex items-center gap-2 text-xs text-app-muted">
        <Smartphone className="h-4 w-4 text-app-accent" />
        Paridad ₡1,000 = 1 ROJO, sin promo.
      </p>
      <UnassignedDepositsPanel />
      <ClaimLookupPanel />
    </div>
  )
}
