// vault-engine.js (UPDATED + FIXED)
// ✅ Fixes stage mismatch with app.js (ALERT / HINT / LOCKOUT / DESTABILIZE)
// ✅ Adds clearVaultLog() (log-only clearing) — REQUIRED by updated app.js
// ✅ Fixes "newest button" logic for PREPEND stream (shows when you scroll DOWN/away from top)
// ✅ Adds deterministic completion code + still prints VAULT OPEN at 100 fragments
// ✅ Prevents duplicate log entries (solve + unlock) safely
// ✅ FX FIX: reliably retriggers pulse + jitter so you ALWAYS see animations

import { loadImageVault } from "./image-vault.js";
import { isEncryptedFragment, decryptFragment } from "./crypto-vault.js";

export const ENGINE_VERSION = "vault-engine@2026.02.27-r8-fxfix"; // bump to confirm cache

let UI = { streamEl: null, statusEl: null, badgeEl: null, newestBtn: null };
let HOOKS = { beep: null };
let HINT_MASK = "";

let VAULT_READY = false;
let MAP = new Map();
let LAST_SYNTH_KEY = null;

// prevent double-binding if module hot reloads / re-imports
let WIRED = { newestClick: false, scrollWatch: false };

/* ================================
   Storage helpers (LOCAL ONLY, SAFE)
   ================================ */
function storageGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function storageSet(key, value) {
  try { localStorage.setItem(key, value); return true; } catch { return false; }
}
function storageRemove(key) {
  try { localStorage.removeItem(key); return true; } catch { return false; }
}

/* ================================
   Progress / Rewards (LOCAL ONLY)
   ================================ */
const STORAGE_PREFIX = "MYRQAI_VAULT";
const STORAGE_KEYS = {
  solved: `${STORAGE_PREFIX}:solved`,
  fragments: `${STORAGE_PREFIX}:fragments`,
  vaultLog: `${STORAGE_PREFIX}:vaultlog`,
  lastSeen: `${STORAGE_PREFIX}:lastSeen`,
};

const PHASE_GATES = [
  { name: "PHASE I", minFragments: 0,  from: 1,  to: 25 },
  { name: "PHASE II", minFragments: 10, from: 26, to: 50 },
  { name: "PHASE III", minFragments: 30, from: 51, to: 75 },
  { name: "PHASE IV", minFragments: 60, from: 76, to: 100 },
];

const RANKS = [
  { min: 0,   name: "OBSERVER" },
  { min: 10,  name: "LISTENER" },
  { min: 30,  name: "DECODER" },
  { min: 60,  name: "OPERATOR" },
  { min: 90,  name: "ARCHITECT" },
  { min: 100, name: "PROTOCOL COMPLETE" },
];

function safeJsonParse(s, fallback) {
  try { return JSON.parse(s); } catch { return fallback; }
}

function readSolvedMap() {
  const raw = storageGet(STORAGE_KEYS.solved);
  const obj = safeJsonParse(raw || "{}", {});
  return obj && typeof obj === "object" ? obj : {};
}
function writeSolvedMap(mapObj) {
  storageSet(STORAGE_KEYS.solved, JSON.stringify(mapObj || {}));
}

function readFragments() {
  const raw = storageGet(STORAGE_KEYS.fragments);
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}
function writeFragments(n) {
  const v = Math.max(0, Math.floor(Number(n) || 0));
  storageSet(STORAGE_KEYS.fragments, String(v));
}

function readVaultLog() {
  const raw = storageGet(STORAGE_KEYS.vaultLog);
  const arr = safeJsonParse(raw || "[]", []);
  return Array.isArray(arr) ? arr : [];
}
function writeVaultLog(arr) {
  storageSet(STORAGE_KEYS.vaultLog, JSON.stringify(Array.isArray(arr) ? arr : []));
}

function nowIso() {
  try { return new Date().toISOString(); } catch { return ""; }
}

