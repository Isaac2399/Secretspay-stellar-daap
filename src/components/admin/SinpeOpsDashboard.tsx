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
        <h1 className="mt-1 text-xl font-semibold">Depósitos sin cuenta</h1>
        <p className="mt-1 text-sm text-app-muted">
          Empareja comprobantes SINPE con la cuenta correcta. No envía ROJOS a
          mano: eso solo lo hace el super admin (o la caja con efectivo).
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
