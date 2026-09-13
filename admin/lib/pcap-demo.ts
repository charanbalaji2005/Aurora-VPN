/**
 * Client-side demo .pcap generator.
 *
 * Produces a binary pcap file (libpcap format, link-type ETHERNET) with
 * synthetic WireGuard UDP packets that Wireshark can open and dissect.
 * No gateway agent is required — useful for testing the download flow in
 * local development before a real Linux gateway is provisioned.
 *
 * pcap format reference:
 *   https://wiki.wireshark.org/Development/LibpcapFileFormat
 */

function writeUint32LE(view: DataView, offset: number, value: number) {
  view.setUint32(offset, value, true)
}
function writeUint16LE(view: DataView, offset: number, value: number) {
  view.setUint16(offset, value, true)
}

/** Build the 24-byte pcap global header. */
function globalHeader(): ArrayBuffer {
  const buf = new ArrayBuffer(24)
  const v = new DataView(buf)
  writeUint32LE(v, 0, 0xa1b2c3d4)  // magic
  writeUint16LE(v, 4, 2)            // version major
  writeUint16LE(v, 6, 4)            // version minor
  writeUint32LE(v, 8, 0)            // timezone (UTC)
  writeUint32LE(v, 12, 0)           // timestamp accuracy
  writeUint32LE(v, 16, 65535)       // snapshot length
  writeUint32LE(v, 20, 1)           // link type: Ethernet (1)
  return buf
}

/**
 * Build a single pcap packet record.
 * @param ts   Unix timestamp in seconds
 * @param data Ethernet frame bytes
 */
function packetRecord(ts: number, data: Uint8Array): ArrayBuffer {
  const capLen = Math.min(data.length, 65535)
  const buf = new ArrayBuffer(16 + capLen)
  const v = new DataView(buf)
  const sec = Math.floor(ts)
  const usec = Math.round((ts - sec) * 1e6)
  writeUint32LE(v, 0, sec)
  writeUint32LE(v, 4, usec)
  writeUint32LE(v, 8, capLen)        // captured length
  writeUint32LE(v, 12, data.length)  // original length
  new Uint8Array(buf, 16).set(data.subarray(0, capLen))
  return buf
}

/** Minimal Ethernet + IPv4 + UDP frame carrying a WireGuard initiator message. */
function makeWireGuardPacket(
  srcMac: number[],
  dstMac: number[],
  srcIp: number[],
  dstIp: number[],
  srcPort: number,
  dstPort: number,
  payload: Uint8Array,
): Uint8Array {
  const udpLen = 8 + payload.length
  const ipLen = 20 + udpLen
  const frameLen = 14 + ipLen

  const frame = new Uint8Array(frameLen)
  let off = 0

  // Ethernet header
  frame.set(dstMac, off); off += 6
  frame.set(srcMac, off); off += 6
  frame[off++] = 0x08; frame[off++] = 0x00  // EtherType: IPv4

  // IPv4 header (no options, TTL=64, proto=17 UDP)
  frame[off++] = 0x45           // version+IHL
  frame[off++] = 0x00           // DSCP+ECN
  frame[off++] = (ipLen >> 8) & 0xff
  frame[off++] = ipLen & 0xff
  frame[off++] = 0x00; frame[off++] = 0x00  // ID
  frame[off++] = 0x40; frame[off++] = 0x00  // flags+frag offset (DF)
  frame[off++] = 64             // TTL
  frame[off++] = 17             // protocol: UDP
  frame[off++] = 0x00; frame[off++] = 0x00  // checksum (0 = unchecked)
  frame.set(srcIp, off); off += 4
  frame.set(dstIp, off); off += 4

  // UDP header
  frame[off++] = (srcPort >> 8) & 0xff; frame[off++] = srcPort & 0xff
  frame[off++] = (dstPort >> 8) & 0xff; frame[off++] = dstPort & 0xff
  frame[off++] = (udpLen >> 8) & 0xff; frame[off++] = udpLen & 0xff
  frame[off++] = 0x00; frame[off++] = 0x00  // checksum (optional for UDP)

  frame.set(payload, off)
  return frame
}

/** Generate a 4-byte WireGuard message type header. */
function wgMsgType(type: number): Uint8Array {
  const b = new Uint8Array(4)
  b[0] = type
  return b
}

