import {ArrowDownRight, ArrowUpRight} from 'lucide-react'
import {Card} from '@/components/ui/card'
import {Skeleton} from '@/components/ui/skeleton'
import {EM_DASH} from '@/lib/format'
import {cn} from '@/lib/utils'

/**
 * Small label, large value, optional trend. Compact on purpose: eight of these
 * should fit above the fold, because the point of an overview is comparison.
 *
 * `change` is null when there is no baseline to compare against -- a first day
 * of data shows no arrow rather than an invented +100%.
 */
export function MetricCard({
  label,
  value,
  hint,
  change,
  loading,
  tone = 'default',
  invertTrend = false,
}: {
  label: string
  value: string
  hint?: string
  change?: number | null
  loading?: boolean
  tone?: 'default' | 'operational' | 'degraded' | 'down'
  invertTrend?: boolean
}) {
  if (loading) {
    return (
      <Card className="p-4">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-3 h-7 w-16" />
      </Card>
    )
  }

  const toneClass = {
    default: '',
    operational: 'text-status-operational',
    degraded: 'text-status-degraded',
    down: 'text-status-down',
  }[tone]

  const rising = (change ?? 0) >= 0
  const good = invertTrend ? !rising : rising

  return (
    <Card className="p-4">
      <p className="text-2xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn('tabular mt-2 text-2xl font-medium leading-none', toneClass)}>{value || EM_DASH}</p>
      <div className="mt-2 flex items-center gap-1.5 text-2xs text-muted-foreground">
        {change !== null && change !== undefined && (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 tabular',
              good ? 'text-status-operational' : 'text-status-down',
            )}>
            {rising ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {Math.abs(change).toFixed(1)}%
          </span>
        )}
        {hint && <span>{hint}</span>}
      </div>
    </Card>
  )
}
