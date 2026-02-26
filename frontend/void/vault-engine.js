import { loadImageVault } from "./image-vault.js";
import { isEncryptedFragment, decryptFragment } from "./crypto-vault.js";

export const ENGINE_VERSION = "vault-engine@2026.02.26-r4"; // bump to confirm cache

let UI = { streamEl: null, statusEl: null, badgeEl: null, newestBtn: null };
let HOOKS = { beep: null };
let HINT_MASK = "";

let VAULT_READY = false;
let MAP = new Map();
let LAST_SYNTH_KEY = null;

// prevent double-binding if module hot reloads / re-imports
let WIRED = { newestClick: false, scrollWatch: false };

/* ================================
   Failure engine (ARCHITECTED)
   - Returns structured state so app.js can drive UI
   ================================ */
const FAIL = {
  bySignal: new Map(), // signalId -> count
};

function sigKey(signalId) {
  return String(signalId || "UNKNOWN").toUpperCase();
}

function bumpFail(signalId) {
  const k = sigKey(signalId);
  const n = (FAIL.bySignal.get(k) || 0) + 1;
  FAIL.bySignal.set(k, n);
  return n;
}

function pulseBody(cls, ms = 260) {
  try {
    document.body.classList.add(cls);
    setTimeout(() => document.body.classList.remove(cls), ms);
  } catch {}
}

function leakSnippet(maxLen) {
  const leak = (HINT_MASK || "").trim();
  if (!leak) return "";
  const s = leak.slice(0, Math.min(maxLen, leak.length));
  return s + (leak.length > maxLen ? "…" : "");
}

/**
 * ✅ EXPORT (hard guarantee)
 * Call this from app.js when answer is wrong.
 *
 * Returns:
 *  { count: number, stage: "DENIED"|"LEAK"|"HINT"|"DESTABILIZE", snippet: string }
 */
export function vaultReject(signalId = "UNKNOWN", difficulty = 1) {
  const n = bumpFail(signalId);

  setPhase("REJECTED");
  setStatus("incorrect");
  HOOKS.beep?.("bad");
  pulseBody("vault-hit", 220);

  // Attempt 1: DENIED
  if (n === 1) {
    hintCard("🜏 ACCESS DENIED.\nHash mismatch detected.", { mode: "SYSTEM", key: "DENIED" });
    return { count: n, stage: "DENIED", snippet: "" };
  }

  // Attempt 2: LEAK (small)
  if (n === 2) {
    const snippet = leakSnippet(70);
    hintCard(
      "⟡ REJECTION LOOP.\nIntegrity countermeasures active." +
        (snippet ? `\n⟡ SIGNAL LEAK: ${snippet}` : ""),
      { mode: "SYSTEM", key: "LEAK", rare: true }
    );
    pulseBody("vault-hit-2", 320);
    return { count: n, stage: "LEAK", snippet };
  }

  // Attempt 3: HINT (bigger leak, real mechanic)
  if (n === 3) {
    const snippet = leakSnippet(130);
    hintCard(
      "⟡ HINT LEAK (ATTEMPT 3).\nA larger portion slips through." +
        (snippet ? `\n⟡ ${snippet}` : "\n⟡ (No mask available.)"),
      { mode: "SYSTEM", key: "HINT", rare: true }
    );
    pulseBody("vault-hit-2", 360);
    return { count: n, stage: "HINT", snippet };
  }

  // Attempt 4+: DESTABILIZE
  const level = Math.min(5, Math.max(1, Number(difficulty) || 1));
  hintCard(
    "⟡ DESTABILIZING.\nMultiple failures detected.\nStop brute-forcing. Re-interpret the prompt.",
    { mode: "SYSTEM", key: `FAILx${n}`, rare: true }
  );
  pulseBody(`vault-hit-${level}`, 320);
  return { count: n, stage: "DESTABILIZE", snippet: "" };
}

