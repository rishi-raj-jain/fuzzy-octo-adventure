import { lookup } from 'node:dns/promises'
import net from 'node:net'

/** Private networks are allowed in `next dev` or when ALLOW_PRIVATE_NETWORKS=true. */
export const allowPrivateNetworks = () => process.env.ALLOW_PRIVATE_NETWORKS === 'true' || process.env.NODE_ENV === 'development'

function isPrivateIPv4(ip: string) {
  const [a, b] = ip.split('.').map(Number)
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224
}

function isPrivateIP(ip: string) {
  if (net.isIPv4(ip)) return isPrivateIPv4(ip)
  const v6 = ip.toLowerCase()
  const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (mapped) return isPrivateIPv4(mapped[1])
  return v6 === '::' || v6 === '::1' || v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe80') || v6.startsWith('ff')
}

/**
 * Refuses navigation targets that resolve to loopback/private/link-local addresses so a public deployment
 * can't be used to probe internal infrastructure. This only guards navigation targets; see README.
 */
export async function assertPublicUrl(raw: string) {
  const url = new URL(raw)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error(`Unsupported protocol ${url.protocol}`)
  if (allowPrivateNetworks()) return
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) {
    throw new Error(`Refusing to open private host "${host}"`)
  }
  const addresses = net.isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => [])
  if (!addresses.length) throw new Error(`Could not resolve host "${host}"`)
  if (addresses.some(({ address }) => isPrivateIP(address))) throw new Error(`Refusing to open "${host}": it resolves to a private network address`)
}
