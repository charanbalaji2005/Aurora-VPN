'use client'

import {useRef, useState} from 'react'
import Link from 'next/link'
import {useParams} from 'next/navigation'
import {ArrowLeft, Download, Loader2, Radio, SquareTerminal, WifiOff} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {Progress} from '@/components/ui/progress'
import {Tabs, TabsContent, TabsList, TabsTrigger} from '@/components/ui/tabs'
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table'
import {Alert, AlertDescription, AlertTitle} from '@/components/ui/alert'
import {ConfirmDialog} from '@/components/shared/confirm-dialog'
import {MetricCard} from '@/components/shared/metric-card'
import {PageHeader} from '@/components/shared/page'
import {StatusBadge} from '@/components/shared/status-badge'
import {CardsSkeleton, EmptyState, ErrorState} from '@/components/shared/states'
import {useIdentity} from '@/components/layout/identity'
import {api, captureGatewayTraffic} from '@/lib/api'
import {downloadDemoPcap} from '@/lib/pcap-demo'
import type {Gateway, GatewayHealth} from '@/lib/api'
import {EM_DASH, formatLatency, formatPercent, formatRelative, formatTime} from '@/lib/format'
import {useApi} from '@/lib/use-api'

type Detail = {
  gateway: Gateway
  health: GatewayHealth
  peers_active: number
  sessions_active: number
  operations: {operation: string; permission: string; confirmation: string; allowed: boolean}[]
  recent_events: {id: string; event: string; created_at: string; metadata: Record<string, unknown>}[]
}

const DESCRIPTIONS: Record<string, string> = {
  'restart-wireguard': 'Restarts wg-quick@wg0. Every tunnel on this gateway drops and reconnects.',
  'restart-agent': 'Restarts the Aurora agent. Tunnels keep running; peer changes pause briefly.',
  drain: 'Stops new sessions and moves existing users off this gateway.',
  disable: 'Marks the gateway offline and ends its sessions.',
  enable: 'Returns the gateway to service.',
  'rotate-key': 'Generates a new gateway key. Every peer must be rebuilt, so all sessions end.',
}

