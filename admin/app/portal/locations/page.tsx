'use client'

import {useEffect, useState} from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  CheckCircle2,
  Copy,
  Download,
  Globe2,
  Loader2,
  RefreshCw,
  Server,
  ShieldCheck,
  Zap,
} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card'
import {Badge} from '@/components/ui/badge'
import {Progress} from '@/components/ui/progress'
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle} from '@/components/ui/dialog'
import {Alert, AlertDescription} from '@/components/ui/alert'
import {consumerApi, ServerLocation} from '@/lib/api'
import {downloadConfigFile, formatWireGuardConfig, generateWireGuardKeyPair} from '@/lib/wireguard-crypto'
import {formatPercent} from '@/lib/format'

export default function ServerLocationsPage() {
  const [servers, setServers] = useState<ServerLocation[]>([])
  const [loading, setLoading] = useState(true)
  const [connectingGid, setConnectingGid] = useState<string | null>(null)
  const [generatedConfig, setGeneratedConfig] = useState<string>('')
  const [configModalOpen, setConfigModalOpen] = useState(false)
  const [selectedServerName, setSelectedServerName] = useState('')
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadServers = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await consumerApi.servers()
      setServers(res.servers)
    } catch (err: any) {
      setError(err?.message || 'Failed to load server locations.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadServers()
  }, [])

  const handleConnectServer = async (server: ServerLocation) => {
    setConnectingGid(server.gateway_id)
    setSelectedServerName(`${server.city}, ${server.country}`)
    setError(null)
    try {
      const keypair = await generateWireGuardKeyPair()
      const device = await consumerApi.registerDevice(
        `Web Client (${server.city})`,
        keypair.publicKey,
        'desktop',
      )
      const session = await consumerApi.startSession(device.id, server.gateway_id)
      const confText = formatWireGuardConfig({
        privateKey: keypair.privateKey,
        address: session.config.interface.address,
        addressV6: session.config.interface.address_v6,
        dnsServers: session.config.interface.dns,
        mtu: session.config.interface.mtu,
        serverPublicKey: session.config.peer.public_key,
        presharedKey: session.config.peer.preshared_key,
        endpoint: session.config.peer.endpoint,
        allowedIPs: session.config.peer.allowed_ips,
        persistentKeepalive: session.config.peer.persistent_keepalive,
      })

      setGeneratedConfig(confText)
      setConfigModalOpen(true)
      const safeCity = server.city.toLowerCase().replace(/\s+/g, '-')
      downloadConfigFile(`aurora-${safeCity}.conf`, confText)
    } catch (err: any) {
      setError(err?.message || `Failed to connect to ${server.city}`)
    } finally {
      setConnectingGid(null)
    }
  }

  const copyToClipboard = () => {
    if (!generatedConfig) return
    navigator.clipboard.writeText(generatedConfig)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/portal" className="text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <h1 className="text-2xl font-bold tracking-tight">Global Server Fleet</h1>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Choose any high-speed WireGuard node to route your encrypted traffic.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={loadServers}
          disabled={loading}
          className="self-start sm:self-auto gap-1.5 text-xs">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh Nodes
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Grid of Locations */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {servers.map(server => (
          <Card key={server.gateway_id} className="border-border/70 hover:border-primary/50 transition-all flex flex-col justify-between">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary font-bold text-xs uppercase flex items-center justify-center border border-primary/20">
                    {server.country_code}
                  </div>
                  <div>
                    <CardTitle className="text-sm font-semibold">{server.city}</CardTitle>
                    <CardDescription className="text-2xs">{server.country}</CardDescription>
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className={`text-3xs px-1.5 py-0 ${
                    server.status === 'online'
                      ? 'border-status-operational/40 text-status-operational'
                      : 'border-status-degraded/40 text-status-degraded'
                  }`}>
                  {server.status.toUpperCase()}
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="space-y-3 pb-3">
              <div className="space-y-1">
                <div className="flex justify-between text-2xs text-muted-foreground">
                  <span>Server Capacity Load</span>
                  <span className="font-mono">{formatPercent(server.load)}</span>
                </div>
                <Progress value={server.load || 5} className="h-1.5" />
              </div>

              <div className="grid grid-cols-2 gap-2 text-3xs text-muted-foreground pt-1">
                <div className="rounded border border-border/50 bg-muted/20 p-1.5">
                  <span>Gateway ID</span>
                  <p className="font-mono font-medium text-foreground truncate">{server.gateway_id}</p>
                </div>
                <div className="rounded border border-border/50 bg-muted/20 p-1.5">
                  <span>Port</span>
                  <p className="font-mono font-medium text-foreground">{server.listen_port || 51820}</p>
                </div>
              </div>
            </CardContent>

            <div className="p-4 pt-0 border-t border-border/40 mt-2">
              <Button
                size="sm"
                onClick={() => handleConnectServer(server)}
                disabled={connectingGid === server.gateway_id}
                className="w-full gap-2 text-xs h-8 mt-3">
                {connectingGid === server.gateway_id ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Download className="h-3.5 w-3.5" />
                    Download .conf
                  </>
                )}
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {/* Config Preview Modal */}
      <Dialog open={configModalOpen} onOpenChange={setConfigModalOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className="h-5 w-5 text-status-operational" />
              {selectedServerName} WireGuard Config
            </DialogTitle>
            <DialogDescription className="text-xs">
              Configuration downloaded to your computer. Import into WireGuard client to connect.
            </DialogDescription>
          </DialogHeader>

          <div className="relative my-2 rounded-lg border border-border/80 bg-zinc-950 p-3.5 font-mono text-2xs text-zinc-100 max-h-60 overflow-y-auto">
            <pre className="whitespace-pre-wrap select-all">{generatedConfig}</pre>
          </div>

          <div className="flex items-center justify-between pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={copyToClipboard}
              className="gap-1.5 text-xs">
              {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-status-operational" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copied to Clipboard!' : 'Copy Config'}
            </Button>
            <Button
              size="sm"
              onClick={() => setConfigModalOpen(false)}
              className="text-xs">
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
