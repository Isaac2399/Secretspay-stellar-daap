export type ChartPoint = {
  label: string
  value: number
}

export type ChartSeries = {
  name: string
  colorClass: string
  fillClass?: string
  points: ChartPoint[]
}

function maxValue(values: number[]): number {
  const peak = Math.max(0, ...values)
  return peak === 0 ? 1 : peak
}

function compactNumber(value: number): string {
  if (Math.abs(value) >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)} M`
  }
  if (Math.abs(value) >= 1000) {
    return `${(value / 1000).toFixed(1)} k`
  }
  return value.toLocaleString('es-CR', { maximumFractionDigits: 1 })
}

export function AreaChart({
  title,
  caption,
  xLabel,
  yLabel,
  series,
  formatY = compactNumber,
}: {
  title: string
  caption: string
  xLabel: string
  yLabel: string
  series: ChartSeries[]
  formatY?: (value: number) => string
}) {
  const width = 320
  const height = 168
  const pad = { top: 16, right: 12, bottom: 28, left: 40 }
  const innerW = width - pad.left - pad.right
  const innerH = height - pad.top - pad.bottom
  const labels = series[0]?.points.map((point) => point.label) ?? []
  const peak = maxValue(series.flatMap((item) => item.points.map((point) => point.value)))
  const lastIndex = Math.max(labels.length - 1, 1)

  function xAt(index: number): number {
    return pad.left + (index / lastIndex) * innerW
  }
  function yAt(value: number): number {
    return pad.top + innerH - (value / peak) * innerH
  }

  function linePath(points: ChartPoint[]): string {
    return points
      .map((point, index) => `${index === 0 ? 'M' : 'L'} ${xAt(index)} ${yAt(point.value)}`)
      .join(' ')
  }

  function areaPath(points: ChartPoint[]): string {
    if (points.length === 0) {
      return ''
    }
    const line = linePath(points)
    return `${line} L ${xAt(points.length - 1)} ${pad.top + innerH} L ${xAt(0)} ${pad.top + innerH} Z`
  }

  const tickEvery = labels.length > 8 ? 2 : 1

  return (
    <figure className="space-y-2">
      <figcaption className="text-sm font-semibold">{title}</figcaption>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-40 w-full" role="img" aria-label={title}>
        <line
          x1={pad.left}
          y1={pad.top + innerH}
          x2={pad.left + innerW}
          y2={pad.top + innerH}
          className="stroke-white/15"
        />
        <line
          x1={pad.left}
          y1={pad.top}
          x2={pad.left}
          y2={pad.top + innerH}
          className="stroke-white/15"
        />
        <text x={pad.left} y={12} className="fill-app-muted text-[9px]">
          {yLabel}
        </text>
        {series.map((item) => (
          <g key={item.name}>
            {item.fillClass ? (
              <path d={areaPath(item.points)} className={item.fillClass} />
            ) : null}
            <path
              d={linePath(item.points)}
              className={`${item.colorClass} fill-none`}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </g>
        ))}
        {labels.map((label, index) =>
          index % tickEvery === 0 ? (
            <text
              key={`${label}-${index}`}
              x={xAt(index)}
              y={height - 8}
              textAnchor="middle"
              className="fill-app-muted text-[8px]"
            >
              {label}
            </text>
          ) : null,
        )}
        <text
          x={pad.left + innerW}
          y={12}
          textAnchor="end"
          className="fill-app-muted text-[9px]"
        >
          {formatY(peak)}
        </text>
      </svg>
      <p className="text-[11px] text-app-muted">{caption}</p>
      {series.length > 1 ? (
        <ul className="flex flex-wrap gap-3 text-[11px] text-white/80">
          {series.map((item) => (
            <li key={item.name} className="inline-flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${item.colorClass.replace('stroke-', 'bg-')}`} />
              {item.name}
            </li>
          ))}
        </ul>
      ) : null}
      <p className="sr-only">{xLabel}</p>
    </figure>
  )
}

