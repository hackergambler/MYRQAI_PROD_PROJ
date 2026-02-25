import { loadImageVault } from "./image-vault.js";
import { isEncryptedFragment, decryptFragment } from "./crypto-vault.js";

let UI = { streamEl: null, statusEl: null, badgeEl: null };
let HOOKS = { beep: null };
let HINT_MASK = "";

let VAULT_READY = false;
let MAP = new Map();

export function initVoidUI(
  { streamSelector = "#voidStream", statusSelector = "#status", badgeSelector = "#phaseBadge" } = {},
  hooks = {}
) {
  UI.streamEl = document.querySelector(streamSelector) || document.body;
  UI.statusEl = document.querySelector(statusSelector) || null;
  UI.badgeEl = document.querySelector(badgeSelector) || null;
  HOOKS = { ...HOOKS, ...hooks };
}

export function setStatus(msg) {
  if (UI.statusEl) UI.statusEl.innerText = msg ?? "";
}
export function setPhase(phase) {
  if (UI.badgeEl) UI.badgeEl.innerText = String(phase || "").toUpperCase();
}
export function clearStream() {
  if (UI.streamEl) UI.streamEl.innerHTML = "";
}

export function setHintMask(mask) {
  HINT_MASK = String(mask || "");
  if (HINT_MASK) setStatus(HINT_MASK);
}

/**
 * Parse vault text lines:
 * Each valid line: KEY::VALUE
 * - Keys are normalized to UPPERCASE.
 * - Values can contain extra "::" (we join remainder).
 */
export function parseVault(vaultText) {
  MAP = new Map();

  const lines = String(vaultText || "").split(/\r?\n/);
  for (const line of lines) {
    const clean = line.trim();
    if (!clean || clean.startsWith("#")) continue;

    const parts = clean.split("::");
    if (parts.length >= 2) {
      const k = parts[0].trim().toUpperCase();         // ✅ normalize
      const v = parts.slice(1).join("::").trim();
      if (k) MAP.set(k, v);
    }
  }

  window.__VOID_HINT_MAP = MAP;
  VAULT_READY = true;
}

/**
 * Merge payload into PNG *in RAM* using markers,
 * then read the vault block back via loadImageVault(url).
 *
 * secretPayloadLine is usually:
 *   "0x100::<base64>"   OR   "0x0F3::enc:v1:...."
 */
export async function synthesizeFromPayload(secretPayloadLine, baseImageUrl = "./assets/void.png") {
  setPhase("SYNTHESIZING");

  const payload = typeof secretPayloadLine === "string" ? secretPayloadLine.trim() : "";
  if (!payload) throw new Error("empty payload");

  const baseRes = await fetch(baseImageUrl, { cache: "no-store" });
  if (!baseRes.ok) throw new Error("base image fetch failed: " + baseRes.status);
  const base = await baseRes.arrayBuffer();

  const encoder = new TextEncoder();
  const merged = new Blob(
    [
      new Uint8Array(base),
      encoder.encode("\nMYRQAI_VAULT_START\n"),
      encoder.encode(payload + "\n"),
      encoder.encode("MYRQAI_VAULT_END\n"),
    ],
    { type: "image/png" }
  );

  let url = null;
  try {
    url = URL.createObjectURL(merged);
    const vaultText = await loadImageVault(url);

    if (!vaultText) throw new Error("vault not found");
    parseVault(vaultText);

    setPhase("UNLOCKING");
    return true;
  } finally {
    if (url) URL.revokeObjectURL(url);
  }
}

/**
 * ✅ Smart unlock:
 * - Allows "0x100 - unlock" / "unlock 0x100" / mixed casing
 * - Extracts first hex key if present
 */
