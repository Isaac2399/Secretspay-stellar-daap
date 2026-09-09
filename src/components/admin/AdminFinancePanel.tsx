import { Landmark, TrendingDown, TrendingUp, Wallet } from 'lucide-react'
import { AreaChart, BarList, DonutChart } from '@/components/charts/Charts'
import { formatUsd } from '@/lib/rwa/format'
import type { AdminFinance } from '@/types/admin'

const STATUS_COLORS = ['#fbbf24', '#60a5fa', '#1c8c62', '#f87171']

export function AdminFinancePanel({ finance }: { finance: AdminFinance }) {
  const coverage =
    finance.rwaAnnualObligationUsd > 0
      ? finance.rwaAumUsd / finance.rwaAnnualObligationUsd
      : 0
  const paidVsDue = finance.rwaMonthlyObligationUsd
    ? finance.rwaDividendsPaidUsd - finance.rwaMonthlyObligationUsd
    : finance.rwaDividendsPaidUsd
  const net12 = finance.monthly.reduce((sum, row) => sum + row.net, 0)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <Kpi
          icon={Wallet}
          label="AUM tokenizado"
          value={formatUsd(finance.rwaAumUsd)}
          hint={`${finance.rwaListings} emisiones · ${finance.rwaInvestors} inversionistas`}
        />
        <Kpi
          icon={Landmark}
          label="GMV empresas USDC"
          value={formatUsd(finance.merchantGmvUsdc)}
          hint={`XLM ${finance.merchantGmvXlm.toLocaleString('es-CR', { maximumFractionDigits: 2 })}`}
        />
        <Kpi
          icon={TrendingUp}
          label="Renta mensual a pagar"
          value={formatUsd(finance.rwaMonthlyObligationUsd)}
          hint={`Anual ${formatUsd(finance.rwaAnnualObligationUsd)}`}
        />
        <Kpi
          icon={paidVsDue >= 0 ? TrendingUp : TrendingDown}
          label="Rentas ya cobradas"
          value={formatUsd(finance.rwaDividendsPaidUsd)}
          hint={
            paidVsDue >= 0
              ? 'Por encima de un mes de obligación'
              : 'Por debajo de un mes de obligación'
          }
        />
      </div>

      <div className="rounded-[24px] bg-app-card p-4 text-xs text-white/75">
        <p className="text-sm font-semibold text-white">Lectura de P&amp;L</p>
        <p className="mt-2 leading-relaxed">
          El AUM es capital de inversionistas, no ingreso del operador. La obligación de renta
          ({formatUsd(finance.rwaAnnualObligationUsd)} / año) sale del flujo de cada activo. El
          mercado aún tiene un hueco de fondeo de {formatUsd(finance.rwaFundingGapUsd)}. El flujo
          USDC de 12 meses (empresas + clientes) cierra en {formatUsd(net12)}{' '}
          {net12 >= 0 ? 'positivo' : 'negativo'}. Cobertura de rentas con AUM: {coverage.toFixed(1)} años
          si el capital no se mueve.
        </p>
        {finance.pendingRequests > 0 ? (
          <p className="mt-2 text-app-accent">
            {finance.pendingRequests} expedientes RWA esperan auditoría o legal.
          </p>
        ) : null}
        {finance.failedPayments > 0 ? (
          <p className="mt-1 text-red-400">
            {finance.failedPayments} pagos de clientes fallidos en Horizon.
          </p>
        ) : null}
      </div>

      <div className="rounded-[24px] bg-app-card p-4">
        <AreaChart
          title="Flujo USDC 12 meses (entradas vs salidas)"
          caption="Suma de cobros y envíos USDC de empresas y clientes. Source: Horizon · últimos 12 meses."
          xLabel="Mes"
          yLabel="USDC"
          formatY={(value) => formatUsd(value)}
          series={[
            {
              name: 'Entradas',
              colorClass: 'stroke-app-accent',
              fillClass: 'fill-app-accent/20',
              points: finance.monthly.map((row) => ({ label: row.label, value: row.inflow })),
            },
            {
              name: 'Salidas',
              colorClass: 'stroke-red-400',
              points: finance.monthly.map((row) => ({ label: row.label, value: row.outflow })),
            },
          ]}
        />
      </div>

      <div className="rounded-[24px] bg-app-card p-4">
        <BarList
          title="Resultado neto USDC por mes"
          caption="Entradas menos salidas. Rojo = mes negativo."
          xLabel="USDC"
          yLabel="Mes"
          formatValue={(value) => formatUsd(value)}
          items={finance.monthly.map((row) => ({
            label: row.label,
            value: row.net,
            tone: row.net < 0 ? 'loss' : 'accent',
          }))}
        />
      </div>

      {finance.listingRaised.length > 0 ? (
        <div className="rounded-[24px] bg-app-card p-4">
          <BarList
            title="Capital levantado por emisión"
            caption="AUM publicado en el marketplace."
            xLabel="USDC"
            yLabel="Asset"
            formatValue={(value) => formatUsd(value)}
            items={finance.listingRaised}
          />
        </div>
      ) : null}

      {finance.listingObligation.length > 0 ? (
        <div className="rounded-[24px] bg-app-card p-4">
          <BarList
            title="Obligación mensual de dividendos"
            caption="raised × APY / 12. Es pasivo de renta, no gasto operativo del super admin."
            xLabel="USDC / mes"
            yLabel="Asset"
            formatValue={(value) => formatUsd(value)}
            items={finance.listingObligation}
          />
        </div>
      ) : null}

      {finance.merchantRanking.length > 0 ? (
        <div className="rounded-[24px] bg-app-card p-4">
          <BarList
            title="Ventas USDC por empresa"
            caption="GMV recibido en wallets comercio."
            xLabel="USDC"
            yLabel="Empresa"
            formatValue={(value) => formatUsd(value)}
            items={finance.merchantRanking}
          />
        </div>
      ) : null}

      {finance.requestStatus.length > 0 ? (
        <div className="rounded-[24px] bg-app-card p-4">
          <DonutChart
            title="Expedientes de tokenización"
            caption="Pipeline interno · no incluye listados semilla sin solicitud."
            slices={finance.requestStatus.map((slice, index) => ({
              ...slice,
              color: STATUS_COLORS[index % STATUS_COLORS.length] ?? '#1c8c62',
            }))}
          />
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2 text-xs">
        <Mini
          label="Libro inversionistas"
          value={formatUsd(finance.rwaBookUsd)}
        />
        <Mini label="Objetivo de mercado" value={formatUsd(finance.rwaTargetUsd)} />
        <Mini label="Hueco de fondeo" value={formatUsd(finance.rwaFundingGapUsd)} />
        <Mini
          label="Rechazados"
          value={String(finance.rejectedRequests)}
        />
      </div>
    </div>
  )
}

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Wallet
  label: string
  value: string
  hint: string
}) {
  return (
    <div className="rounded-[20px] bg-app-card p-4">
      <Icon className="h-4 w-4 text-app-accent" />
      <p className="mt-2 text-lg font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-app-muted">{label}</p>
      <p className="mt-1 text-[11px] text-white/60">{hint}</p>
    </div>
  )
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[20px] bg-app-card p-3">
      <p className="text-app-muted">{label}</p>
      <p className="mt-1 font-semibold tabular-nums">{value}</p>
    </div>
  )
}