/**
 * ✅ EXPORT (hard guarantee)
 * Call this on success OR when opening a new signal.
 */
export function resetRejectCounter(signalId = "UNKNOWN") {
  const k = sigKey(signalId);
  FAIL.bySignal.delete(k);
}

/* Optional debug helper (won’t break anything) */
export function getEngineVersion() {
  return ENGINE_VERSION;
}

/* ================================
   UI + Stream plumbing
   ================================ */
export function initVoidUI(
  {
    streamSelector = "#voidStream",
    statusSelector = "#status",
    badgeSelector = "#phaseBadge",
    newestBtnSelector = "#streamTopBtn",
  } = {},
  hooks = {}
) {
  UI.streamEl = document.querySelector(streamSelector) || document.body;
  UI.statusEl = document.querySelector(statusSelector) || null;
  UI.badgeEl = document.querySelector(badgeSelector) || null;
  UI.newestBtn = document.querySelector(newestBtnSelector) || null;
  HOOKS = { ...HOOKS, ...hooks };

  try {
    console.log(`[${ENGINE_VERSION}] loaded`, {
      stream: !!UI.streamEl,
      status: !!UI.statusEl,
      badge: !!UI.badgeEl,
      newestBtn: !!UI.newestBtn,
    });
  } catch {}

  if (UI.newestBtn && !WIRED.newestClick) {
    WIRED.newestClick = true;
    UI.newestBtn.addEventListener("click", () => jumpToNewest({ force: true }));
  }

  if (UI.streamEl && UI.newestBtn && !WIRED.scrollWatch) {
    WIRED.scrollWatch = true;
    const onScroll = () => {
      const away = UI.streamEl.scrollTop > 80; // newest at top because we prepend
      UI.newestBtn.style.display = away ? "inline-flex" : "none";
    };
    UI.streamEl.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }
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
  if (HINT_MASK) setStatus(HINT_MASK.slice(0, 160) + (HINT_MASK.length > 160 ? "…" : ""));
}

/**
 * Newest cards are PREPENDED, so newest is scrollTop=0.
 * Don’t force-scroll on every insert (prevents “stuck” feel).
 */
export function jumpToNewest(opts = {}) {
  const container = UI.streamEl;
  if (!container) return;

  const force = Boolean(opts.force);
  const smooth = opts.smooth !== false;

  const nearTop = container.scrollTop <= 40;
  if (!force && !nearTop) return;

  try {
    container.scrollTo({ top: 0, behavior: smooth ? "smooth" : "auto" });
  } catch {
    container.scrollTop = 0;
  }

  if (UI.newestBtn) UI.newestBtn.style.display = "none";
}

/**
 * Parse vault text lines: KEY::VALUE
 */
export function parseVault(vaultText) {
  MAP = new Map();

  const lines = String(vaultText || "").split(/\r?\n/);
  for (const line of lines) {
    const clean = line.trim();
    if (!clean || clean.startsWith("#")) continue;

    const parts = clean.split("::");
    if (parts.length >= 2) {
      const k = parts[0].trim().toUpperCase();
      const v = parts.slice(1).join("::").trim();
      if (k) MAP.set(k, v);
    }
  }

  window.__VOID_HINT_MAP = MAP;
  VAULT_READY = true;
}

/**
 * Merge payload into PNG *in RAM* then read vault back.
 */
export async function synthesizeFromPayload(secretPayloadLine, baseImageUrl = "./assets/void.png", meta = {}) {
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

    setPhase("READY");
    setStatus("vault synthesized");

    const sid = meta?.signal_id ? String(meta.signal_id).toUpperCase() : "VAULT";
    LAST_SYNTH_KEY = sid;

    hintCard("⟡ VAULT SYNTHESIZED.\nFragments loaded into memory.", {
      mode: "SYSTEM",
      key: sid,
      rare: true,
    });
    HOOKS.beep?.("ok");

    return true;
  } finally {
    if (url) URL.revokeObjectURL(url);
  }
}

