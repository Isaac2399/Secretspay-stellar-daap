import { Smartphone } from 'lucide-react'
import { ClaimLookupPanel } from '@/components/admin/ClaimLookupPanel'
import { StaffSendPanel } from '@/components/admin/StaffSendPanel'
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
          Transacciones que llegaron por SINPE Móvil y no se asignaron solas.
          Busca el comprobante y acréditalo a la cuenta correcta.
        </p>
      </div>
      <p className="flex items-center gap-2 text-xs text-app-muted">
        <Smartphone className="h-4 w-4 text-app-accent" />
        Misma herramienta de asignación que usa super admin, sin el resto del panel.
      </p>
      <StaffSendPanel />
      <UnassignedDepositsPanel />
      <ClaimLookupPanel />
    </div>
  )
}
