import crypto from 'node:crypto'

type Jwk = crypto.JsonWebKey & { kid?: string }

let jwksCache: { keys: Jwk[]; fetchedAt: number } | undefined
const JWKS_TTL_MS = 10 * 60 * 1000
const MAX_AGE_MS = 5 * 60 * 1000

async function findKey(kid: string): Promise<Jwk | undefined> {
  const fresh = jwksCache && Date.now() - jwksCache.fetchedAt < JWKS_TTL_MS
  let key = fresh ? jwksCache!.keys.find((k) => k.kid === kid) : undefined
  if (key) return key
  // Unknown kid or stale cache: refetch once (handles key rotation).
  const res = await fetch(`${process.env.NEON_AUTH_BASE_URL}/.well-known/jwks.json`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`JWKS fetch failed with ${res.status}`)
  jwksCache = { keys: (await res.json()).keys ?? [], fetchedAt: Date.now() }
  key = jwksCache.keys.find((k) => k.kid === kid)
  return key
}

/**
 * Verifies a Neon Auth webhook: Ed25519 detached JWS over `${timestamp}.${base64url(body)}`, signed with a key
 * from the Neon Auth JWKS. Throws when the signature, key or timestamp is invalid.
 */
export async function verifyNeonAuthWebhook(rawBody: string, headers: Headers) {
  const signature = headers.get('x-neon-signature')
  const kid = headers.get('x-neon-signature-kid')
  const timestamp = headers.get('x-neon-timestamp')
  if (!signature || !kid || !timestamp) throw new Error('Missing signature headers')

  const age = Date.now() - Number(timestamp)
  if (!Number.isFinite(age) || Math.abs(age) > MAX_AGE_MS) throw new Error('Stale or invalid timestamp')

  const jwk = await findKey(kid)
  if (!jwk) throw new Error(`Unknown signing key ${kid}`)
  const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' })

  const [headerB64, emptyPayload, signatureB64] = signature.split('.')
  if (!headerB64 || emptyPayload !== '' || !signatureB64) throw new Error('Expected a detached JWS')

  const payloadB64 = Buffer.from(rawBody, 'utf8').toString('base64url')
  const signingInput = `${headerB64}.${Buffer.from(`${timestamp}.${payloadB64}`, 'utf8').toString('base64url')}`
  const valid = crypto.verify(null, Buffer.from(signingInput), publicKey, Buffer.from(signatureB64, 'base64url'))
  if (!valid) throw new Error('Invalid signature')
}
