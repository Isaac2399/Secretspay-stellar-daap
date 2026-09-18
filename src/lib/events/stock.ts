export const LOW_STOCK_THRESHOLD = 30

export function isLowStock(stock: number): boolean {
  return stock < LOW_STOCK_THRESHOLD
}

export function stockCountClass(stock: number): string {
  if (stock <= 0 || isLowStock(stock)) {
    return 'font-medium text-red-400'
  }
  return 'text-white/80'
}

export function formatStockLabel(stock: number): string {
  if (stock <= 0) {
    return 'Agotado'
  }
  return `${stock} disponibles`
}
