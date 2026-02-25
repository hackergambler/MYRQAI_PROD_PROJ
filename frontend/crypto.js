/**
 * CRYPTO.JS
 * Handles AES-GCM 256-bit encryption and decryption.
 * This logic is independent of image size and character limits.
 */

const SALT = "myrqai-secure-v1"; // DO NOT CHANGE THIS: Changing salt will break existing messages.

/**
 * Encrypts a plain text message using a user-provided key.
 * @param {string} msg - The secret message (max 100 chars enforced by UI).
 * @param {string} key - The 6-12 character user key.
 * @returns {string} - Combined IV and Ciphertext in Base64 format.
 */
export async function encryptMessage(msg, key) {
  key = key.trim().toUpperCase();
  const enc = new TextEncoder();

  // 1. Import the raw key
  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  // 2. Derive a high-entropy AES key using PBKDF2
  const cryptoKey = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode(SALT),
      iterations: 100000,
      hash: "SHA-256"
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );

  // 3. Generate a random Initialization Vector (IV)
  const iv = crypto.getRandomValues(new Uint8Array(12));

  // 4. Encrypt the message
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    enc.encode(msg)
  );

  // 5. Return as ivBase64.dataBase64
  return (
    btoa(String.fromCharCode(...iv)) +
    "." +
    btoa(String.fromCharCode(...new Uint8Array(encrypted)))
  );
}

/**
 * Decrypts a cipher text using a user-provided key.
 * @param {string} cipher - The iv.data string from the image.
 * @param {string} key - The 6-12 character user key.
 * @returns {string} - The decrypted plain text.
 */
export async function decryptMessage(cipher, key) {
  key = key.trim().toUpperCase();
  const [iv64, data64] = cipher.split(".");
  if (!iv64 || !data64) throw new Error("Invalid encrypted format");

  // Convert Base64 back to Uint8Arrays
  const iv = Uint8Array.from(atob(iv64), c => c.charCodeAt(0));
  const data = Uint8Array.from(atob(data64), c => c.charCodeAt(0));

  const enc = new TextEncoder();

  // 1. Re-import the raw key
  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  // 2. Re-derive the same AES key
  const cryptoKey = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode(SALT),
      iterations: 100000,
      hash: "SHA-256"
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );

  // 3. Decrypt
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    data
  );

  return new TextDecoder().decode(decrypted);
}