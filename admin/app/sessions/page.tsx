'use client'

import {useState} from 'react'
import {Activity, RefreshCw} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {Card} from '@/components/ui/card'
import {Input} from '@/components/ui/input'
import {Sheet, SheetContent, SheetHeader, SheetTitle} from '@/components/ui/sheet'
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table'
import {ConfirmDialog} from '@/components/shared/confirm-dialog'
import {PageHeader} from '@/components/shared/page'
import {StatusBadge} from '@/components/shared/status-badge'
import {EmptyState, ErrorState, TableSkeleton} from '@/components/shared/states'
import {useIdentity} from '@/components/layout/identity'
import {api} from '@/lib/api'
import type {SessionRow} from '@/lib/api'
import {EM_DASH, formatBytes, formatDuration, formatRelative, formatTime} from '@/lib/format'
import {useApi} from '@/lib/use-api'

export default function SessionsPage() {
  const {can} = useIdentity()
  const [activeOnly, setActiveOnly] = useState(true)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<SessionRow | null>(null)
  const [confirming, setConfirming] = useState<SessionRow | null>(null)

  const sessions = useApi<{sessions: SessionRow[]; total: number}>(
    `/admin/sessions?active_only=${activeOnly}&limit=200`,
    {pollMs: activeOnly ? 10000 : undefined},
  )

  const rows = (sessions.data?.sessions ?? []).filter(row => {
    const needle = query.trim().toLowerCase()
    if (!needle) return true
    return (
      row.user_email?.toLowerCase().includes(needle) ||
      row.gateway_id.toLowerCase().includes(needle) ||
      row.id.includes(needle)
    )
  })

  return (
    <div className="space-y-5">
      <PageHeader
        title="Sessions"
        description="Live VPN sessions. Terminating one removes the WireGuard peer first, so the tunnel is gone before the record closes."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setActiveOnly(v => !v)}>
              {activeOnly ? 'Show all' : 'Active only'}
            </Button>
            <Button variant="outline" size="sm" onClick={sessions.refresh} disabled={sessions.refreshing}>
              <RefreshCw className={sessions.refreshing ? 'animate-spin' : ''} />
              Refresh
            </Button>
          </>
        }
      />

      <Input
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Filter by account, gateway or session id"
        className="max-w-sm"
      />

      <Card>
        {sessions.loading ? (
          <TableSkeleton columns={7} />
        ) : sessions.error ? (
          <ErrorState error={sessions.error} onRetry={sessions.refresh} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Activity}
            title={activeOnly ? 'No active sessions' : 'No sessions recorded'}
            body={
              activeOnly
                ? 'Nobody is connected right now. Sessions appear here the moment a client is authorised.'
                : 'Sessions appear here once clients have connected.'
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead>Gateway</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Traffic</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(row => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer"
                  onClick={() => setSelected(row)}>
                  <TableCell>
                    <p className="truncate">{row.user_email ?? EM_DASH}</p>
                    <p className="font-mono text-2xs text-muted-foreground">{row.id.slice(-10)}</p>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{row.gateway_id}</TableCell>
                  <TableCell>
                    <StatusBadge status={row.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatRelative(row.started_at)}</TableCell>
                  <TableCell className="tabular">{formatDuration(row.duration_seconds)}</TableCell>
                  <TableCell className="tabular">
                    {formatBytes(row.bytes_down)} ↓ {formatBytes(row.bytes_up)} ↑
                  </TableCell>
                  <TableCell className="text-right">
                    {can('write:session_terminate') && row.status !== 'COMPLETED' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={event => {
                          event.stopPropagation()
                          setConfirming(row)
                        }}>
                        Terminate
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Sheet open={!!selected} onOpenChange={open => !open && setSelected(null)}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Session detail</SheetTitle>
            <p className="font-mono text-2xs text-muted-foreground">{selected?.id}</p>
          </SheetHeader>
          {selected && (
            <dl className="space-y-3 p-5 text-xs">
              {[
                ['Account', selected.user_email ?? EM_DASH],
                ['Device', selected.device_id],
                ['Gateway', selected.gateway_id],
                ['Status', selected.status],
                ['Started', formatTime(selected.started_at)],
                ['Duration', formatDuration(selected.duration_seconds)],
                ['Received', formatBytes(selected.bytes_down)],
                ['Sent', formatBytes(selected.bytes_up)],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4 border-b pb-2">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="tabular text-right">{value}</dd>
                </div>
              ))}
              <p className="pt-2 text-2xs text-muted-foreground">
                Byte counters and duration only. Destinations are not recorded anywhere in this
                system, so there is nothing further to show.
              </p>
            </dl>
          )}
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={!!confirming}
        onOpenChange={open => !open && setConfirming(null)}
        title="Terminate this session?"
        description={`${confirming?.user_email ?? 'This account'} will be disconnected from ${confirming?.gateway_id}. Their WireGuard peer is removed immediately.`}
        actionLabel="Terminate"
        requireMfa={false}
        onConfirm={async ({reason}) => {
          await api(`/admin/sessions/${confirming!.id}/terminate`, {
            method: 'POST',
            body: {reason},
          })
          sessions.refresh()
        }}
      />
    </div>
  )
}
