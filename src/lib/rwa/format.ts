import { formatAmount } from '@/lib/stellar/useAccountBalances'
import type { DividendFrequency, RwaHolding } from '@/types/rwa'

export function formatUsd(value: string | number): string {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    return String(value)
  }
  return new Intl.NumberFormat('es-CR', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(numeric)
}

export function progressPercent(raised: string, target: string): number {
  const targetNum = Number(target)
  if (!targetNum) {
    return 0
  }
  return Math.min(100, Math.round((Number(raised) / targetNum) * 100))
}

export function poolSharePercent(tokens: string, totalSupply: string): number {
  const total = Number(totalSupply)
  if (!total) {
    return 0
  }
  return Math.min(100, (Number(tokens) / total) * 100)
}

export function estimatedMonthlyYieldUsd(
  holdings: RwaHolding[],
  apyByListing: Record<string, string>,
): number {
  return holdings.reduce((sum, holding) => {
    const apy = Number(apyByListing[holding.listingId] ?? 0) / 100
    return sum + (Number(holding.investedUsd) * apy) / 12
  }, 0)
}

export function nextPayoutLabel(date: string): string {
  if (!date) {
    return 'Por definir'
  }
  const parsed = new Date(`${date}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) {
    return date
  }
  return new Intl.DateTimeFormat('es-CR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(parsed)
}

export function frequencyHint(frequency: DividendFrequency): string {
  return frequency === 'quarterly' ? 'cada trimestre' : 'cada mes'
}

export { formatAmount }
