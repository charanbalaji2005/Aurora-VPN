'use client'

import Link from 'next/link'
import {Server} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {Progress} from '@/components/ui/progress'
import {PageHeader} from '@/components/shared/page'
import {StatusBadge} from '@/components/shared/status-badge'
import {CardsSkeleton, EmptyState, ErrorState} from '@/components/shared/states'
import type {Gateway} from '@/lib/api'
import {formatLatency, formatPercent, formatRelative} from '@/lib/format'
import {useApi} from '@/lib/use-api'

export default function GatewaysPage() {
  const gateways = useApi<{gateways: Gateway[]}>('/admin/gateways', {pollMs: 15000})

  return (
    <div className="space-y-5">
      <PageHeader
        title="Gateways"
        description="Each gateway is an independent Ubuntu host running kernel WireGuard. The control plane never carries their traffic."
      />

      {gateways.loading ? (
        <CardsSkeleton count={6} />
      ) : gateways.error ? (
        <Card>
          <ErrorState error={gateways.error} onRetry={gateways.refresh} />
        </Card>
      ) : gateways.data!.gateways.length === 0 ? (
        <Card>
          <EmptyState
            icon={Server}
            title="No gateways connected"
            body="Provision a host with gateway/scripts/install-gateway.sh, then register it with the bootstrap secret. It appears here on its first heartbeat."
          />
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {gateways.data!.gateways.map(gateway => (
            <Card key={gateway.gateway_id}>
              <CardHeader className="flex-row items-start justify-between space-y-0">
                <div>
                  <CardTitle>
                    {gateway.city}, {gateway.country}
                  </CardTitle>
                  <p className="font-mono text-2xs text-muted-foreground">{gateway.gateway_id}</p>
                </div>
                <StatusBadge status={gateway.effective_status} />
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1">
                  <div className="flex justify-between text-2xs text-muted-foreground">
                    <span>Load</span>
                    <span className="tabular text-foreground">{formatPercent(gateway.load_percent)}</span>
                  </div>
                  <Progress
                    value={gateway.load_percent}
                    indicatorClassName={
                      gateway.load_percent > 80
                        ? 'bg-status-down'
                        : gateway.load_percent > 50
                          ? 'bg-status-degraded'
                          : 'bg-status-operational'
                    }
                  />
                </div>

                <dl className="grid grid-cols-2 gap-2 text-2xs">
                  <div>
                    <dt className="text-muted-foreground">Peers</dt>
                    <dd className="tabular text-sm">
                      {gateway.active_peers}
                      <span className="text-muted-foreground"> / {gateway.capacity}</span>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Sessions</dt>
                    <dd className="tabular text-sm">{gateway.sessions_active ?? 0}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Latency</dt>
                    <dd className="tabular text-sm">{formatLatency(gateway.median_latency_ms)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Heartbeat</dt>
                    <dd className="text-sm">{formatRelative(gateway.health_reported_at)}</dd>
                  </div>
                </dl>

                <Button variant="outline" size="sm" className="w-full" asChild>
                  <Link href={`/gateways/${gateway.gateway_id}`}>Open</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
