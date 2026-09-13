'use client'

import {useState} from 'react'
import Link from 'next/link'
import {AlertTriangle, RefreshCw} from 'lucide-react'
import {Alert, AlertDescription, AlertTitle} from '@/components/ui/alert'
import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {Progress} from '@/components/ui/progress'
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table'
import {ConfirmDialog} from '@/components/shared/confirm-dialog'
import {MetricCard} from '@/components/shared/metric-card'
import {PageHeader, Section} from '@/components/shared/page'
import {StatusBadge} from '@/components/shared/status-badge'
import {CardsSkeleton, EmptyState, ErrorState} from '@/components/shared/states'
import {useIdentity} from '@/components/layout/identity'
import {api} from '@/lib/api'
import type {Gateway, Overview, SessionRow} from '@/lib/api'
import {EM_DASH, formatBytes, formatDuration, formatNumber, formatPercent, formatRelative} from '@/lib/format'
import {useApi} from '@/lib/use-api'

/**
 * One screen for an incident: what is up, who is on it, and the two levers
 * worth pulling. Everything destructive still goes through the same typed
 * confirmation and MFA as it does on the gateway page — there are no
 * one-click fleet actions here.
 */
export default function ControlCenterPage() {
  const {can} = useIdentity()
  const overview = useApi<Overview>('/admin/overview', {pollMs: 10000})
  const gateways = useApi<{gateways: Gateway[]}>('/admin/gateways', {pollMs: 10000})
  const sessions = useApi<{sessions: SessionRow[]}>('/admin/sessions?active_only=true&limit=25', {
    pollMs: 10000,
  })
  const [draining, setDraining] = useState<Gateway | null>(null)

  const rows = gateways.data?.gateways ?? []
  const byRegion = rows.reduce<Record<string, Gateway[]>>((acc, gateway) => {
    ;(acc[gateway.country] ??= []).push(gateway)
    return acc
  }, {})

  return (
    <div className="space-y-6">
      <PageHeader
        title="Control Center"
        description="Live fleet state and the actions worth taking during an incident."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              overview.refresh()
              gateways.refresh()
              sessions.refresh()
            }}>
            <RefreshCw /> Refresh
          </Button>
        }
      />

      {overview.loading ? (
        <CardsSkeleton />
      ) : overview.error ? (
        <Card>
          <ErrorState error={overview.error} onRetry={overview.refresh} />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Active sessions"
            value={formatNumber(overview.data!.sessions_active)}
            tone="operational"
          />
          <MetricCard
            label="Gateways online"
            value={`${overview.data!.gateways_online} / ${overview.data!.gateways_total}`}
            tone={overview.data!.gateways_online < overview.data!.gateways_total ? 'degraded' : 'operational'}
          />
          <MetricCard label="Average load" value={formatPercent(overview.data!.gateway_load_average)} />
          <MetricCard
            label="Traffic today"
            value={formatBytes(overview.data!.bytes_down_today + overview.data!.bytes_up_today)}
          />
        </div>
      )}

      <Section title="Regions">
        {rows.length === 0 ? (
          <Card>
            <EmptyState title="No gateways registered" body="Register a gateway to see regional status." />
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Object.entries(byRegion).map(([country, group]) => {
              const online = group.filter(g => g.effective_status === 'online').length
              const load = Math.round(group.reduce((sum, g) => sum + g.load_percent, 0) / group.length)
              return (
                <Card key={country}>
                  <CardHeader className="pb-2">
                    <CardTitle>{country}</CardTitle>
                    <p className="text-2xs text-muted-foreground">
                      {online} of {group.length} online
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <Progress
                      value={load}
                      indicatorClassName={
                        load > 80 ? 'bg-status-down' : load > 50 ? 'bg-status-degraded' : 'bg-status-operational'
                      }
                    />
                    <p className="tabular text-2xs text-muted-foreground">{load}% average load</p>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </Section>

      <Section title="Gateway fleet">
        <Card>
          {gateways.error ? (
            <ErrorState error={gateways.error} onRetry={gateways.refresh} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Gateway</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Load</TableHead>
                  <TableHead>Peers</TableHead>
                  <TableHead>Heartbeat</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(gateway => (
                  <TableRow key={gateway.gateway_id}>
                    <TableCell>
                      <Link href={`/gateways/${gateway.gateway_id}`} className="hover:underline">
                        {gateway.city}
                      </Link>
                      <p className="font-mono text-2xs text-muted-foreground">{gateway.gateway_id}</p>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={gateway.effective_status} />
                    </TableCell>
                    <TableCell className="tabular">{formatPercent(gateway.load_percent)}</TableCell>
                    <TableCell className="tabular">{gateway.active_peers}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatRelative(gateway.health_reported_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      {can('write:gateway_drain') && (
                        <Button variant="outline" size="sm" onClick={() => setDraining(gateway)}>
                          Drain
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </Section>

      <Section title="Live sessions" description="Newest first, refreshed every ten seconds.">
        <Card>
          {sessions.error ? (
            <ErrorState error={sessions.error} onRetry={sessions.refresh} />
          ) : (sessions.data?.sessions.length ?? 0) === 0 ? (
            <EmptyState title="Nobody connected" body="Active sessions appear here as clients authorise." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead>Gateway</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Traffic</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.data!.sessions.map(row => (
                  <TableRow key={row.id}>
                    <TableCell className="max-w-[220px] truncate">{row.user_email ?? EM_DASH}</TableCell>
                    <TableCell className="font-mono text-xs">{row.gateway_id}</TableCell>
                    <TableCell className="tabular">{formatDuration(row.duration_seconds)}</TableCell>
                    <TableCell className="tabular">
                      {formatBytes(row.bytes_down + row.bytes_up)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </Section>

      <Alert variant="warning">
        <AlertTriangle />
        <AlertTitle>Emergency controls are per gateway, on purpose</AlertTitle>
        <AlertDescription>
          There is no fleet-wide kill switch in this console. Taking the whole service down should
          be a sequence of deliberate, individually confirmed decisions, each with a name and a
          reason against it.
        </AlertDescription>
      </Alert>

      <ConfirmDialog
        open={!!draining}
        onOpenChange={open => !open && setDraining(null)}
        title={`Drain ${draining?.gateway_id}?`}
        description="New sessions stop immediately and everyone currently connected is moved off. Their peers are removed before the session records close."
        confirmation={`DRAIN ${draining?.gateway_id.toUpperCase()}`}
        actionLabel="Drain gateway"
        onConfirm={async ({reason, stepUpToken}) => {
          await api(`/admin/gateways/${draining!.gateway_id}/operations/drain`, {
            method: 'POST',
            body: {
              reason,
              confirmation: `DRAIN ${draining!.gateway_id.toUpperCase()}`,
              step_up_token: stepUpToken,
            },
          })
          gateways.refresh()
          sessions.refresh()
        }}
      />
    </div>
  )
}