function normSignalId(signalId) {
  return String(signalId || "").trim().toUpperCase();
}

function rankForFragments(fragments) {
  const f = Math.max(0, Math.min(100, Number(fragments) || 0));
  let best = RANKS[0].name;
  for (const r of RANKS) if (f >= r.min) best = r.name;
  return best;
}

function phaseForFragments(fragments) {
  const f = Math.max(0, Math.min(100, Number(fragments) || 0));
  let phase = PHASE_GATES[0]?.name || "PHASE I";
  for (const g of PHASE_GATES) if (f >= g.minFragments) phase = g.name;
  return phase;
}

/**
 * ✅ Exported: get a snapshot of local progress.
 */
export function getProgress() {
  const fragments = readFragments();
  const solved = readSolvedMap();
  const solvedCount = Object.keys(solved).length;
  const rank = rankForFragments(fragments);
  const phase = phaseForFragments(fragments);
  const vaultLogCount = readVaultLog().length;
  return { fragments, solvedCount, solved, rank, phase, vaultLogCount };
}

/**
 * ✅ Exported: hard reset progress (dev/admin button)
 */
export function resetProgress() {
  storageRemove(STORAGE_KEYS.solved);
  storageRemove(STORAGE_KEYS.fragments);
  storageRemove(STORAGE_KEYS.vaultLog);
  storageRemove(STORAGE_KEYS.lastSeen);

  try {
    hintCard("⟡ LOCAL VAULT RESET.\nAll fragments cleared.", { mode: "SYSTEM", key: "RESET", rare: true });
  } catch {}
  try {
    setStatus("reset");
    setPhase("RESET");
    HOOKS.beep?.("sys");
  } catch {}
}

/**
 * ✅ Exported: clear vault log only (used by app.js "CLEAR LOG")
 */
export function clearVaultLog() {
  writeVaultLog([]);
  try {
    hintCard("⟡ VAULT LOG CLEARED.\nFragments remain intact.", { mode: "SYSTEM", key: "LOG", rare: true });
    setStatus("log cleared");
    HOOKS.beep?.("sys");
  } catch {}
}

/**
 * ✅ Exported: gate check helper for UI list.
 * Provide signalIndex (1..100)
 */
export function isSignalUnlocked(signalIndex) {
  const idx = Math.max(1, Math.floor(Number(signalIndex) || 1));
  const f = readFragments();
  for (const g of PHASE_GATES) {
    if (idx >= g.from && idx <= g.to) return f >= g.minFragments;
  }
  return true;
}

/* ================================
   ✅ FX helpers (retrigger-safe)
   ================================ */
function forceReflow() {
  try { void document.body.offsetHeight; } catch {}
}

function pulseBody(cls, ms = 260) {
  try {
    // retrigger even if class already present
    document.body.classList.remove(cls);
    forceReflow();
    document.body.classList.add(cls);
    setTimeout(() => document.body.classList.remove(cls), ms);
  } catch {}
}

let _jitterN = 0;
function jitterBody(ms = 900) {
  // uses your CSS: body[class*="signal-jitter-"] { animation: jitter ... }
  try {
    // remove any existing jitter classes
    const all = Array.from(document.body.classList);
    for (const c of all) {
      if (c.startsWith("signal-jitter-")) document.body.classList.remove(c);
    }
    forceReflow();

    _jitterN = (_jitterN + 1) % 9;
    const cls = `signal-jitter-${_jitterN}`;
    document.body.classList.add(cls);
    setTimeout(() => document.body.classList.remove(cls), ms);
  } catch {}
}

/**
 * ✅ Exported: mark solved + add fragment (idempotent per signal_id).
 */
