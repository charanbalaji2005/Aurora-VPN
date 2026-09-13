'use client'

import {Card} from '@/components/ui/card'
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table'
import {PageHeader} from '@/components/shared/page'
import {EmptyState, ErrorState, TableSkeleton} from '@/components/shared/states'
import {EM_DASH, formatTime} from '@/lib/format'
import {useApi} from '@/lib/use-api'

type AuditEvent = {
  id: string
  event: string
  actor_id: string | null
  actor_type: string
  target: string | null
  metadata: Record<string, unknown>
  created_at: string
}

export default function AuditPage() {
  const audit = useApi<{events: AuditEvent[]}>('/admin/audit?limit=200')

  return (
    <div className="space-y-5">
      <PageHeader
        title="Audit log"
        description="Administrative and security events, kept for 90 days. Browsing activity is not recorded here or anywhere else."
      />

      <Card>
        {audit.loading ? (
          <TableSkeleton columns={5} />
        ) : audit.error ? (
          <ErrorState error={audit.error} onRetry={audit.refresh} />
        ) : audit.data!.events.length === 0 ? (
          <EmptyState title="Nothing recorded yet" body="Sign-ins and administrative actions appear here." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Detail</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {audit.data!.events.map(event => (
                <TableRow key={event.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatTime(event.created_at)}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{event.event}</TableCell>
                  <TableCell className="font-mono text-2xs text-muted-foreground">
                    {event.actor_id ? event.actor_id.slice(-8) : event.actor_type}
                  </TableCell>
                  <TableCell className="font-mono text-2xs">{event.target ?? EM_DASH}</TableCell>
                  <TableCell className="max-w-[280px] truncate text-2xs text-muted-foreground">
                    {String(event.metadata?.reason ?? JSON.stringify(event.metadata ?? {}).slice(0, 80))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  )
}