/**
 * Smart unlock:
 * - Accepts messy input
 * - Extracts first 0x... if present
 */
export function unlockHintByKey(keyOrFragment) {
  let v = String(keyOrFragment || "").trim();
  if (!v) return;

  if (isEncryptedFragment(v)) {
    promptDecryptAndReveal(v);
    return;
  }

  const m = v.match(/0x[0-9a-f]+/i);
  if (m) v = m[0];
  v = v.toUpperCase();

  if (!VAULT_READY || !MAP || MAP.size === 0) {
    hintCard("🜏 Vault not ready.\nClick a Signal Card first (it synthesizes the vault).", {
      mode: "SYSTEM",
      key: "VAULT",
    });
    setPhase("LOCKED");
    HOOKS.beep?.("bad");
    pulseBody("vault-hit", 220);
    return;
  }

  const enc = MAP.get(v);
  if (!enc) {
    hintCard("🜏 No fragment for key: " + v, { mode: "SYSTEM", key: "MISS" });
    setPhase("MISS");
    HOOKS.beep?.("bad");
    pulseBody("vault-hit", 220);
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
    hintCard("⟡ DECRYPT CANCELLED.", { mode: "AES", key: "CANCEL" });
    return;
  }
  try {
    const hint = await decryptFragment(fragment, pass);
    hintCard(cleanFragmentText(hint), { mode: "AES", key: "DECRYPTED", rare: true });
    setStatus("decrypted");
    setPhase("DECRYPTED");
    HOOKS.beep?.("rare");
  } catch {
    hintCard("🜏 Decrypt failed (wrong key or tampered).", { mode: "SYSTEM", key: "AES" });
    setStatus("decrypt failed");
    setPhase("REJECTED");
    HOOKS.beep?.("bad");
    pulseBody("vault-hit-2", 320);
  }
}

function reveal(enc, meta) {
  if (isEncryptedFragment(enc)) return promptDecryptAndReveal(enc);

  const decoded = base64ToUtf8(enc);
  if (!decoded) {
    hintCard("🜏 Corrupted fragment.", { mode: "SYSTEM", key: "ERR" });
    setPhase("ERROR");
    HOOKS.beep?.("bad");
    pulseBody("vault-hit-2", 320);
    return;
  }

  const clean = cleanFragmentText(decoded);
  hintCard(clean, meta);

  setStatus("unlocked");
  setPhase("UNLOCKED");
  HOOKS.beep?.("ok");
  pulseBody("vault-hit", 220);
}

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

function cleanFragmentText(text) {
  const s = String(text ?? "").replace(/\r/g, "");

  const start = s.indexOf("MYRQAI_VAULT_START");
  const end = s.indexOf("MYRQAI_VAULT_END");

  if (start !== -1 && end !== -1 && end > start) {
    const inner = s.slice(start + "MYRQAI_VAULT_START".length, end).trim();
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
  card.className = "stream-item" + (isRare ? " rare" : "");

  const head = document.createElement("div");
  head.className = "stream-head";

  const title = document.createElement("div");
  title.className = "stream-title";
  const mode = (meta.mode || "SYSTEM").toUpperCase();
  title.textContent = mode;

  const metaEl = document.createElement("div");
  metaEl.className = "stream-meta";
  const key = (meta.key || "FRAGMENT").toUpperCase();
  metaEl.textContent = `${key}${isRare ? " • RARE" : ""}`;

  head.appendChild(title);
  head.appendChild(metaEl);

  const body = document.createElement("div");
  body.className = "stream-body";
  glitchType(body, hint);

  card.appendChild(head);
  card.appendChild(body);

  if (container.firstChild) container.insertBefore(card, container.firstChild);
  else container.appendChild(card);

  jumpToNewest({ force: false, smooth: true });
  if (UI.newestBtn && container.scrollTop > 80) UI.newestBtn.style.display = "inline-flex";
}