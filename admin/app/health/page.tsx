'use client'

import {RefreshCw} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {Card, CardContent} from '@/components/ui/card'
import {PageHeader} from '@/components/shared/page'
import {StatusBadge} from '@/components/shared/status-badge'
import {CardsSkeleton, ErrorState} from '@/components/shared/states'
import type {Gateway, ServiceHealth} from '@/lib/api'
import {EM_DASH, formatRelative} from '@/lib/format'
import {useApi} from '@/lib/use-api'

export default function HealthPage() {
  const health = useApi<{services: ServiceHealth[]; checked_at: string}>('/admin/health/services', {
    pollMs: 20000,
  })
  const gateways = useApi<{gateways: Gateway[]}>('/admin/gateways', {pollMs: 20000})

  return (
    <div className="space-y-5">
      <PageHeader
        title="System health"
        description="Checked live on every load. Nothing on this page is cached."
        actions={
          <Button variant="outline" size="sm" onClick={health.refresh} disabled={health.refreshing}>
            <RefreshCw className={health.refreshing ? 'animate-spin' : ''} />
            Check now
          </Button>
        }
      />

      {health.loading ? (
        <CardsSkeleton count={4} />
      ) : health.error ? (
        <Card>
          <ErrorState error={health.error} onRetry={health.refresh} />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {health.data!.services.map(service => (
            <Card key={service.name}>
              <CardContent className="flex items-start justify-between gap-3 pt-4">
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-medium">{service.name}</p>
                  <p className="text-2xs text-muted-foreground">{service.note ?? 'Responding normally.'}</p>
                </div>
                <div className="text-right">
                  <StatusBadge status={service.status} />
                  <p className="tabular mt-1.5 text-2xs text-muted-foreground">
                    {service.latency_ms === null ? EM_DASH : `${service.latency_ms} ms`}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-medium">Gateway agents</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {(gateways.data?.gateways ?? []).map(gateway => (
            <Card key={gateway.gateway_id}>
              <CardContent className="flex items-center justify-between gap-3 pt-4">
                <div className="min-w-0">
                  <p className="truncate text-sm">{gateway.city}</p>
                  <p className="font-mono text-2xs text-muted-foreground">{gateway.gateway_id}</p>
                </div>
                <div className="text-right">
                  <StatusBadge status={gateway.effective_status} />
                  <p className="mt-1.5 text-2xs text-muted-foreground">
                    {formatRelative(gateway.health_reported_at)}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  )
}