export function onSolveSuccess(meta = {}) {
  const sid = normSignalId(meta.signal_id);
  if (!sid) return { ok: false, reason: "missing signal_id" };

  const solved = readSolvedMap();
  const already = Boolean(solved[sid]);

  // 1) mark solved
  solved[sid] = true;
  writeSolvedMap(solved);

  // 2) fragment increment only once per signal_id
  let fragments = readFragments();
  if (!already) fragments = Math.min(100, fragments + 1);
  writeFragments(fragments);

  // 3) decode + archive payload (Vault Log) if present (dedupe)
  const payloadLine = String(meta.secret_payload || "").trim(); // "0x112::<b64>"
  if (payloadLine) {
    const entry = decodeSecretPayloadToEntry(payloadLine, {
      signal_id: sid,
      title: meta.title || "",
      transmission_type: meta.transmission_type || "",
      difficulty: meta.difficulty,
    });

    if (entry && entry.text) {
      const log = readVaultLog();
      const exists = log.some((x) => normSignalId(x?.signal_id) === sid);
      if (!exists) {
        log.unshift(entry); // newest first
        writeVaultLog(log);
      }
    }
  }

  const rank = rankForFragments(fragments);
  const phase = phaseForFragments(fragments);

  // ✅ MAKE IT OBVIOUS (these exist in your CSS)
  pulseBody("vault-hit", 260);
  jitterBody(900);
  if (rank === "PROTOCOL COMPLETE" || fragments >= 100) pulseBody("vault-hit-2", 420);

  setStatus(`verified • ${rank} • ${fragments}/100`);
  HOOKS.beep?.(rank === "PROTOCOL COMPLETE" ? "rare" : "ok");

  const msg =
    `✅ VERIFIED: ${sid}\n` +
    (already ? "⟡ Duplicate solve ignored.\n" : "⟡ Fragment acquired.\n") +
    `⟡ Rank: ${rank}\n` +
    `⟡ Phase: ${phase}\n` +
    `⟡ Progress: ${fragments}/100`;

  hintCard(msg, { mode: "SYSTEM", key: sid, rare: true });

  if (fragments >= 100) {
    const code = makeCompletionCode(Object.keys(solved).sort());
    hintCard(
      "🜏 VAULT OPEN.\nPROTOCOL COMPLETE.\n\nCLEARANCE CARD:\n" +
        `RANK: ${rank}\n` +
        `CODE: ${code}\n\n` +
        "⟡ Screenshot this as proof.",
      { mode: "SYSTEM", key: "VAULT", rare: true }
    );
    pulseBody("vault-hit-2", 520);
    jitterBody(1200);
  }

  return { ok: true, already, fragments, rank, phase };
}

/**
 * ✅ Exported: read vault log entries for UI panel.
 */
export function getVaultLog() {
  return readVaultLog(); // newest first
}

/* deterministic completion code (not secret, just reward proof) */
function makeCompletionCode(sortedSignalIds) {
  const s = String(sortedSignalIds.join("|") || "EMPTY");
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  const hex = (h >>> 0).toString(16).padStart(8, "0").toUpperCase();
  return `VAULT-${hex}`;
}

function decodeSecretPayloadToEntry(secretPayload, meta = {}) {
  // Format: "0x112::<base64>"
  const s = String(secretPayload || "").trim();
  const i = s.indexOf("::");
  if (i <= 0) return null;

  const signal_id = normSignalId(s.slice(0, i));
  const b64 = s.slice(i + 2).trim();
  if (!signal_id || !b64) return null;

  const decoded = base64ToUtf8(b64);
  if (!decoded) return null;

  const text = cleanFragmentText(decoded);
  return {
    signal_id: meta.signal_id || signal_id,
    title: String(meta.title || "").trim(),
    text,
    transmission_type: String(meta.transmission_type || "").trim(),
    difficulty: Number(meta.difficulty) || null,
    ts: nowIso(),
  };
}

/* ================================
   Failure engine
   ================================ */
const FAIL = { bySignal: new Map() };

function sigKey(signalId) {
  return String(signalId || "UNKNOWN").toUpperCase();
}
function bumpFail(signalId) {
  const k = sigKey(signalId);
  const n = (FAIL.bySignal.get(k) || 0) + 1;
  FAIL.bySignal.set(k, n);
  return n;
}

