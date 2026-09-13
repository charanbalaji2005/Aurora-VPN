'use client'

import {useEffect, useState} from 'react'
import Link from 'next/link'
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Download,
  HardDrive,
  KeyRound,
  Laptop,
  Loader2,
  Plus,
  RefreshCw,
  RotateCw,
  Smartphone,
  Trash2,
} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card'
import {Badge} from '@/components/ui/badge'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select'
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle} from '@/components/ui/dialog'
import {Alert, AlertDescription} from '@/components/ui/alert'
import {consumerApi, ConsumerDevice, ServerLocation} from '@/lib/api'
import {downloadConfigFile, formatWireGuardConfig, generateWireGuardKeyPair} from '@/lib/wireguard-crypto'

export default function DevicesPage() {
  const [devices, setDevices] = useState<ConsumerDevice[]>([])
  const [servers, setServers] = useState<ServerLocation[]>([])
  const [loading, setLoading] = useState(true)
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [deviceName, setDeviceName] = useState('')
  const [platform, setPlatform] = useState('desktop')
  const [selectedGatewayId, setSelectedGatewayId] = useState('')
  const [creating, setCreating] = useState(false)
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [rotatingId, setRotatingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      const [dList, sList] = await Promise.all([
        consumerApi.devices(),
        consumerApi.servers(),
      ])
      setDevices(dList.devices)
      setServers(sList.servers)
      if (sList.servers.length > 0) {
        setSelectedGatewayId(sList.servers[0].gateway_id)
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load devices.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleCreateDevice = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!deviceName.trim()) {
      setError('Please enter a device name.')
      return
    }
    setCreating(true)
    setError(null)
    setSuccess(null)
    try {
      // 1. Generate client Curve25519 WireGuard key pair in the browser
      const keypair = await generateWireGuardKeyPair()

      // 2. Register device with its public key
      const registeredDevice = await consumerApi.registerDevice(
        deviceName.trim(),
        keypair.publicKey,
        platform,
      )

      // 3. If a server is selected, start a session to provision the tunnel config
      if (selectedGatewayId) {
        const sessionResult = await consumerApi.startSession(registeredDevice.id, selectedGatewayId)
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
        downloadConfigFile(`aurora-${deviceName.toLowerCase().replace(/\s+/g, '-')}.conf`, confText)
        setSuccess(`Device "${deviceName}" added and WireGuard configuration downloaded!`)
      } else {
        setSuccess(`Device "${deviceName}" registered successfully.`)
      }

      setAddModalOpen(false)
      setDeviceName('')
      loadData()
    } catch (err: any) {
      setError(err?.message || 'Failed to register device.')
    } finally {
      setCreating(false)
    }
  }

  const handleRevokeDevice = async (deviceId: string) => {
    if (!confirm('Are you sure you want to revoke this device? It will immediately disconnect from the VPN.')) {
      return
    }
    setRevokingId(deviceId)
    setError(null)
    try {
      await consumerApi.revokeDevice(deviceId)
      setSuccess('Device revoked successfully.')
      loadData()
    } catch (err: any) {
      setError(err?.message || 'Failed to revoke device.')
    } finally {
      setRevokingId(null)
    }
  }

  const handleRotateKey = async (deviceId: string) => {
    setRotatingId(deviceId)
    setError(null)
    try {
      const keypair = await generateWireGuardKeyPair()
      await consumerApi.rotateDeviceKey(deviceId, keypair.publicKey)
      setSuccess('WireGuard key pair rotated successfully! Download a new config to connect.')
      loadData()
    } catch (err: any) {
      setError(err?.message || 'Failed to rotate key.')
    } finally {
      setRotatingId(null)
    }
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
            <h1 className="text-2xl font-bold tracking-tight">Connected Devices</h1>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Manage your authorized WireGuard peers and generate client configurations.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            disabled={loading}
            className="gap-1.5 text-xs">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>

          <Button
            size="sm"
            onClick={() => setAddModalOpen(true)}
            className="gap-1.5 text-xs font-semibold">
            <Plus className="h-4 w-4" />
            Add Device
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert className="border-status-operational/40 bg-status-operational/10 text-status-operational">
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}

      {/* Device List */}
      {devices.length === 0 ? (
        <Card className="p-8 text-center border-dashed border-border/70">
          <HardDrive className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-50" />
          <h3 className="text-sm font-semibold">No Devices Registered</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
            Add your PC, Mac, iPhone, or Android device to download its official WireGuard configuration.
          </p>
          <Button
            size="sm"
            onClick={() => setAddModalOpen(true)}
            className="mt-4 gap-1.5 text-xs">
            <Plus className="h-3.5 w-3.5" />
            Add First Device
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {devices.map(device => {
            const isMobile = device.platform?.toLowerCase().includes('android') || device.platform?.toLowerCase().includes('ios')
            return (
              <Card key={device.id} className="border-border/70 hover:border-border transition-colors flex flex-col justify-between">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center border border-primary/20">
                        {isMobile ? <Smartphone className="h-5 w-5" /> : <Laptop className="h-5 w-5" />}
                      </div>
                      <div>
                        <CardTitle className="text-sm font-semibold">{device.name}</CardTitle>
                        <CardDescription className="text-3xs uppercase tracking-wider">
                          {device.platform || 'WireGuard Client'}
                        </CardDescription>
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className={`text-3xs px-1.5 py-0 ${
                        device.revoked
                          ? 'border-status-down/40 text-status-down'
                          : 'border-status-operational/40 text-status-operational'
                      }`}>
                      {device.revoked ? 'REVOKED' : 'ACTIVE'}
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent className="space-y-2 text-2xs text-muted-foreground pb-3">
                  <div className="flex justify-between">
                    <span>Registered:</span>
                    <span className="font-mono">{new Date(device.created_at).toLocaleDateString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Device ID:</span>
                    <span className="font-mono text-3xs truncate max-w-[140px]">{device.id}</span>
                  </div>
                </CardContent>

                <div className="border-t border-border/40 p-3 flex items-center justify-between gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRotateKey(device.id)}
                    disabled={rotatingId === device.id || device.revoked}
                    className="h-7 text-3xs gap-1">
                    <RotateCw className={`h-3 w-3 ${rotatingId === device.id ? 'animate-spin' : ''}`} />
                    Rotate Key
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRevokeDevice(device.id)}
                    disabled={revokingId === device.id || device.revoked}
                    className="h-7 text-3xs gap-1 text-destructive hover:bg-destructive/10">
                    <Trash2 className="h-3 w-3" />
                    Revoke
                  </Button>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* Add Device Dialog */}
      <Dialog open={addModalOpen} onOpenChange={setAddModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Add WireGuard Device</DialogTitle>
            <DialogDescription className="text-xs">
              Generate a client Curve25519 keypair and download its ready-to-import WireGuard configuration.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateDevice} className="space-y-3.5 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="new-device-name" className="text-xs">Device Name</Label>
              <Input
                id="new-device-name"
                placeholder="e.g. Work MacBook, Windows PC, iPad"
                value={deviceName}
                onChange={e => setDeviceName(e.target.value)}
                required
                className="h-8 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="new-device-platform" className="text-xs">Platform</Label>
              <Select value={platform} onValueChange={setPlatform}>
                <SelectTrigger id="new-device-platform" className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="desktop" className="text-xs">Desktop / Laptop (Windows, Mac, Linux)</SelectItem>
                  <SelectItem value="mobile" className="text-xs">Mobile (Android, iOS)</SelectItem>
                  <SelectItem value="router" className="text-xs">Home Router / Gateway</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="new-device-server" className="text-xs">Default Server Location</Label>
              <Select value={selectedGatewayId} onValueChange={setSelectedGatewayId}>
                <SelectTrigger id="new-device-server" className="h-8 text-xs">
                  <SelectValue placeholder="Choose server..." />
                </SelectTrigger>
                <SelectContent>
                  {servers.map(server => (
                    <SelectItem key={server.gateway_id} value={server.gateway_id} className="text-xs">
                      {server.city}, {server.country} &middot; {server.gateway_id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-lg border border-primary/20 bg-primary/5 p-2.5 text-2xs text-muted-foreground flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-primary shrink-0" />
              <span>Private key is generated locally in your browser and never sent over the network.</span>
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setAddModalOpen(false)}
                className="text-xs">
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={creating}
                className="gap-2 text-xs">
                {creating ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Download className="h-3.5 w-3.5" />
                    Register &amp; Download .conf
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
