'use client'

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

/**
 * Charts are restrained on purpose: one hairline grid, no gradients under the
 * curve, no drop shadows. A traffic chart in a control room is read for shape
 * and for the moment something changed, not admired.
 */
const axis = {
  stroke: 'hsl(var(--muted-foreground))',
  fontSize: 10,
  tickLine: false,
  axisLine: false,
}

function ChartTooltip({active, payload, label, format}: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-md border bg-popover px-2.5 py-2 text-xs shadow-md">
      <p className="mb-1 text-2xs text-muted-foreground">{label}</p>
      {payload.map((entry: any) => (
        <p key={entry.dataKey} className="tabular flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full" style={{background: entry.color}} />
          <span className="text-muted-foreground">{entry.name}</span>
          <span className="ml-auto">{format ? format(entry.value) : entry.value}</span>
        </p>
      ))}
    </div>
  )
}

export function SeriesChart({
  data,
  keys,
  xKey = 'date',
  height = 220,
  format,
}: {
  data: Record<string, unknown>[]
  keys: {key: string; label: string; color: string}[]
  xKey?: string
  height?: number
  format?: (value: number) => string
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{top: 4, right: 4, bottom: 0, left: -18}}>
        <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="2 4" vertical={false} />
        <XAxis dataKey={xKey} {...axis} minTickGap={24} />
        <YAxis {...axis} width={52} tickFormatter={value => (format ? format(value) : String(value))} />
        <Tooltip content={<ChartTooltip format={format} />} />
        {keys.map(series => (
          <Area
            key={series.key}
            type="monotone"
            dataKey={series.key}
            name={series.label}
            stroke={series.color}
            fill={series.color}
            fillOpacity={0.08}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  )
}

export function CategoryChart({
  data,
  xKey,
  valueKey,
  color = 'hsl(var(--status-info))',
  height = 220,
  format,
}: {
  data: Record<string, unknown>[]
  xKey: string
  valueKey: string
  color?: string
  height?: number
  format?: (value: number) => string
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{top: 4, right: 4, bottom: 0, left: -18}}>
        <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="2 4" vertical={false} />
        <XAxis dataKey={xKey} {...axis} />
        <YAxis {...axis} width={52} tickFormatter={value => (format ? format(value) : String(value))} />
        <Tooltip content={<ChartTooltip format={format} />} cursor={{fill: 'hsl(var(--muted))', opacity: 0.4}} />
        <Bar dataKey={valueKey} fill={color} radius={[2, 2, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  )
}
