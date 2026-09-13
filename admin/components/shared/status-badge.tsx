import {Badge} from '@/components/ui/badge'
import {cn} from '@/lib/utils'

/**
 * One mapping from state to colour, used everywhere.
 *
 * Colour is never the only signal: the badge always carries the word too, so
 * the table is readable in greyscale and to anyone who does not separate red
 * from green.
 */
const MAP: Record<string, {variant: 'operational' | 'degraded' | 'down' | 'info' | 'default'; label?: string}> = {
  online: {variant: 'operational'},
  operational: {variant: 'operational'},
  active: {variant: 'operational'},
  ACTIVE: {variant: 'operational', label: 'active'},
  AUTHORIZED: {variant: 'info', label: 'authorising'},
  connected: {variant: 'operational'},
  degraded: {variant: 'degraded'},
  draining: {variant: 'degraded'},
  maintenance: {variant: 'info'},
  offline: {variant: 'down'},
  down: {variant: 'down'},
  suspended: {variant: 'down'},
  revoked: {variant: 'down'},
  EXPIRED: {variant: 'degraded', label: 'expired'},
  REVOKED: {variant: 'down', label: 'revoked'},
  COMPLETED: {variant: 'default', label: 'completed'},
  STALE: {variant: 'degraded', label: 'stale'},
}

export function StatusBadge({status, className}: {status: string; className?: string}) {
  const entry = MAP[status] ?? MAP[status.toLowerCase()] ?? {variant: 'default' as const}
  const dot =
    entry.variant === 'operational'
      ? 'bg-status-operational'
      : entry.variant === 'degraded'
        ? 'bg-status-degraded'
        : entry.variant === 'down'
          ? 'bg-status-down'
          : entry.variant === 'info'
            ? 'bg-status-info'
            : 'bg-muted-foreground'

  return (
    <Badge variant={entry.variant} className={cn('capitalize', className)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', dot)} aria-hidden />
      {entry.label ?? status.toLowerCase()}
    </Badge>
  )
}
