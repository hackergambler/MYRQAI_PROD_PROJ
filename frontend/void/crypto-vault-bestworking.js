/**
 * crypto-vault.js
 * Real encryption for Vault fragments using WebCrypto (AES-GCM).
 *
 * Format (string):
 *   enc:v1:<base64(json)>
 *
 * json:
 *   { v:1, alg:"AES-GCM", iter:120000, salt:"b64", iv:"b64", ct:"b64" }
 *
 * - Key derived from passphrase via PBKDF2(SHA-256).
 * - AES-GCM provides confidentiality + integrity (tamper detection).
 */

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function b64encode(bytes){
  let bin = "";
  const chunk = 0x8000;
  for(let i=0;i<bytes.length;i+=chunk){
    bin += String.fromCharCode(...bytes.subarray(i, i+chunk));
  }
  return btoa(bin);
}

function b64decode(b64){
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deriveKey(passphrase, salt, iterations){
  const baseKey = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    { name:"PBKDF2", hash:"SHA-256", salt, iterations },
    baseKey,
    { name:"AES-GCM", length:256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export function isEncryptedFragment(s){
  return typeof s === "string" && s.startsWith("enc:v1:");
}

export async function encryptFragment(plainText, passphrase, opts={}){
  const iterations = opts.iterations ?? 120000;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv   = crypto.getRandomValues(new Uint8Array(12));

  const key = await deriveKey(passphrase, salt, iterations);
  const pt  = textEncoder.encode(plainText);

  const ctBuf = await crypto.subtle.encrypt({ name:"AES-GCM", iv }, key, pt);
  const ct = new Uint8Array(ctBuf);

  const payload = {
    v: 1,
    alg: "AES-GCM",
    iter: iterations,
    salt: b64encode(salt),
    iv:   b64encode(iv),
    ct:   b64encode(ct),
  };

  return "enc:v1:" + btoa(JSON.stringify(payload));
}

export async function decryptFragment(fragment, passphrase){
  if(!isEncryptedFragment(fragment)) throw new Error("NOT_ENCRYPTED");

  const b64 = fragment.slice("enc:v1:".length);
  const json = JSON.parse(atob(b64));

  if(json?.v !== 1 || json?.alg !== "AES-GCM") throw new Error("BAD_FORMAT");

  const salt = b64decode(json.salt);
  const iv   = b64decode(json.iv);
  const ct   = b64decode(json.ct);

  const key = await deriveKey(passphrase, salt, json.iter);

  try{
    const ptBuf = await crypto.subtle.decrypt({ name:"AES-GCM", iv }, key, ct);
    return textDecoder.decode(ptBuf);
  }catch{
    // Wrong passphrase or tampered ciphertext
    throw new Error("DECRYPT_FAILED");
  }
}
