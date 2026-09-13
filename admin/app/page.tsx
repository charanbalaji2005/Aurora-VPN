'use client'

import Link from 'next/link'
import {RefreshCw, Server} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table'
import {MetricCard} from '@/components/shared/metric-card'
import {PageHeader, Section} from '@/components/shared/page'
import {StatusBadge} from '@/components/shared/status-badge'
import {CardsSkeleton, EmptyState, ErrorState, TableSkeleton} from '@/components/shared/states'
import {useApi} from '@/lib/use-api'
import type {Analytics, Gateway, Overview} from '@/lib/api'
import {formatBytes, formatDuration, formatLatency, formatNumber, formatPercent, formatRelative, trend} from '@/lib/format'
import {SeriesChart} from '@/components/dashboard/charts'

export default function OverviewPage() {
  // Fifteen seconds is live enough during an incident and gentle enough for a
  // dashboard someone left open on a wall screen.
  const overview = useApi<Overview>('/admin/overview', {pollMs: 15000})
  const gateways = useApi<{gateways: Gateway[]}>('/admin/gateways', {pollMs: 15000})
  const analytics = useApi<Analytics>('/admin/analytics?days=14')

  const data = overview.data
  const offline = data ? data.gateways_total - data.gateways_online : 0

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        description={
          data ? `Control plane time ${new Date(data.server_time).toUTCString()}` : 'Monitoring the fleet.'
        }
        actions={
          <Button variant="outline" size="sm" onClick={overview.refresh} disabled={overview.refreshing}>
            <RefreshCw className={overview.refreshing ? 'animate-spin' : ''} />
            Refresh
          </Button>
        }
      />

      {overview.error ? (
        <Card>
          <ErrorState error={overview.error} onRetry={overview.refresh} />
        </Card>
      ) : overview.loading ? (
        <CardsSkeleton />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Active sessions"
              value={formatNumber(data!.sessions_active)}
              hint="tunnels up now"
              tone={data!.sessions_active > 0 ? 'operational' : 'default'}
            />
            <MetricCard
              label="Gateways online"
              value={`${data!.gateways_online} / ${data!.gateways_total}`}
              hint={offline > 0 ? `${offline} not reporting health` : 'all reporting'}
              tone={offline > 0 ? 'degraded' : 'operational'}
            />
            <MetricCard
              label="Free time used today"
              value={formatDuration(data!.quota_seconds_used_today)}
              change={trend(data!.quota_seconds_used_today, data!.quota_seconds_used_yesterday)}
              hint="vs yesterday"
            />
            <MetricCard
              label="Traffic today"
              value={formatBytes(data!.bytes_down_today + data!.bytes_up_today)}
              hint="byte counters only"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Accounts" value={formatNumber(data!.users_total)} hint={`${data!.users_new_today} new today`} />
            <MetricCard
              label="Suspended"
              value={formatNumber(data!.users_suspended)}
              tone={data!.users_suspended > 0 ? 'degraded' : 'default'}
            />
            <MetricCard label="Registered devices" value={formatNumber(data!.devices_total)} />
            <MetricCard
              label="Average gateway load"
              value={formatPercent(data!.gateway_load_average)}
              hint={data!.gateway_load_average === null ? 'no gateway online' : 'across online gateways'}
              tone={(data!.gateway_load_average ?? 0) > 80 ? 'degraded' : 'default'}
            />
          </div>
        </>
      )}

      <Section title="Sessions and traffic" description="Completed sessions, last 14 days.">
        <Card>
          <CardContent className="pt-4">
            {analytics.loading ? (
              <TableSkeleton rows={4} columns={1} />
            ) : analytics.error ? (
              <ErrorState error={analytics.error} onRetry={analytics.refresh} />
            ) : analytics.data && analytics.data.days.length > 0 ? (
              <SeriesChart
                data={analytics.data.days}
                keys={[
                  {key: 'sessions', label: 'Sessions', color: 'hsl(var(--status-info))'},
                  {key: 'duration_seconds', label: 'Seconds used', color: 'hsl(var(--status-operational))'},
                ]}
              />
            ) : (
              <EmptyState
                title="No completed sessions yet"
                body="This chart fills in once sessions have finished. A session appears here when it disconnects, not while it is running."
              />
            )}
          </CardContent>
        </Card>
      </Section>

      <Section
        title="Infrastructure"
        description="Gateways report health every 30 seconds; anything silent for 90 is treated as offline."
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/gateways">All gateways</Link>
          </Button>
        }>
        <Card>
          {gateways.loading ? (
            <TableSkeleton columns={6} />
          ) : gateways.error ? (
            <ErrorState error={gateways.error} onRetry={gateways.refresh} />
          ) : gateways.data && gateways.data.gateways.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Location</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Load</TableHead>
                  <TableHead>Peers</TableHead>
                  <TableHead>Sessions</TableHead>
                  <TableHead>Latency</TableHead>
                  <TableHead>Health</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {gateways.data.gateways.map(gateway => (
                  <TableRow key={gateway.gateway_id}>
                    <TableCell>
                      <Link href={`/gateways/${gateway.gateway_id}`} className="hover:underline">
                        {gateway.city}, {gateway.country}
                      </Link>
                      <p className="font-mono text-2xs text-muted-foreground">{gateway.gateway_id}</p>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={gateway.effective_status} />
                    </TableCell>
                    <TableCell className="tabular">{formatPercent(gateway.load_percent)}</TableCell>
                    <TableCell className="tabular">
                      {gateway.active_peers}
                      <span className="text-muted-foreground"> / {gateway.capacity}</span>
                    </TableCell>
                    <TableCell className="tabular">{formatNumber(gateway.sessions_active ?? 0)}</TableCell>
                    <TableCell className="tabular">{formatLatency(gateway.median_latency_ms)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatRelative(gateway.health_reported_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState
              icon={Server}
              title="No gateways connected"
              body="A gateway appears here the moment its agent registers with the control plane. Run gateway/scripts/register-gateway.sh on the host."
            />
          )}
        </Card>
      </Section>
    </div>
  )
}
