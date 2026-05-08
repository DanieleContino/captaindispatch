import crypto from 'crypto';

/**
 * AES-256-GCM encryption helper for sensitive secrets at rest.
 *
 * Used by:
 *   - app/api/auth/google/callback/route.js  → encrypt refresh_token before INSERT
 *   - lib/googleClient.js                    → decrypt refresh_token before use
 *
 * Env requirement:
 *   GOOGLE_TOKEN_ENCRYPTION_KEY — 64 hex chars (32 bytes). Generate with:
 *     node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *
 * Output format (for storage as TEXT):
 *   <iv_hex>:<authTag_hex>:<ciphertext_hex>
 *   - iv:        12 bytes (96-bit), recommended for GCM
 *   - authTag:   16 bytes (128-bit), GCM authentication
 *   - ciphertext: variable length
 */

const ALGO = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getKey() {
  const hexKey = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
  if (!hexKey) {
    throw new Error(
      'GOOGLE_TOKEN_ENCRYPTION_KEY env var is not set. ' +
      'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }
  if (hexKey.length !== 64) {
    throw new Error(
      `GOOGLE_TOKEN_ENCRYPTION_KEY must be 64 hex chars (32 bytes), got ${hexKey.length}.`
    );
  }
  return Buffer.from(hexKey, 'hex');
}

/**
 * Encrypt a plaintext string.
 * @param {string} plaintext
 * @returns {string} Format: "iv:authTag:ciphertext" (all hex)
 */
export function encrypt(plaintext) {
  if (typeof plaintext !== 'string' || plaintext.length === 0) {
    throw new Error('encrypt(): plaintext must be a non-empty string');
  }
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`;
}

/**
 * Decrypt a string produced by encrypt().
 * @param {string} payload Format: "iv:authTag:ciphertext" (all hex)
 * @returns {string} plaintext
 */
export function decrypt(payload) {
  if (typeof payload !== 'string' || !payload.includes(':')) {
    throw new Error('decrypt(): invalid payload format');
  }
  const parts = payload.split(':');
  if (parts.length !== 3) {
    throw new Error('decrypt(): payload must have exactly 3 colon-separated parts');
  }
  const [ivHex, authTagHex, ciphertextHex] = parts;
  if (ivHex.length !== IV_LENGTH * 2) {
    throw new Error(`decrypt(): invalid IV length (expected ${IV_LENGTH * 2} hex chars)`);
  }
  if (authTagHex.length !== AUTH_TAG_LENGTH * 2) {
    throw new Error(`decrypt(): invalid authTag length (expected ${AUTH_TAG_LENGTH * 2} hex chars)`);
  }

  const key = getKey();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const ciphertext = Buffer.from(ciphertextHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);

  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
}
