'use client'

import {useState} from 'react'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {Tabs, TabsList, TabsTrigger} from '@/components/ui/tabs'
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table'
import {MetricCard} from '@/components/shared/metric-card'
import {PageHeader} from '@/components/shared/page'
import {CardsSkeleton, EmptyState, ErrorState} from '@/components/shared/states'
import {CategoryChart, SeriesChart} from '@/components/dashboard/charts'
import type {Analytics} from '@/lib/api'
import {formatBytes, formatDuration, formatNumber} from '@/lib/format'
import {useApi} from '@/lib/use-api'

export default function AnalyticsPage() {
  const [days, setDays] = useState('14')
  const analytics = useApi<Analytics>(`/admin/analytics?days=${days}`)

  const totals = (analytics.data?.days ?? []).reduce(
    (acc, day) => ({
      sessions: acc.sessions + day.sessions,
      seconds: acc.seconds + day.duration_seconds,
      bytes: acc.bytes + day.bytes_up + day.bytes_down,
    }),
    {sessions: 0, seconds: 0, bytes: 0},
  )

  return (
    <div className="space-y-5">
      <PageHeader
        title="Traffic & usage"
        description="Aggregated from completed sessions. Durations and byte totals only — no destinations are recorded anywhere in this system."
        actions={
          <Tabs value={days} onValueChange={setDays}>
            <TabsList>
              <TabsTrigger value="7">7d</TabsTrigger>
              <TabsTrigger value="14">14d</TabsTrigger>
              <TabsTrigger value="30">30d</TabsTrigger>
            </TabsList>
          </Tabs>
        }
      />

      {analytics.loading ? (
        <CardsSkeleton count={3} />
      ) : analytics.error ? (
        <Card>
          <ErrorState error={analytics.error} onRetry={analytics.refresh} />
        </Card>
      ) : analytics.data!.days.length === 0 ? (
        <Card>
          <EmptyState
            title="No completed sessions in this window"
            body="A session is counted when it ends, so this fills in as people disconnect."
          />
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <MetricCard label="Sessions" value={formatNumber(totals.sessions)} hint={`last ${days} days`} />
            <MetricCard label="VPN time delivered" value={formatDuration(totals.seconds)} />
            <MetricCard label="Traffic" value={formatBytes(totals.bytes)} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Traffic per day</CardTitle>
            </CardHeader>
            <CardContent>
              <SeriesChart
                data={analytics.data!.days}
                keys={[
                  {key: 'bytes_down', label: 'Received', color: 'hsl(var(--status-operational))'},
                  {key: 'bytes_up', label: 'Sent', color: 'hsl(var(--status-info))'},
                ]}
                format={value => formatBytes(value)}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Sessions per day</CardTitle>
            </CardHeader>
            <CardContent>
              <CategoryChart data={analytics.data!.days} xKey="date" valueKey="sessions" />
            </CardContent>
          </Card>

          <div className="grid gap-3 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>By gateway</CardTitle>
              </CardHeader>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Gateway</TableHead>
                    <TableHead>Sessions</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Traffic</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analytics.data!.gateways.map(row => (
                    <TableRow key={row.gateway_id}>
                      <TableCell className="font-mono text-xs">{row.gateway_id}</TableCell>
                      <TableCell className="tabular">{formatNumber(row.sessions)}</TableCell>
                      <TableCell className="tabular">{formatDuration(row.duration_seconds)}</TableCell>
                      <TableCell className="tabular">{formatBytes(row.bytes)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>How sessions ended</CardTitle>
                <p className="text-2xs text-muted-foreground">
                  A rising share of stale heartbeats or handshake timeouts is the earliest sign of a
                  gateway problem.
                </p>
              </CardHeader>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reason</TableHead>
                    <TableHead className="text-right">Count</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analytics.data!.end_reasons.map(row => (
                    <TableRow key={row.reason}>
                      <TableCell className="font-mono text-xs">{row.reason}</TableCell>
                      <TableCell className="tabular text-right">{formatNumber(row.count)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
