/**
 * Client-side WireGuard key generation & configuration formatting.
 *
 * Private keys are generated entirely inside the user's browser and NEVER
 * transmitted to the server. Only the public half is registered.
 */

// Pure JS Curve25519 clamping & scalar multiplication helper for WireGuard
// Base64 encode 32-byte Uint8Array
function toBase64(bytes: Uint8Array): string {
  if (typeof window !== 'undefined' && window.btoa) {
    let binary = ''
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    return window.btoa(binary)
  }
  return Buffer.from(bytes).toString('base64')
}

// Curve25519 base point (9)
const GF_0 = BigInt(0)
const GF_1 = BigInt(1)
const P = (GF_1 << BigInt(255)) - BigInt(19)
const A24 = BigInt(121665)

function curve25519(scalar: Uint8Array, point: Uint8Array): Uint8Array {
  // Clamp scalar as required by RFC 7748
  const e = new Uint8Array(scalar)
  e[0] &= 248
  e[31] &= 127
  e[31] |= 64

  // Montgomery ladder
  let x1 = GF_0
  for (let i = 0; i < 32; i++) {
    x1 += BigInt(point[i]) << BigInt(8 * i)
  }
  x1 = x1 % P

  let x2 = GF_1
  let z2 = GF_0
  let x3 = x1
  let z3 = GF_1
  let swap = 0

  const cswap = (swapBit: number) => {
    if (swapBit) {
      const tx = x2; x2 = x3; x3 = tx
      const tz = z2; z2 = z3; z3 = tz
    }
  }

  const modP = (n: bigint) => {
    const m = n % P
    return m >= GF_0 ? m : m + P
  }

  const invP = (n: bigint) => {
    // Fermat's Little Theorem: n^(P-2) mod P
    let base = modP(n)
    let exp = P - BigInt(2)
    let result = GF_1
    while (exp > GF_0) {
      if (exp & GF_1) result = modP(result * base)
      base = modP(base * base)
      exp >>= GF_1
    }
    return result
  }

  for (let pos = 254; pos >= 0; pos--) {
    const bit = (e[pos >> 3] >> (pos & 7)) & 1
    cswap(swap ^ bit)
    swap = bit

    const a = modP(x2 + z2)
    const aa = modP(a * a)
    const b = modP(x2 - z2)
    const bb = modP(b * b)
    const e_val = modP(aa - bb)
    const c = modP(x3 + z3)
    const d = modP(x3 - z3)
    const da = modP(d * a)
    const cb = modP(c * b)

    x3 = modP(modP(da + cb) * modP(da + cb))
    z3 = modP(x1 * modP(modP(da - cb) * modP(da - cb)))
    x2 = modP(aa * bb)
    z2 = modP(e_val * modP(aa + modP(A24 * e_val)))
  }
  cswap(swap)

  const result = modP(x2 * invP(z2))
  const out = new Uint8Array(32)
  let temp = result
  for (let i = 0; i < 32; i++) {
    out[i] = Number(temp & BigInt(0xff))
    temp >>= BigInt(8)
  }
  return out
}

export async function generateWireGuardKeyPair(): Promise<{privateKey: string; publicKey: string}> {
  // Generate 32 secure random bytes for the private key
  const privBytes = new Uint8Array(32)
  if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
    window.crypto.getRandomValues(privBytes)
  } else {
    // Node.js fallback
    const {randomBytes} = await import('crypto')
    privBytes.set(randomBytes(32))
  }

  // Clamp for storage/export according to WireGuard spec
  privBytes[0] &= 248
  privBytes[31] &= 127
  privBytes[31] |= 64

  // Compute public key = curve25519(privBytes, base_point=9)
  const basePoint = new Uint8Array(32)
  basePoint[0] = 9
  const pubBytes = curve25519(privBytes, basePoint)

  return {
    privateKey: toBase64(privBytes),
    publicKey: toBase64(pubBytes),
  }
}

export interface ConfigOptions {
  privateKey: string
  address: string
  addressV6?: string | null
  dnsServers?: string[]
  mtu?: number
  serverPublicKey: string
  presharedKey?: string | null
  endpoint: string
  allowedIPs?: string[]
  persistentKeepalive?: number
}

export function formatWireGuardConfig(opts: ConfigOptions): string {
  const addresses = [opts.address]
  if (opts.addressV6) {
    addresses.push(opts.addressV6)
  }
  const dns = (opts.dnsServers && opts.dnsServers.length > 0) ? opts.dnsServers.join(', ') : '1.1.1.1, 8.8.8.8'
  const allowed = (opts.allowedIPs && opts.allowedIPs.length > 0) ? opts.allowedIPs.join(', ') : '0.0.0.0/0, ::/0'

  let conf = `[Interface]
# Device Address assigned by Aurora Control Plane
Address = ${addresses.join(', ')}
PrivateKey = ${opts.privateKey}
DNS = ${dns}
MTU = ${opts.mtu || 1280}

[Peer]
# Aurora VPN Gateway
PublicKey = ${opts.serverPublicKey}
Endpoint = ${opts.endpoint}
AllowedIPs = ${allowed}
PersistentKeepalive = ${opts.persistentKeepalive ?? 25}
`
  if (opts.presharedKey) {
    conf += `PresharedKey = ${opts.presharedKey}\n`
  }

  return conf
}

export function downloadConfigFile(filename: string, content: string): void {
  if (typeof window === 'undefined') return
  const blob = new Blob([content], {type: 'text/plain;charset=utf-8'})
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename.endsWith('.conf') ? filename : `${filename}.conf`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