/** Concatenate multiple ArrayBuffers / Uint8Arrays into one Uint8Array. */
function concat(...parts: (ArrayBuffer | Uint8Array)[]): Uint8Array {
  const total = parts.reduce((s, p) => s + (p instanceof ArrayBuffer ? p.byteLength : p.length), 0)
  const out = new Uint8Array(total)
  let off = 0
  for (const p of parts) {
    const u8 = p instanceof ArrayBuffer ? new Uint8Array(p) : p
    out.set(u8, off)
    off += u8.length
  }
  return out
}

/**
 * Generate a demo .pcap Blob containing a realistic WireGuard exchange:
 *   1. Handshake Initiation   (type=1, 148 bytes)
 *   2. Handshake Response     (type=2, 92 bytes)
 *   3. First keepalive data   (type=4)
 *   4. Keepalive back
 *   5-8. Four transport data packets
 */
export function generateDemoPcap(): Blob {
  const now = Date.now() / 1000   // seconds since epoch
  const interval = 0.025          // 25 ms between packets

  // Fixed demo addresses
  const androidMac = [0x52, 0x54, 0x00, 0xaa, 0xbb, 0x01]
  const gatewayMac = [0x52, 0x54, 0x00, 0xaa, 0xbb, 0x02]
  const androidIp = [10, 99, 0, 2]
  const gatewayIp = [203, 0, 113, 1]  // TEST-NET-3 (RFC5737)
  const wgPort = 51820

  // WireGuard handshake initiation payload (type=1, padded to 148 bytes)
  const initPayload = new Uint8Array(148)
  initPayload.set(wgMsgType(1))
  crypto.getRandomValues(initPayload.subarray(4))  // random key material

  // WireGuard handshake response payload (type=2, 92 bytes)
  const respPayload = new Uint8Array(92)
  respPayload.set(wgMsgType(2))
  crypto.getRandomValues(respPayload.subarray(4))

  // Transport data payload (type=4, variable)
  const makeTransport = (size: number) => {
    const p = new Uint8Array(size)
    p.set(wgMsgType(4))
    crypto.getRandomValues(p.subarray(4))
    return p
  }

  const packets: { ts: number; frame: Uint8Array }[] = []
  let t = now

  // 1. Android → Gateway: Handshake Initiation
  packets.push({
    ts: t,
    frame: makeWireGuardPacket(androidMac, gatewayMac, androidIp, gatewayIp, 54321, wgPort, initPayload),
  }); t += interval

  // 2. Gateway → Android: Handshake Response
  packets.push({
    ts: t,
    frame: makeWireGuardPacket(gatewayMac, androidMac, gatewayIp, androidIp, wgPort, 54321, respPayload),
  }); t += interval

  // 3. Android → Gateway: First keepalive (empty transport)
  packets.push({
    ts: t,
    frame: makeWireGuardPacket(androidMac, gatewayMac, androidIp, gatewayIp, 54321, wgPort, makeTransport(32)),
  }); t += interval

  // 4. Gateway → Android: Keepalive ack
  packets.push({
    ts: t,
    frame: makeWireGuardPacket(gatewayMac, androidMac, gatewayIp, androidIp, wgPort, 54321, makeTransport(32)),
  }); t += interval

  // 5-8. Bidirectional transport data (DNS query/response simulation)
  for (let i = 0; i < 4; i++) {
    const size = 64 + Math.floor(Math.random() * 128)
    const toGw = i % 2 === 0
    packets.push({
      ts: t,
      frame: toGw
        ? makeWireGuardPacket(androidMac, gatewayMac, androidIp, gatewayIp, 54321, wgPort, makeTransport(size))
        : makeWireGuardPacket(gatewayMac, androidMac, gatewayIp, androidIp, wgPort, 54321, makeTransport(size)),
    })
    t += interval
  }

  // Assemble the pcap
  const parts: (ArrayBuffer | Uint8Array)[] = [globalHeader()]
  for (const { ts, frame } of packets) {
    parts.push(packetRecord(ts, frame))
  }

  return new Blob([concat(...parts)], { type: 'application/vnd.tcpdump.pcap' })
}

/** Download a demo pcap file and return metadata. */
export function downloadDemoPcap(gatewayId: string): { filename: string; sizeBytes: number } {
  const blob = generateDemoPcap()
  const filename = `aurora-${gatewayId}-demo-${Math.floor(Date.now() / 1000)}.pcap`
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  setTimeout(() => { URL.revokeObjectURL(url); document.body.removeChild(a) }, 1000)
  return { filename, sizeBytes: blob.size }
}
