/**
 * crypto-vault.js
 * Real encryption for Vault fragments using WebCrypto (AES-GCM).
 *
 * Format (string):
 *   enc:v1:<base64(json)>
 *
 * json (new):
 *   { v:1, alg:"AES-GCM", iter:120000, salt:"b64", iv:"b64", ct:"b64" }
 *
 * json (legacy supported):
 *   { v:1, salt:"b64", iv:"b64", ct:"b64" }
 *
 * - Key derived from passphrase via PBKDF2(SHA-256).
 * - AES-GCM provides confidentiality + integrity (tamper detection).
 */

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const DEFAULT_ITER = 120000;
const DEFAULT_ALG = "AES-GCM";

function b64encode(bytes) {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function b64decode(b64) {
  const bin = atob(String(b64 || "").trim());
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function normalizePassphrase(p) {
  // IMPORTANT: do NOT uppercase automatically (could break real keys)
  return String(p ?? "").trim();
}

async function deriveKey(passphrase, salt, iterations) {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export function isEncryptedFragment(s) {
  return typeof s === "string" && s.startsWith("enc:v1:");
}

/**
 * Parse the "enc:v1:" payload.
 * Supports:
 *  - base64(JSON)
 *  - raw JSON (fallback)
 */
function parseEncPayload(fragment) {
  const raw = fragment.slice("enc:v1:".length).trim();
  if (!raw) throw new Error("BAD_FORMAT:EMPTY");

  // Try base64(json)
  try {
    const jsonText = atob(raw);
    return JSON.parse(jsonText);
  } catch {
    // Try raw json (some tools might store it directly)
    try {
      return JSON.parse(raw);
    } catch {
      throw new Error("BAD_FORMAT:JSON");
    }
  }
}

export async function encryptFragment(plainText, passphrase, opts = {}) {
  const iterations = Number(opts.iterations ?? DEFAULT_ITER);
  if (!Number.isFinite(iterations) || iterations < 1000) {
    throw new Error("BAD_ITER");
  }

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const key = await deriveKey(normalizePassphrase(passphrase), salt, iterations);
  const pt = textEncoder.encode(String(plainText ?? ""));

  const ctBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, pt);
  const ct = new Uint8Array(ctBuf);

  const payload = {
    v: 1,
    alg: "AES-GCM",
    iter: iterations,
    salt: b64encode(salt),
    iv: b64encode(iv),
    ct: b64encode(ct),
  };

  return "enc:v1:" + btoa(JSON.stringify(payload));
}

export async function decryptFragment(fragment, passphrase) {
  if (!isEncryptedFragment(fragment)) throw new Error("NOT_ENCRYPTED");

  const json = parseEncPayload(fragment);

  // ✅ backward compatible defaults
  const v = Number(json?.v);
  if (v !== 1) throw new Error("BAD_FORMAT:VERSION");

  const alg = String(json?.alg || DEFAULT_ALG).toUpperCase();
  if (alg !== "AES-GCM") throw new Error("BAD_FORMAT:ALG");

  const iter = Number(json?.iter ?? DEFAULT_ITER);
  if (!Number.isFinite(iter) || iter < 1000) throw new Error("BAD_FORMAT:ITER");

  if (!json?.salt || !json?.iv || !json?.ct) throw new Error("BAD_FORMAT:MISSING_FIELDS");

  const salt = b64decode(json.salt);
  const iv = b64decode(json.iv);
  const ct = b64decode(json.ct);

  const key = await deriveKey(normalizePassphrase(passphrase), salt, iter);

  try {
    const ptBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
    return textDecoder.decode(ptBuf);
  } catch {
    // Wrong passphrase or tampered ciphertext
    throw new Error("DECRYPT_FAILED");
  }
}