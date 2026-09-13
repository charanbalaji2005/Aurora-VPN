'use client'

import {useState} from 'react'
import {Smartphone} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {Card} from '@/components/ui/card'
import {Input} from '@/components/ui/input'
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table'
import {ConfirmDialog} from '@/components/shared/confirm-dialog'
import {PageHeader} from '@/components/shared/page'
import {StatusBadge} from '@/components/shared/status-badge'
import {EmptyState, ErrorState, TableSkeleton} from '@/components/shared/states'
import {useIdentity} from '@/components/layout/identity'
import {api} from '@/lib/api'
import type {DeviceRow} from '@/lib/api'
import {EM_DASH, formatRelative} from '@/lib/format'
import {useApi} from '@/lib/use-api'

export default function DevicesPage() {
  const {can} = useIdentity()
  const [query, setQuery] = useState('')
  const [revoking, setRevoking] = useState<DeviceRow | null>(null)

  const params = new URLSearchParams({limit: '100'})
  if (query.trim()) params.set('q', query.trim())
  const devices = useApi<{devices: DeviceRow[]; total: number}>(`/admin/devices?${params}`)

  return (
    <div className="space-y-5">
      <PageHeader
        title="Devices"
        description="One device, one WireGuard key. Revoking removes its peer from every gateway within a reconciliation cycle."
      />

      <Input
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Search by owner email"
        className="max-w-sm"
      />

      <Card>
        {devices.loading ? (
          <TableSkeleton columns={6} />
        ) : devices.error ? (
          <ErrorState error={devices.error} onRetry={devices.refresh} />
        ) : devices.data!.devices.length === 0 ? (
          <EmptyState
            icon={Smartphone}
            title="No devices registered"
            body="A device registers itself the first time someone signs in on the app."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Device</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>App</TableHead>
                <TableHead>Last seen</TableHead>
                <TableHead>State</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {devices.data!.devices.map(device => (
                <TableRow key={device.id}>
                  <TableCell>
                    <p>{device.name}</p>
                    <p className="text-2xs capitalize text-muted-foreground">{device.platform}</p>
                  </TableCell>
                  <TableCell className="max-w-[220px] truncate">{device.user_email ?? EM_DASH}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {device.app_version ?? EM_DASH}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatRelative(device.last_seen_at)}</TableCell>
                  <TableCell>
                    <StatusBadge
                      status={device.revoked ? 'revoked' : device.connected ? 'connected' : 'active'}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    {can('write:device_revoke') && !device.revoked && (
                      <Button variant="outline" size="sm" onClick={() => setRevoking(device)}>
                        Revoke
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <ConfirmDialog
        open={!!revoking}
        onOpenChange={open => !open && setRevoking(null)}
        title="Revoke this device?"
        description={`${revoking?.name} will lose its VPN access immediately and must be registered again from the app.`}
        actionLabel="Revoke"
        requireMfa={false}
        onConfirm={async ({reason}) => {
          await api(`/admin/devices/${revoking!.id}/revoke`, {method: 'POST', body: {reason}})
          devices.refresh()
        }}
      />
    </div>
  )
}