function leakSnippet(maxLen) {
  const leak = (HINT_MASK || "").trim();
  if (!leak) return "";
  const s = leak.slice(0, Math.min(maxLen, leak.length));
  return s + (leak.length > maxLen ? "…" : "");
}

/**
 * ✅ EXPORT
 * Returns:
 *  { count, stage: "DENIED"|"ALERT"|"HINT"|"DESTABILIZE"|"LOCKOUT", snippet }
 */
export function vaultReject(signalId = "UNKNOWN", difficulty = 1) {
  const n = bumpFail(signalId);

  setPhase("REJECTED");
  setStatus("incorrect");
  HOOKS.beep?.("bad");

  // ✅ Use only classes that exist in your CSS
  pulseBody("vault-hit", 220);
  jitterBody(700);

  if (n >= 20) {
    hintCard("⚠ LOCKOUT.\nToo many failures.\nSession termination imminent.", { mode: "SYSTEM", key: "LOCKOUT", rare: true });
    pulseBody("vault-hit-2", 420);
    jitterBody(1200);
    return { count: n, stage: "LOCKOUT", snippet: "SESSION TERMINATED" };
  }

  if (n === 1) {
    hintCard("🜏 ACCESS DENIED.\nHash mismatch detected.", { mode: "SYSTEM", key: "DENIED" });
    return { count: n, stage: "DENIED", snippet: "" };
  }

  if (n === 2) {
    hintCard("⟡ SECOND FAILURE.\nIntegrity countermeasures active.", { mode: "SYSTEM", key: "ALERT", rare: true });
    pulseBody("vault-hit-2", 320);
    return { count: n, stage: "ALERT", snippet: "" };
  }

  if (n === 3) {
    const snippet = leakSnippet(130);
    hintCard(
      "⟡ HINT LEAK (ATTEMPT 3).\nA portion slips through." +
        (snippet ? `\n⟡ ${snippet}` : "\n⟡ (No mask available.)"),
      { mode: "SYSTEM", key: "HINT", rare: true }
    );
    pulseBody("vault-hit-2", 360);
    jitterBody(900);
    return { count: n, stage: "HINT", snippet };
  }

  const snippet = leakSnippet(70);
  hintCard(
    "⟡ DESTABILIZING.\nMultiple failures detected.\nStop brute-forcing. Re-interpret the prompt." +
      (snippet ? `\n⟡ LEAK: ${snippet}` : ""),
    { mode: "SYSTEM", key: `FAILx${n}`, rare: true }
  );
  pulseBody("vault-hit-2", 320);
  jitterBody(800);
  return { count: n, stage: "DESTABILIZE", snippet: snippet ? `LEAK: ${snippet}` : "" };
}

/**
 * ✅ EXPORT
 */
export function resetRejectCounter(signalId = "UNKNOWN") {
  FAIL.bySignal.delete(sigKey(signalId));
}

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
    const p = getProgress();
    console.log(`[${ENGINE_VERSION}] loaded`, {
      stream: !!UI.streamEl,
      status: !!UI.statusEl,
      badge: !!UI.badgeEl,
      newestBtn: !!UI.newestBtn,
      progress: { fragments: p.fragments, rank: p.rank, phase: p.phase, solved: p.solvedCount },
    });
  } catch {}

  try {
    const p = getProgress();
    if (UI.badgeEl) UI.badgeEl.innerText = "READY";
    if (UI.statusEl) UI.statusEl.innerText = `ready • ${p.rank} • ${p.fragments}/100`;
  } catch {}

  if (UI.newestBtn && !WIRED.newestClick) {
    WIRED.newestClick = true;
    UI.newestBtn.addEventListener("click", () => jumpToNewest({ force: true }));
  }

  // ✅ PREPEND stream means NEWEST is at scrollTop=0.
  if (UI.streamEl && UI.newestBtn && !WIRED.scrollWatch) {
    WIRED.scrollWatch = true;
    const onScroll = () => {
      const awayFromNewest = UI.streamEl.scrollTop > 80;
      UI.newestBtn.style.display = awayFromNewest ? "inline-flex" : "none";
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

    hintCard("⟡ VAULT SYNTHESIZED.\nFragments loaded into memory.", { mode: "SYSTEM", key: sid, rare: true });
    HOOKS.beep?.("ok");
    pulseBody("vault-hit", 240);
    jitterBody(800);

    return true;
  } finally {
    if (url) URL.revokeObjectURL(url);
  }
}