export default function GatewayDetailPage() {
  const {id} = useParams<{id: string}>()
  const {can} = useIdentity()
  const detail = useApi<Detail>(`/admin/gateways/${id}`, {pollMs: 20000})
  const [operation, setOperation] = useState<Detail['operations'][number] | null>(null)

  // --- packet capture state -----------------------------------------------
  const [captureIface, setCaptureIface] = useState('wg0')
  const [captureDuration, setCaptureDuration] = useState(10)
  const [captureCount, setCaptureCount] = useState(500)
  const [captureFilter, setCaptureFilter] = useState('')
  const [capturing, setCapturing] = useState(false)
  const [captureCountdown, setCaptureCountdown] = useState(0)
  const [captureResult, setCaptureResult] = useState<{filename: string; sizeBytes: number} | null>(null)
  const [captureError, setCaptureError] = useState<string | null>(null)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const startCapture = async () => {
    if (capturing) return
    setCapturing(true)
    setCaptureResult(null)
    setCaptureError(null)
    setCaptureCountdown(captureDuration)

    // Live countdown
    countdownRef.current = setInterval(() => {
      setCaptureCountdown(prev => {
        if (prev <= 1) {
          if (countdownRef.current) clearInterval(countdownRef.current)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    try {
      const result = await captureGatewayTraffic(id, {
        interface: captureIface,
        duration: captureDuration,
        count: captureCount,
        filter: captureFilter || undefined,
      })
      setCaptureResult(result)
    } catch (err: any) {
      setCaptureError(err?.message ?? 'Capture failed')
    } finally {
      if (countdownRef.current) clearInterval(countdownRef.current)
      setCapturing(false)
      setCaptureCountdown(0)
    }
  }

  if (detail.loading) return <CardsSkeleton count={4} />
  if (detail.error)
    return (
      <Card>
        <ErrorState error={detail.error} onRetry={detail.refresh} />
      </Card>
    )

  const {gateway, health} = detail.data!

  return (
    <div className="space-y-5">
      <Button variant="ghost" size="sm" asChild className="-ml-2 text-muted-foreground">
        <Link href="/gateways">
          <ArrowLeft /> Gateways
        </Link>
      </Button>

      <PageHeader
        title={`${gateway.city}, ${gateway.country}`}
        description={`${gateway.gateway_id} · ${gateway.endpoint_host || 'endpoint not registered'}:${gateway.listen_port}`}
        actions={
          <>
            <StatusBadge status={gateway.effective_status} />
            {can('write:terminal') && (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/terminal?gateway=${gateway.gateway_id}`}>
                  <SquareTerminal /> Terminal
                </Link>
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Active sessions" value={String(detail.data!.sessions_active)} />
        <MetricCard
          label="WireGuard peers"
          value={`${detail.data!.peers_active} / ${gateway.capacity}`}
          hint="installed on the interface"
        />
        <MetricCard label="Load" value={formatPercent(gateway.load_percent)} />
        <MetricCard
          label="Last heartbeat"
          value={formatRelative(gateway.health_reported_at)}
          hint="offline after 90s of silence"
          tone={gateway.effective_status === 'online' ? 'operational' : 'degraded'}
        />
      </div>

      <Tabs defaultValue="health">
        <TabsList>
          <TabsTrigger value="health">Health</TabsTrigger>
          <TabsTrigger value="capture" className="gap-1.5"><Radio className="h-3 w-3" />Packet Capture</TabsTrigger>
          <TabsTrigger value="operations">Operations</TabsTrigger>
          <TabsTrigger value="configuration">Configuration</TabsTrigger>
          <TabsTrigger value="events">Events</TabsTrigger>
        </TabsList>

        <TabsContent value="health">
          <Card>
            <CardHeader>
              <CardTitle>Host</CardTitle>
              <p className="text-2xs text-muted-foreground">
                Reported by the agent {formatRelative(health?.at)}.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {!health ? (
                <EmptyState
                  title="No health report yet"
                  body="The agent posts CPU, memory, disk and peer counts every 30 seconds once it is running."
                />
              ) : (
                [
                  ['CPU', health.cpu_percent],
                  ['Memory', health.memory_percent],
                  ['Disk', health.disk_percent],
                ].map(([label, value]) => (
                  <div key={label as string} className="space-y-1">
                    <div className="flex justify-between text-2xs">
                      <span className="text-muted-foreground">{label}</span>
                      <span className="tabular">{formatPercent(value as number)}</span>
                    </div>
                    <Progress
                      value={value as number}
                      indicatorClassName={
                        (value as number) > 85
                          ? 'bg-status-down'
                          : (value as number) > 60
                            ? 'bg-status-degraded'
                            : 'bg-status-operational'
                      }
                    />
                  </div>
                ))
              )}
              {health && !health.wireguard_up && (
                <Alert variant="destructive">
                  <AlertTitle>WireGuard is not up on this host</AlertTitle>
                  <AlertDescription>
                    The interface is down, so no tunnel can be established here. Restarting
                    WireGuard is under Operations.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Packet Capture ─────────────────────────────────────────── */}
        <TabsContent value="capture">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Radio className="h-4 w-4 text-primary" />
                Wireshark Packet Capture
              </CardTitle>
              <p className="text-2xs text-muted-foreground">
                Runs <code className="font-mono bg-muted px-1 rounded">tcpdump</code> on the gateway for the
                chosen duration, then downloads a <code className="font-mono bg-muted px-1 rounded">.pcap</code> file
                you can open directly in Wireshark. Captures only packet metadata — Aurora never logs payload content.
              </p>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Interface selector */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium">Interface</label>
                  <select
                    id="capture-interface"
                    value={captureIface}
                    onChange={e => setCaptureIface(e.target.value)}
                    disabled={capturing}
                    className="w-full rounded-md border bg-background px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="wg0">wg0  (WireGuard tunnel)</option>
                    <option value="eth0">eth0 (external NIC)</option>
                    <option value="any">any  (all interfaces)</option>
                    <option value="lo">lo   (loopback)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium">
                    Duration: <span className="font-mono text-primary">{captureDuration}s</span>
                  </label>
                  <input
                    id="capture-duration"
                    type="range"
                    min={5}
                    max={60}
                    step={5}
                    value={captureDuration}
                    onChange={e => setCaptureDuration(Number(e.target.value))}
                    disabled={capturing}
                    className="w-full accent-primary"
                  />
                  <div className="flex justify-between text-2xs text-muted-foreground">
                    <span>5s</span><span>60s</span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium">Max packets</label>
                  <input
                    id="capture-count"
                    type="number"
                    min={10}
                    max={5000}
                    value={captureCount}
                    onChange={e => setCaptureCount(Number(e.target.value))}
                    disabled={capturing}
                    className="w-full rounded-md border bg-background px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium">
                    BPF filter{' '}
                    <span className="text-muted-foreground font-normal">(optional)</span>
                  </label>
                  <input
                    id="capture-filter"
                    type="text"
                    placeholder="e.g. udp port 51820"
                    value={captureFilter}
                    onChange={e => setCaptureFilter(e.target.value)}
                    disabled={capturing}
                    className="w-full rounded-md border bg-background px-3 py-1.5 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>

              {/* Start button + live countdown */}
              <div className="flex flex-wrap items-center gap-4">
                <button
                  id="capture-start-btn"
                  onClick={startCapture}
                  disabled={capturing || gateway.effective_status !== 'online'}
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {capturing ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Capturing on {captureIface} — {captureCountdown}s remaining…
                    </>
                  ) : (
                    <>
                      <Radio className="h-3.5 w-3.5" />
                      Start capture ({captureDuration}s)
                    </>
                  )}
                </button>

                {/* Demo download — works without a real gateway agent */}
                <button
                  id="capture-demo-btn"
                  onClick={() => {
                    const result = downloadDemoPcap(gateway.gateway_id)
                    setCaptureResult(result)
                    setCaptureError(null)
                  }}
                  disabled={capturing}
                  className="inline-flex items-center gap-2 rounded-md border border-dashed border-primary/40 px-4 py-2 text-xs font-medium text-primary hover:bg-primary/5 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  <Download className="h-3.5 w-3.5" />
                  Demo .pcap (no gateway needed)
                </button>

                {gateway.effective_status !== 'online' && (
                  <span className="flex items-center gap-1 text-xs text-amber-500">
                    <WifiOff className="h-3.5 w-3.5" /> Gateway is offline — use Demo to test
                  </span>
                )}
              </div>

              {/* Progress bar during capture */}
              {capturing && (
                <div className="space-y-1">
                  <Progress
                    value={Math.round(((captureDuration - captureCountdown) / captureDuration) * 100)}
                    className="h-1.5"
                    indicatorClassName="bg-primary transition-all duration-1000"
                  />
                  <p className="text-2xs text-muted-foreground">
                    tcpdump running on <code className="font-mono">{captureIface}</code>…
                  </p>
                </div>
              )}

              {/* Success result */}
              {captureResult && (
                <Alert className="border-green-500/30 bg-green-500/5">
                  <Download className="h-4 w-4 text-green-500" />
                  <AlertTitle className="text-green-600">Capture complete</AlertTitle>
                  <AlertDescription className="text-xs">
                    <span className="font-mono">{captureResult.filename}</span>{' '}
                    ({(captureResult.sizeBytes / 1024).toFixed(1)} KB) downloaded automatically.
                    Open it in <strong>Wireshark</strong> to inspect tunnel traffic.
                  </AlertDescription>
                </Alert>
              )}

              {/* Error */}
              {captureError && (
                <Alert variant="destructive">
                  <AlertTitle>Capture failed</AlertTitle>
                  <AlertDescription className="text-xs">{captureError}</AlertDescription>
                </Alert>
              )}

              {/* How-to */}
              <div className="rounded-md border bg-muted/30 p-3 text-2xs text-muted-foreground space-y-1">
                <p className="font-semibold text-foreground">How to use the .pcap file</p>
                <ol className="ml-4 list-decimal space-y-0.5">
                  <li>Click <em>Start capture</em> — tcpdump will run on the gateway for the chosen duration.</li>
                  <li>The <code className="font-mono">.pcap</code> file downloads automatically when complete.</li>
                  <li>Open the file in <strong>Wireshark</strong> (File → Open).</li>
                  <li>Use <code className="font-mono">wg0</code> to see decrypted tunnel packets; <code className="font-mono">eth0</code> shows encrypted WireGuard UDP datagrams on port 51820.</li>
                </ol>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="operations">
          <Card>
            <CardHeader>
              <CardTitle>Privileged operations</CardTitle>
              <p className="text-2xs text-muted-foreground">
                Each one needs your permission, a typed confirmation, a written reason and a fresh
                authenticator code. They are deliberately not available from the terminal.
              </p>
            </CardHeader>
            <CardContent className="space-y-2">
              {detail.data!.operations.map(item => (
                <div
                  key={item.operation}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
                  <div className="min-w-0">
                    <p className="font-mono text-xs">{item.operation}</p>
                    <p className="text-2xs text-muted-foreground">
                      {DESCRIPTIONS[item.operation] ?? 'Named gateway operation.'}
                    </p>
                  </div>
                  <Button
                    variant={item.operation === 'enable' ? 'outline' : 'destructive'}
                    size="sm"
                    disabled={!item.allowed}
                    title={item.allowed ? undefined : `Requires ${item.permission}`}
                    onClick={() => setOperation(item)}>
                    Run
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="configuration">
          <Card>
            <CardHeader>
              <CardTitle>Configuration</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-2 text-xs">
                {[
                  ['Gateway ID', gateway.gateway_id],
                  ['Endpoint', `${gateway.endpoint_host || EM_DASH}:${gateway.listen_port}`],
                  ['Declared status', gateway.status],
                  ['Effective status', gateway.effective_status],
                  ['Capacity', String(gateway.capacity)],
                  ['Median latency', formatLatency(gateway.median_latency_ms)],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between border-b pb-1.5">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="font-mono">{value}</dd>
                  </div>
                ))}
              </dl>
              <Alert className="mt-4">
                <AlertTitle>Keys are not shown here</AlertTitle>
                <AlertDescription>
                  The gateway&apos;s private key never leaves the host, and the API excludes agent
                  secrets from every response. There is nothing to reveal on this page.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="events">
          <Card>
            {detail.data!.recent_events.length === 0 ? (
              <EmptyState title="No recorded events" body="Operations against this gateway appear here." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead>Detail</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.data!.recent_events.map(event => (
                    <TableRow key={event.id}>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatTime(event.created_at)}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{event.event}</TableCell>
                      <TableCell className="text-2xs text-muted-foreground">
                        {String(event.metadata?.reason ?? '')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={!!operation}
        onOpenChange={open => !open && setOperation(null)}
        title={`Run ${operation?.operation} on ${gateway.gateway_id}?`}
        description={DESCRIPTIONS[operation?.operation ?? ''] ?? 'This affects live infrastructure.'}
        confirmation={operation?.confirmation}
        actionLabel="Run operation"
        onConfirm={async ({reason, stepUpToken}) => {
          await api(`/admin/gateways/${gateway.gateway_id}/operations/${operation!.operation}`, {
            method: 'POST',
            body: {reason, confirmation: operation!.confirmation, step_up_token: stepUpToken},
          })
          detail.refresh()
        }}
      />
    </div>
  )
}
