import { AwsClient } from 'aws4fetch'

/**
 * Neon Object Storage (S3-compatible) via aws4fetch. Path-style URLs (`<endpoint>/<bucket>/<key>`) and SigV4 are
 * required. Objects are private; the browser reads them through short-lived presigned GET URLs.
 */
export const hasObjectStorage = () => Boolean(process.env.AWS_ENDPOINT_URL_S3 && process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY)

const bucket = () => process.env.S3_BUCKET || 'assets'
const PRESIGN_SECONDS = 60 * 60

let client: AwsClient | undefined
function aws() {
  return (client ??= new AwsClient({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    region: process.env.AWS_REGION || 'us-east-2',
    service: 's3',
  }))
}

const bucketUrl = () => `${process.env.AWS_ENDPOINT_URL_S3!.replace(/\/+$/, '')}/${bucket()}`
const objectUrl = (key: string) => `${bucketUrl()}/${key.split('/').map(encodeURIComponent).join('/')}`

async function failure(what: string, res: Response) {
  const body = await res.text().catch(() => '')
  const code = body.match(/<Code>([^<]+)<\/Code>/)?.[1]
  return new Error(`Object storage ${what} failed: ${res.status}${code ? ` ${code}` : ''}`)
}

export async function putObject(key: string, body: Uint8Array, contentType: string) {
  const res = await aws().fetch(objectUrl(key), { method: 'PUT', body: body as BodyInit, headers: { 'content-type': contentType } })
  if (!res.ok) throw await failure(`PUT ${key}`, res)
}

export async function presignGet(key: string, expiresIn = PRESIGN_SECONDS) {
  const url = new URL(objectUrl(key))
  url.searchParams.set('X-Amz-Expires', String(expiresIn))
  const signed = await aws().sign(url.toString(), { method: 'GET', aws: { signQuery: true } })
  return signed.url
}

async function listKeys(prefix: string) {
  const keys: string[] = []
  let token: string | undefined
  do {
    const url = new URL(bucketUrl())
    url.searchParams.set('list-type', '2')
    url.searchParams.set('prefix', prefix)
    if (token) url.searchParams.set('continuation-token', token)
    const res = await aws().fetch(url.toString())
    if (!res.ok) throw await failure(`LIST ${prefix}`, res)
    const xml = await res.text()
    for (const m of xml.matchAll(/<Key>([^<]+)<\/Key>/g)) keys.push(m[1].replace(/&amp;/g, '&'))
    token = /<IsTruncated>true<\/IsTruncated>/.test(xml) ? xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/)?.[1] : undefined
  } while (token)
  return keys
}

/** Deletes every object under a prefix. */
export async function deletePrefix(prefix: string) {
  const keys = await listKeys(prefix)
  await inBatches(keys, 8, async (key) => {
    const res = await aws().fetch(objectUrl(key), { method: 'DELETE' })
    if (!res.ok && res.status !== 404) throw await failure(`DELETE ${key}`, res)
  })
  return keys.length
}

export async function inBatches<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += size) await Promise.all(items.slice(i, i + size).map(fn))
}

// ---- references stored in run data ----

/** Run data stores `s3:<key>` references (never URLs: presigned URLs expire). */
export const S3_REF = 's3:'
export const toRef = (key: string) => `${S3_REF}${key}`

/** Replaces `s3:` references in steps with fresh presigned URLs. Returns new objects; the input is not mutated. */
export async function resolveStepAssets<T extends { frames: { t: number; src: string }[]; screenshot?: string }>(steps: T[]): Promise<T[]> {
  if (!steps.some((s) => s.frames.some((f) => f.src.startsWith(S3_REF)) || s.screenshot?.startsWith(S3_REF))) return steps
  const sign = (src: string) => (src.startsWith(S3_REF) && hasObjectStorage() ? presignGet(src.slice(S3_REF.length)) : Promise.resolve(src))
  return Promise.all(
    steps.map(async (s) => ({
      ...s,
      screenshot: s.screenshot ? await sign(s.screenshot) : s.screenshot,
      frames: await Promise.all(s.frames.map(async (f) => ({ ...f, src: await sign(f.src) }))),
    })),
  )
}
