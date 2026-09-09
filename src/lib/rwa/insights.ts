import {
  ASSET_TYPE_LABELS,
  FREQUENCY_LABELS,
  type DividendFrequency,
  type MarketplaceListing,
  type RwaAssetType,
  type RwaHolding,
} from '@/types/rwa'

export type ProjectionPoint = {
  monthIndex: number
  label: string
  payout: number
  cumulative: number
  totalValue: number
}

export type RiskLevel = 'bajo' | 'medio' | 'alto'

export type InvestorBrief = {
  risk: RiskLevel
  riskLabel: string
  bullets: string[]
}

const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

export function remainingCapacityUsd(listing: MarketplaceListing): number {
  return Math.max(0, Number(listing.targetUsd) - Number(listing.raisedUsd))
}

export function listingFrequency(listing: MarketplaceListing): DividendFrequency {
  return listing.dividendFrequency === 'quarterly' ? 'quarterly' : 'monthly'
}

export function periodYieldUsd(
  principal: number,
  apyPercent: number,
  frequency: DividendFrequency,
): number {
  const apy = apyPercent / 100
  if (!Number.isFinite(principal) || principal <= 0 || !Number.isFinite(apy)) {
    return 0
  }
  return frequency === 'quarterly' ? (principal * apy) / 4 : (principal * apy) / 12
}

export function monthlyYieldUsd(principal: number, apyPercent: number): number {
  return periodYieldUsd(principal, apyPercent, 'monthly')
}

export function projectInvestment(
  principal: number,
  apyPercent: number,
  frequency: DividendFrequency,
  months = 12,
): ProjectionPoint[] {
  const start = new Date()
  const points: ProjectionPoint[] = []
  let cumulative = 0
  for (let index = 1; index <= months; index += 1) {
    const date = new Date(start.getFullYear(), start.getMonth() + index, 1)
    const pays =
      frequency === 'quarterly' ? index % 3 === 0 : true
    const payout = pays ? periodYieldUsd(principal, apyPercent, frequency) : 0
    cumulative += payout
    points.push({
      monthIndex: index,
      label: MONTH_LABELS[date.getMonth()] ?? `M${index}`,
      payout,
      cumulative,
      totalValue: principal + cumulative,
    })
  }
  return points
}

export function horizonTotals(
  principal: number,
  apyPercent: number,
  frequency: DividendFrequency,
) {
  const year1 = projectInvestment(principal, apyPercent, frequency, 12)
  const year3 = projectInvestment(principal, apyPercent, frequency, 36)
  const year5 = projectInvestment(principal, apyPercent, frequency, 60)
  return {
    monthly: monthlyYieldUsd(principal, apyPercent),
    period: periodYieldUsd(principal, apyPercent, frequency),
    year1: year1.at(-1)?.cumulative ?? 0,
    year3: year3.at(-1)?.cumulative ?? 0,
    year5: year5.at(-1)?.cumulative ?? 0,
  }
}

export function scenarioAmounts(listing: MarketplaceListing): number[] {
  const min = Number(listing.minInvestmentUsd)
  const remaining = remainingCapacityUsd(listing)
  const candidates = [min, 250, 500, 1000, 2500, 5000]
  const unique = [...new Set(candidates.filter((value) => value >= min && value <= remaining))]
  return unique.slice(0, 4)
}

export function investorBrief(assetType: RwaAssetType): InvestorBrief {
  switch (assetType) {
    case 'equity_inmobiliario':
      return {
        risk: 'medio',
        riskLabel: 'Riesgo medio — plusvalía y obra',
        bullets: [
          'La ganancia depende de que el proyecto se construya y se venda o refinancie.',
          'Puede haber poca o nula renta mientras está en plano o en construcción.',
          'El respaldo legal (RUGM o fideicomiso) es el camino de cobro si hay incumplimiento.',
        ],
      }
    case 'renta_flujo_caja':
      return {
        risk: 'medio',
        riskLabel: 'Riesgo medio — ocupación y gastos',
        bullets: [
          'El APY esperado asume ocupación y contratos de arriendo vigentes.',
          'Los gastos operativos (OpEx) reducen la renta neta que llega a su wallet.',
          'Si baja la ocupación, el dividendo en USDC puede recortarse o aplazarse.',
        ],
      }
    case 'uso_fraccionado':
      return {
        risk: 'medio',
        riskLabel: 'Riesgo medio — estacionalidad',
        bullets: [
          'Parte del valor es uso (días) y parte puede ser renta si hay subarriendo.',
          'La cuota de mantenimiento anual reduce el rendimiento neto por token.',
          'Alta/media/baja temporada cambia cuántos días (o renta) recibe cada año.',
        ],
      }
    case 'agricola_exportacion':
      return {
        risk: 'alto',
        riskLabel: 'Riesgo alto — cosecha y mercado',
        bullets: [
          'El flujo depende de la cosecha, el clima y el precio de exportación.',
          'Un offtake (carta de intención) no elimina el riesgo de incumplimiento del comprador.',
          'Revise certificaciones y seguro agrícola antes de comprometer capital.',
        ],
      }
    case 'creditos_carbono':
      return {
        risk: 'alto',
        riskLabel: 'Riesgo alto — verificación y vintage',
        bullets: [
          'Los créditos solo valen si el estándar (Verra, Gold Standard, PSA) los acredita.',
          'El año de vintage y el informe MRV determinan si se pueden vender.',
          'Los plazos de auditoría pueden retrasar el cobro respecto al APY anunciado.',
        ],
      }
  }
}

export function allocationSlices(
  holdings: RwaHolding[],
  listings: MarketplaceListing[],
): { label: string; value: number }[] {
  return holdings
    .map((holding) => {
      const listing = listings.find((row) => row.id === holding.listingId)
      return {
        label: listing?.name ?? holding.assetCode,
        value: Number(holding.investedUsd) || 0,
      }
    })
    .filter((row) => row.value > 0)
}

export function portfolioProjection(
  holdings: RwaHolding[],
  listings: MarketplaceListing[],
  months = 12,
): ProjectionPoint[] {
  const startPrincipal = holdings.reduce((sum, row) => sum + Number(row.investedUsd), 0)
  const points: ProjectionPoint[] = []
  let cumulative = 0
  const start = new Date()
  for (let index = 1; index <= months; index += 1) {
    const payout = holdings.reduce((sum, holding) => {
      const listing = listings.find((row) => row.id === holding.listingId)
      if (!listing) {
        return sum
      }
      const series = projectInvestment(
        Number(holding.investedUsd),
        Number(listing.apy),
        listingFrequency(listing),
        months,
      )
      return sum + (series[index - 1]?.payout ?? 0)
    }, 0)
    cumulative += payout
    const date = new Date(start.getFullYear(), start.getMonth() + index, 1)
    points.push({
      monthIndex: index,
      label: MONTH_LABELS[date.getMonth()] ?? `M${index}`,
      payout,
      cumulative,
      totalValue: startPrincipal + cumulative,
    })
  }
  return points
}

export function claimedReturnPercent(invested: number, claimed: number): number {
  if (!invested) {
    return 0
  }
  return (claimed / invested) * 100
}

export function listingHeadline(listing: MarketplaceListing): string {
  const freq = FREQUENCY_LABELS[listingFrequency(listing)].toLowerCase()
  return `${ASSET_TYPE_LABELS[listing.assetType]} · renta ${freq}`
}

export { MONTH_LABELS }
