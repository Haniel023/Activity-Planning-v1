import crypto from 'crypto'

// Signature images are encrypted at rest. Normal plan reads never see the real
// image — only a redacted placeholder — so the UI can show "✓ Signed" without the
// browser ever receiving the actual signature. The real image is only decrypted
// through the dedicated export endpoint, for embedding into the PDF/Excel export.

const ALGO = 'aes-256-gcm'
const ENC_PREFIX = 'enc:v1:'

function getKey(): Buffer {
  const secret = process.env.SIGNATURE_ENCRYPTION_KEY
  if (!secret) throw new Error('SIGNATURE_ENCRYPTION_KEY is not set')
  // Accepts any passphrase/length — hashed down to exactly 32 bytes for AES-256.
  return crypto.createHash('sha256').update(secret).digest()
}

export function encryptSignature(plain: string): string {
  const key = getKey()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGO, key, iv)
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return ENC_PREFIX + Buffer.concat([iv, tag, ciphertext]).toString('base64')
}

// Decrypts our own ciphertext format. Anything else (e.g. a signature saved before
// encryption was added) is passed through unchanged — no separate migration needed.
export function decryptSignature(stored: string): string {
  if (!stored.startsWith(ENC_PREFIX)) return stored
  const key = getKey()
  const raw = Buffer.from(stored.slice(ENC_PREFIX.length), 'base64')
  const iv = raw.subarray(0, 12)
  const tag = raw.subarray(12, 28)
  const ciphertext = raw.subarray(28)
  const decipher = crypto.createDecipheriv(ALGO, key, iv)
  decipher.setAuthTag(tag)
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  return plain.toString('utf8')
}

export const SIGNED_PLACEHOLDER = '[[signed]]'

const SLOT_KEYS = ['preparedBy', 'reviewedBy', 'approvedBy1', 'approvedBy2', 'approvedBy3'] as const

function resolveIncomingSignature(incoming: string | undefined, existing: string | undefined): string | undefined {
  if (incoming === undefined) return undefined                    // explicitly cleared by the client
  if (incoming.startsWith('data:image/')) return encryptSignature(incoming) // a genuine fresh upload
  return existing                                                 // placeholder / stale echo — keep what's stored
}

// Merges a client-submitted `approvals` object onto what's already persisted, so a
// redacted placeholder (or an unrelated save, e.g. editing activities) can never
// clobber a real stored signature. Only an actual new upload gets encrypted and saved.
export function reconcileApprovals(incoming: any, existing: any): any {
  if (!incoming) return existing
  const result: any = { ...incoming }
  for (const key of SLOT_KEYS) {
    const inSlot = incoming[key]
    if (!inSlot) { result[key] = existing?.[key]; continue }
    result[key] = { ...inSlot, signatureImage: resolveIncomingSignature(inSlot.signatureImage, existing?.[key]?.signatureImage) }
  }
  return result
}

// Strips real (encrypted) signature data before sending a plan to the client for normal
// viewing/editing — callers only need to know a slot IS signed, never the image itself.
export function redactApprovals(approvals: any): any {
  if (!approvals) return approvals
  const result: any = {}
  for (const key of SLOT_KEYS) {
    const slot = approvals[key]
    if (!slot) { result[key] = slot; continue }
    result[key] = { ...slot, signatureImage: slot.signatureImage ? SIGNED_PLACEHOLDER : undefined }
  }
  return result
}

// Decrypts real signature data — used only by the export endpoint.
export function decryptApprovals(approvals: any): any {
  if (!approvals) return approvals
  const result: any = {}
  for (const key of SLOT_KEYS) {
    const slot = approvals[key]
    if (!slot) { result[key] = slot; continue }
    result[key] = { ...slot, signatureImage: slot.signatureImage ? decryptSignature(slot.signatureImage) : undefined }
  }
  return result
}