export function unlockHintByKey(keyOrFragment) {
  let v = String(keyOrFragment || "").trim();
  if (!v) return;

  // If user pasted enc:v1 fragment directly
  if (isEncryptedFragment(v)) {
    promptDecryptAndReveal(v);
    return;
  }

  // ✅ Extract first 0xHEX from messy input
  const m = v.match(/0x[0-9a-f]+/i);
  if (m) v = m[0];

  // ✅ Normalize key
  v = v.toUpperCase();

  if (!VAULT_READY || !MAP || MAP.size === 0) {
    hintCard("🜏 Vault not ready. Click a Signal Card first (it synthesizes the vault).", {
      mode: "SYSTEM",
      key: "VAULT",
    });
    HOOKS.beep?.("bad");
    return;
  }

  const enc = MAP.get(v);
  if (!enc) {
    hintCard("🜏 No fragment for key: " + v, { mode: "SYSTEM", key: "MISS" });
    HOOKS.beep?.("bad");
    return;
  }

  reveal(enc, { mode: "VAULT", key: v });
}

export function revealDirectHint(text, meta = {}) {
  hintCard(text, meta);
}

async function promptDecryptAndReveal(fragment) {
  const pass = prompt("Enter passphrase to decrypt:");
  if (!pass) {
    setStatus("decrypt cancelled");
    HOOKS.beep?.("sys");
    return;
  }
  try {
    const hint = await decryptFragment(fragment, pass);
    hintCard(cleanFragmentText(hint), { mode: "AES", key: "DECRYPTED", rare: true });
    setStatus("decrypted");
    HOOKS.beep?.("rare");
  } catch {
    hintCard("🜏 Decrypt failed (wrong key or tampered).", { mode: "SYSTEM", key: "AES" });
    setStatus("decrypt failed");
    HOOKS.beep?.("bad");
  }
}

function reveal(enc, meta) {
  if (isEncryptedFragment(enc)) return promptDecryptAndReveal(enc);

  // enc is expected Base64 from vault line
  const decoded = base64ToUtf8(enc);
  if (!decoded) {
    hintCard("🜏 Corrupted fragment.", { mode: "SYSTEM", key: "ERR" });
    HOOKS.beep?.("bad");
    return;
  }

  const clean = cleanFragmentText(decoded);
  hintCard(clean, meta);
  HOOKS.beep?.("ok");
}

/**
 * Robust Base64 -> UTF-8 decode
 */
function base64ToUtf8(b64) {
  try {
    const bin = atob(String(b64 || "").trim());
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } catch {
    return null;
  }
}

/**
 * If decoded payload contains MYRQAI markers, strip them
 * so user sees only the meaningful fragment.
 */
function cleanFragmentText(text) {
  const s = String(text ?? "").replace(/\r/g, "");

  const start = s.indexOf("MYRQAI_VAULT_START");
  const end = s.indexOf("MYRQAI_VAULT_END");

  if (start !== -1 && end !== -1 && end > start) {
    const inner = s
      .slice(start + "MYRQAI_VAULT_START".length, end)
      .trim();
    return inner || s.trim();
  }

  return s.trim();
}

/* ===== Glitch typing ===== */
function glitchType(el, finalText, opts = {}) {
  const cps = opts.cps ?? 70;
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%&*+?@";
  const total = Math.max(260, Math.floor((finalText.length / cps) * 1000));
  const start = performance.now();

  function frame(now) {
    const t = Math.min(1, (now - start) / total);
    const revealCount = Math.floor(finalText.length * t);
    let out = finalText.slice(0, revealCount);
    const tail = Math.min(16, finalText.length - revealCount);
    for (let i = 0; i < tail; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
    el.textContent = out;

    if (t < 1) requestAnimationFrame(frame);
    else el.textContent = finalText;
  }
  requestAnimationFrame(frame);
}

function hintCard(raw, meta = {}) {
  const container = UI.streamEl || document.body;
  const hint = String(raw ?? "");

  const isRare =
    Boolean(meta.rare) ||
    hint.startsWith("⟡") ||
    String(meta.mode || "").toUpperCase() === "AES";

  const card = document.createElement("div");
  card.className = "hint-card" + (isRare ? " rare" : "");

  const m = document.createElement("div");
  m.className = "hint-meta";
  const mode = (meta.mode || "SYSTEM").toUpperCase();
  const key = (meta.key || "FRAGMENT").toUpperCase();
  m.textContent = `${mode} • ${key}${isRare ? " • RARE" : ""}`;

  const t = document.createElement("div");
  t.className = "hint-text";
  glitchType(t, hint);

  card.appendChild(m);
  card.appendChild(t);
  container.appendChild(card);

  try {
    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
  } catch {}
}