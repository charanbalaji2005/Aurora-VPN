'use client'

import {useEffect, useState} from 'react'
import Link from 'next/link'
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  ExternalLink,
  Globe2,
  HardDrive,
  KeyRound,
  Loader2,
  RefreshCw,
  Server,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle} from '@/components/ui/card'
import {Badge} from '@/components/ui/badge'
import {Progress} from '@/components/ui/progress'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select'
import {Alert, AlertDescription} from '@/components/ui/alert'
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle} from '@/components/ui/dialog'
import {useIdentity} from '@/components/layout/identity'
import {consumerApi, ConsumerDevice, QuotaSnapshot, ServerLocation} from '@/lib/api'
import {downloadConfigFile, formatWireGuardConfig, generateWireGuardKeyPair} from '@/lib/wireguard-crypto'
import {formatDuration, formatPercent} from '@/lib/format'

export default function ConsumerPortalDashboard() {
  const {user} = useIdentity()
  const [quota, setQuota] = useState<QuotaSnapshot | null>(null)
  const [servers, setServers] = useState<ServerLocation[]>([])
  const [devices, setDevices] = useState<ConsumerDevice[]>([])
  const [selectedGatewayId, setSelectedGatewayId] = useState<string>('')
  const [deviceName, setDeviceName] = useState('My Computer')
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [configModalOpen, setConfigModalOpen] = useState(false)
  const [generatedConfig, setGeneratedConfig] = useState<string>('')
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refreshData = async () => {
    setLoading(true)
    setError(null)
    try {
      const [q, sList, dList] = await Promise.all([
        consumerApi.quota(),
        consumerApi.servers(),
        consumerApi.devices(),
      ])
      setQuota(q)
      setServers(sList.servers)
      if (sList.recommended_gateway_id) {
        setSelectedGatewayId(sList.recommended_gateway_id)
      } else if (sList.servers.length > 0) {
        setSelectedGatewayId(sList.servers[0].gateway_id)
      }
      setDevices(dList.devices)
    } catch (err: any) {
      setError(err?.message || 'Failed to load dashboard data.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refreshData()
  }, [])

  // One-click WireGuard config generator
  const handleGenerateConfig = async () => {
    if (!selectedGatewayId) {
      setError('Please select a server location.')
      return
    }
    setGenerating(true)
    setError(null)
    try {
      // 1. Generate client Curve25519 WireGuard key pair in the browser
      const keypair = await generateWireGuardKeyPair()

      // 2. Register device with its public key
      const registeredDevice = await consumerApi.registerDevice(
        deviceName || 'Web WireGuard Device',
        keypair.publicKey,
        'desktop',
      )

      // 3. Start session on the selected server
      const sessionResult = await consumerApi.startSession(registeredDevice.id, selectedGatewayId)

      // 4. Format client WireGuard config
      const confText = formatWireGuardConfig({
        privateKey: keypair.privateKey,
        address: sessionResult.config.interface.address,
        addressV6: sessionResult.config.interface.address_v6,
        dnsServers: sessionResult.config.interface.dns,
        mtu: sessionResult.config.interface.mtu,
        serverPublicKey: sessionResult.config.peer.public_key,
        presharedKey: sessionResult.config.peer.preshared_key,
        endpoint: sessionResult.config.peer.endpoint,
        allowedIPs: sessionResult.config.peer.allowed_ips,
        persistentKeepalive: sessionResult.config.peer.persistent_keepalive,
      })

      setGeneratedConfig(confText)
      setConfigModalOpen(true)

      // Trigger automatic file download
      const safeCity = sessionResult.server.city.toLowerCase().replace(/\s+/g, '-')
      downloadConfigFile(`aurora-${safeCity}.conf`, confText)

      // Refresh devices and quota
      refreshData()
    } catch (err: any) {
      setError(err?.message || 'Failed to generate WireGuard tunnel config.')
    } finally {
      setGenerating(false)
    }
  }

  const copyToClipboard = () => {
    if (!generatedConfig) return
    navigator.clipboard.writeText(generatedConfig)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const quotaPercent = quota
    ? quota.unlimited
      ? 100
      : Math.round(((quota.daily_seconds - quota.used_seconds) / quota.daily_seconds) * 100)
    : 100

  return (
    <div className="space-y-6">
      {/* Top Welcome & Status */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">Welcome, {user?.email.split('@')[0]}</h1>
            <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/20">
              {user?.plan === 'unlimited' ? 'PRO UNLIMITED' : 'FREE PLAN'}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Zero-logs WireGuard tunnel active. Your internet connection is secured.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={refreshData}
          disabled={loading}
          className="self-start sm:self-auto gap-1.5 text-xs">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Hero Grid: Quota Tracker & One-Click Config Generator */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Daily Quota Card */}
        <Card className="border-border/70 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <Clock className="h-28 w-28 text-primary" />
          </div>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Daily Allowance
              </span>
              <span className="text-2xs text-status-operational font-medium flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" /> Resets daily at 00:00 UTC
              </span>
            </div>
            <CardTitle className="text-3xl font-extrabold tracking-tight mt-1">
              {quota?.unlimited
                ? 'Unlimited Access'
                : quota
                ? formatDuration(quota.remaining_seconds)
                : '3h 00m'}
            </CardTitle>
            <CardDescription className="text-xs">
              {quota?.unlimited
                ? 'Your account has unmetered access to all high-speed servers.'
                : 'Free browsing time remaining today out of your 3-hour daily allocation.'}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {!quota?.unlimited && (
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Usage today: {quota ? formatDuration(quota.used_seconds) : '0s'}</span>
                  <span>{quotaPercent}% remaining</span>
                </div>
                <Progress value={quotaPercent} className="h-2" />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 pt-2 text-xs">
              <div className="rounded-lg border border-border/60 bg-muted/30 p-2.5">
                <span className="text-3xs text-muted-foreground uppercase font-medium">Daily Cap</span>
                <p className="font-mono text-sm font-semibold mt-0.5">
                  {quota?.unlimited ? '∞ Unlimited' : '3 Hours (10,800s)'}
                </p>
              </div>
              <div className="rounded-lg border border-border/60 bg-muted/30 p-2.5">
                <span className="text-3xs text-muted-foreground uppercase font-medium">Protocol</span>
                <p className="font-mono text-sm font-semibold mt-0.5 text-primary">
                  WireGuard (Kernel)
                </p>
              </div>
            </div>
          </CardContent>

          <CardFooter className="border-t border-border/40 pt-3 pb-3 text-2xs text-muted-foreground flex justify-between items-center">
            <span>Survives app reinstall &middot; counted server-side</span>
            <Link href="/portal/account" className="text-primary hover:underline flex items-center gap-1">
              Account details <ArrowRight className="h-3 w-3" />
            </Link>
          </CardFooter>
        </Card>

        {/* One-Click WireGuard Config Generator */}
        <Card className="border-border/70 shadow-sm border-primary/20 bg-gradient-to-b from-primary/5 to-transparent">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2 text-primary font-medium text-xs">
              <Sparkles className="h-4 w-4" />
              <span>Instant Setup</span>
            </div>
            <CardTitle className="text-xl font-bold">Download WireGuard Config</CardTitle>
            <CardDescription className="text-xs">
              Generate a client config file (.conf) ready to import into official WireGuard on Windows, Mac, Linux, iOS, or Android.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-3.5">
            <div className="space-y-1.5">
              <Label htmlFor="device-name" className="text-xs">Device Name</Label>
              <Input
                id="device-name"
                placeholder="e.g. My Laptop"
                value={deviceName}
                onChange={e => setDeviceName(e.target.value)}
                className="h-8 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="server-select" className="text-xs">Select VPN Server Location</Label>
              <Select value={selectedGatewayId} onValueChange={setSelectedGatewayId}>
                <SelectTrigger id="server-select" className="h-8 text-xs">
                  <SelectValue placeholder="Choose a server..." />
                </SelectTrigger>
                <SelectContent>
                  {servers.map(server => (
                    <SelectItem key={server.gateway_id} value={server.gateway_id} className="text-xs">
                      {server.city}, {server.country} &middot; {server.gateway_id} ({formatPercent(server.load)} load)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              onClick={handleGenerateConfig}
              disabled={generating || !selectedGatewayId}
              className="w-full h-9 gap-2 text-xs font-semibold shadow-sm mt-1">
              {generating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating WireGuard Keypair...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  Generate &amp; Download .conf
                </>
              )}
            </Button>
          </CardContent>

          <CardFooter className="border-t border-border/40 pt-3 pb-3 text-2xs text-muted-foreground flex justify-between items-center">
            <span className="flex items-center gap-1">
              <KeyRound className="h-3 w-3 text-status-operational" />
              Private key never leaves your browser
            </span>
            <Link href="/portal/devices" className="text-primary hover:underline">
              Manage devices
            </Link>
          </CardFooter>
        </Card>
      </div>

      {/* Global Locations Quick View */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">Active Server Fleet</h2>
            <p className="text-2xs text-muted-foreground">High-speed WireGuard nodes carrying your encrypted traffic.</p>
          </div>
          <Link href="/portal/locations">
            <Button variant="ghost" size="sm" className="gap-1 text-xs text-primary">
              View all servers <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {servers.slice(0, 4).map(server => (
            <Card key={server.gateway_id} className="border-border/60 hover:border-primary/40 transition-colors p-3.5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-lg bg-muted flex items-center justify-center font-bold text-xs uppercase text-primary">
                    {server.country_code}
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold">{server.city}</h3>
                    <p className="text-3xs text-muted-foreground">{server.country}</p>
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className={`text-3xs px-1.5 py-0 ${
                    server.status === 'online'
                      ? 'border-status-operational/40 text-status-operational'
                      : 'border-status-degraded/40 text-status-degraded'
                  }`}>
                  {server.status}
                </Badge>
              </div>

              <div className="mt-3 flex items-center justify-between text-2xs text-muted-foreground pt-2 border-t border-border/40">
                <span>Load: {formatPercent(server.load)}</span>
                <button
                  onClick={() => {
                    setSelectedGatewayId(server.gateway_id)
                    handleGenerateConfig()
                  }}
                  className="text-primary hover:underline font-medium">
                  Connect &rarr;
                </button>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* My Connected Devices Quick View */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">Registered Devices</h2>
            <p className="text-2xs text-muted-foreground">Authorized WireGuard peers on your account.</p>
          </div>
          <Link href="/portal/devices">
            <Button variant="ghost" size="sm" className="gap-1 text-xs text-primary">
              Manage all <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>

        {devices.length === 0 ? (
          <Card className="p-6 text-center border-dashed border-border/70">
            <HardDrive className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-50" />
            <p className="text-xs font-medium">No devices registered yet</p>
            <p className="text-2xs text-muted-foreground mt-0.5">
              Click &quot;Generate &amp; Download .conf&quot; above to register your first device.
            </p>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {devices.map(device => (
              <Card key={device.id} className="p-3 border-border/60 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                    <HardDrive className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold">{device.name}</h4>
                    <p className="text-3xs text-muted-foreground">
                      Added {new Date(device.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <Badge variant="outline" className="text-3xs border-status-operational/40 text-status-operational">
                  ACTIVE
                </Badge>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Config Preview Modal */}
      <Dialog open={configModalOpen} onOpenChange={setConfigModalOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className="h-5 w-5 text-status-operational" />
              WireGuard Configuration Generated
            </DialogTitle>
            <DialogDescription className="text-xs">
              Your config has been saved to your downloads. You can also copy the configuration directly below into your WireGuard client.
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