/**
 * Smart unlock
 */
export function unlockHintByKey(keyOrFragment) {
  let v = String(keyOrFragment || "").trim();
  if (!v) return;

  const kv = v.match(/^(0x[0-9a-f]+)\s*::\s*(.+)$/i);
  if (kv) {
    const key = kv[1].toUpperCase();
    const value = kv[2].trim();
    reveal(value, { mode: "DEV", key, signal_id: key, title: "" });
    return;
  }

  if (isEncryptedFragment(v)) {
    promptDecryptAndReveal(v);
    return;
  }

  const m = v.match(/0x[0-9a-f]+/i);
  if (m) v = m[0];
  v = v.toUpperCase();

  if (!VAULT_READY || !MAP || MAP.size === 0) {
    hintCard("🜏 Vault not ready.\nClick a Signal Card first (it synthesizes the vault).", { mode: "SYSTEM", key: "VAULT" });
    setPhase("LOCKED");
    HOOKS.beep?.("bad");
    pulseBody("vault-hit", 220);
    jitterBody(700);
    return;
  }

  const enc = MAP.get(v);
  if (!enc) {
    hintCard("🜏 No fragment for key: " + v, { mode: "SYSTEM", key: "MISS" });
    setPhase("MISS");
    HOOKS.beep?.("bad");
    pulseBody("vault-hit", 220);
    jitterBody(700);
    return;
  }

  reveal(enc, { mode: "VAULT", key: v, signal_id: v, title: "" });
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
    pulseBody("vault-hit-2", 360);
    jitterBody(1000);
  } catch (e) {
    // show exact reason in console (helps you debug)
    console.warn("[decrypt] failed:", e?.message || e);
    hintCard("🜏 Decrypt failed (wrong key or tampered).", { mode: "SYSTEM", key: "AES" });
    setStatus("decrypt failed");
    setPhase("REJECTED");
    HOOKS.beep?.("bad");
    pulseBody("vault-hit-2", 320);
    jitterBody(900);
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
    jitterBody(900);
    return;
  }

  const clean = cleanFragmentText(decoded);
  hintCard(clean, meta);

  // Archive to Vault Log if a signal_id is known (dedupe)
  try {
    const sid = normSignalId(meta?.signal_id || meta?.key || "");
    if (sid && sid.startsWith("0X")) {
      const log = readVaultLog();
      const exists = log.some((x) => normSignalId(x?.signal_id) === sid);
      if (!exists) {
        log.unshift({
          signal_id: sid,
          title: String(meta?.title || "").trim(),
          text: clean,
          transmission_type: String(meta?.mode || "").trim(),
          difficulty: null,
          ts: nowIso(),
        });
        writeVaultLog(log);
      }
    }
  } catch {}

  setStatus("unlocked");
  setPhase("UNLOCKED");
  HOOKS.beep?.("ok");
  pulseBody("vault-hit", 240);
  jitterBody(800);
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

  // PREPEND newest
  if (container.firstChild) container.insertBefore(card, container.firstChild);
  else container.appendChild(card);

  // If user is already away from top, show button; otherwise keep them at top
  if (UI.newestBtn) {
    const away = container.scrollTop > 80;
    UI.newestBtn.style.display = away ? "inline-flex" : "none";
  }

  jumpToNewest({ force: false, smooth: true });
}