export function Sparkline({
  values,
  label,
}: {
  values: number[]
  label: string
}) {
  const width = 120
  const height = 36
  const peak = maxValue(values)
  const last = Math.max(values.length - 1, 1)
  const points = values
    .map((value, index) => {
      const x = (index / last) * width
      const y = height - (value / peak) * (height - 4) - 2
      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`
    })
    .join(' ')
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-9 w-24" aria-label={label} role="img">
      <path d={points} className="fill-none stroke-app-accent" strokeWidth="2" />
    </svg>
  )
}

export function BarList({
  title,
  caption,
  xLabel,
  yLabel,
  items,
  formatValue = compactNumber,
}: {
  title: string
  caption: string
  xLabel: string
  yLabel: string
  items: { label: string; value: number; tone?: 'accent' | 'loss' | 'muted' }[]
  formatValue?: (value: number) => string
}) {
  const peak = maxValue(items.map((item) => Math.abs(item.value)))
  return (
    <figure className="space-y-2">
      <figcaption className="text-sm font-semibold">{title}</figcaption>
      <p className="text-[11px] text-app-muted">
        {yLabel} · {xLabel}
      </p>
      <ul className="space-y-2">
        {items.map((item) => {
          const width = Math.max(4, (Math.abs(item.value) / peak) * 100)
          const tone =
            item.tone === 'loss'
              ? 'bg-red-400'
              : item.tone === 'muted'
                ? 'bg-white/40'
                : 'bg-app-accent'
          return (
            <li key={item.label}>
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="truncate text-white/80">{item.label}</span>
                <span className="tabular-nums text-white">{formatValue(item.value)}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className={`h-full rounded-full ${tone}`} style={{ width: `${width}%` }} />
              </div>
            </li>
          )
        })}
      </ul>
      <p className="text-[11px] text-app-muted">{caption}</p>
    </figure>
  )
}

export function DonutChart({
  title,
  caption,
  slices,
  formatValue = compactNumber,
}: {
  title: string
  caption: string
  slices: { label: string; value: number; color: string }[]
  formatValue?: (value: number) => string
}) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0)
  const radius = 42
  const circumference = 2 * Math.PI * radius
  let offset = 0
  return (
    <figure className="space-y-2">
      <figcaption className="text-sm font-semibold">{title}</figcaption>
      <div className="flex items-center gap-4">
        <svg viewBox="0 0 120 120" className="h-28 w-28" role="img" aria-label={title}>
          <circle cx="60" cy="60" r={radius} className="fill-none stroke-white/10" strokeWidth="14" />
          {slices.map((slice) => {
            const portion = total ? slice.value / total : 0
            const dash = portion * circumference
            const circle = (
              <circle
                key={slice.label}
                cx="60"
                cy="60"
                r={radius}
                className="fill-none"
                stroke={slice.color}
                strokeWidth="14"
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={-offset}
                transform="rotate(-90 60 60)"
              />
            )
            offset += dash
            return circle
          })}
          <text x="60" y="58" textAnchor="middle" className="fill-white text-[11px] font-semibold">
            {formatValue(total)}
          </text>
          <text x="60" y="72" textAnchor="middle" className="fill-app-muted text-[8px]">
            total
          </text>
        </svg>
        <ul className="min-w-0 flex-1 space-y-1.5 text-[11px]">
          {slices.map((slice) => (
            <li key={slice.label} className="flex items-center justify-between gap-2">
              <span className="inline-flex min-w-0 items-center gap-1.5 text-white/80">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: slice.color }} />
                <span className="truncate">{slice.label}</span>
              </span>
              <span className="tabular-nums">{formatValue(slice.value)}</span>
            </li>
          ))}
        </ul>
      </div>
      <p className="text-[11px] text-app-muted">{caption}</p>
    </figure>
  )
}

export { compactNumber }
